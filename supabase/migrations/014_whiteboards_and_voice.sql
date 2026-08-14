-- ===========================================================================
-- WHITEBOARDS AND VOICE ROOMS — Luman v2 desktop
-- ===========================================================================
--
-- Adds two features, both scoped the same way channels are (organisation-wide
-- or workspace-specific) so the navigation model matches what already exists.
--
--   whiteboards        a shared drawing surface, persisted as JSON scenes
--   voice_rooms        an ephemeral audio room with a 2-minute idle lifetime
--
-- WHAT THIS TOUCHES
--   Only new tables. No existing table, policy or function is altered or
--   dropped, matching the additive rule migration 012 set out: this database
--   is SHARED with the Luman and Luman-Desktop apps and RLS is a property of
--   the database rather than of one app.
--
-- DEPENDENCY NOTE
--   012 defines public.can_access_channel(). This file does NOT call it — the
--   scoping rules are the same but the subject differs, so it defines its own
--   predicates against its own tables. Applying this without 012 works; the
--   two are independent.
--
-- REALTIME
--   Whiteboard strokes and voice signalling both travel over Supabase Realtime
--   *broadcast*, which does not touch these tables — broadcast is transient and
--   authorised per-channel by the client's own session. The tables here are the
--   durable half: the saved scene, and the room roster that survives a reload.
--   `whiteboards` is added to the supabase_realtime publication so a scene save
--   by one person reaches everyone else's canvas.
--
-- ROLLBACK is at the bottom of this file.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- whiteboards
-- ---------------------------------------------------------------------------
-- Same two-way scoping as channels, with the same CHECK making the invalid
-- combinations unrepresentable:
--
--   scope = 'organization' -> organization_id set, workspace_id null
--   scope = 'workspace'    -> organization_id set, workspace_id set
--
-- `scene` holds the full element list as JSONB. Storing the whole scene rather
-- than an append-only stroke log is deliberate: a board is read far more often
-- than it is written, and reconstructing one from ten thousand stroke rows on
-- every open would be markedly slower than reading a single document. Live
-- collaboration still travels stroke-by-stroke over broadcast; this column is
-- the durable snapshot that a late joiner loads.
create table if not exists public.whiteboards (
  id               uuid primary key default gen_random_uuid(),
  scope            text        not null check (scope in ('organization', 'workspace')),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  workspace_id     uuid                 references public.workspaces(id)    on delete cascade,
  name             text        not null check (length(trim(name)) between 1 and 80),
  scene            jsonb       not null default '{"elements":[]}'::jsonb,
  created_by       uuid                 references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid                 references auth.users(id) on delete set null,
  archived_at      timestamptz,

  constraint whiteboards_scope_workspace_consistency check (
    (scope = 'organization' and workspace_id is null) or
    (scope = 'workspace'    and workspace_id is not null)
  )
);

-- Two partial unique indexes rather than one UNIQUE(...): NULLs are distinct
-- in a Postgres unique constraint, so a single constraint would allow two
-- org-level boards both called "Roadmap".
--
-- SUPERSEDED BY 015, which narrows these to one board per container.
create unique index if not exists whiteboards_unique_org_name
  on public.whiteboards (organization_id, lower(name))
  where scope = 'organization' and archived_at is null;

create unique index if not exists whiteboards_unique_workspace_name
  on public.whiteboards (workspace_id, lower(name))
  where scope = 'workspace' and archived_at is null;

create index if not exists whiteboards_org_idx       on public.whiteboards (organization_id);
create index if not exists whiteboards_workspace_idx on public.whiteboards (workspace_id);

-- ---------------------------------------------------------------------------
-- voice_rooms
-- ---------------------------------------------------------------------------
-- An ephemeral audio room. At most one live room per scope container, which is
-- what makes "join the call" unambiguous — the partial unique indexes below
-- enforce that rather than leaving it to the app.
--
-- `expires_at` is the 2-minute idle deadline. It is extended each time somebody
-- joins or speaks, and a room past its deadline is treated as closed by both
-- the RLS-visible queries and the client. Sweeping is lazy (see the helper
-- below) rather than a scheduled job, because pg_cron is not guaranteed to be
-- available on every Supabase plan.
create table if not exists public.voice_rooms (
  id               uuid primary key default gen_random_uuid(),
  scope            text        not null check (scope in ('organization', 'workspace')),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  workspace_id     uuid                 references public.workspaces(id)    on delete cascade,
  started_by       uuid                 references auth.users(id) on delete set null,
  started_at       timestamptz not null default now(),
  -- The idle deadline. Two minutes from the last activity.
  expires_at       timestamptz not null default (now() + interval '2 minutes'),
  closed_at        timestamptz,

  constraint voice_rooms_scope_workspace_consistency check (
    (scope = 'organization' and workspace_id is null) or
    (scope = 'workspace'    and workspace_id is not null)
  )
);

-- At most one open room per container.
create unique index if not exists voice_rooms_one_open_per_org
  on public.voice_rooms (organization_id)
  where scope = 'organization' and closed_at is null;

create unique index if not exists voice_rooms_one_open_per_workspace
  on public.voice_rooms (workspace_id)
  where scope = 'workspace' and closed_at is null;

create index if not exists voice_rooms_org_idx on public.voice_rooms (organization_id);

-- ---------------------------------------------------------------------------
-- voice_participants
-- ---------------------------------------------------------------------------
-- Who is in the room. Persisted rather than kept purely in Realtime presence
-- so that "did everyone leave?" is answerable server-side — presence alone
-- vanishes when the last tab closes, taking the evidence with it.
create table if not exists public.voice_participants (
  room_id    uuid        not null references public.voice_rooms(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)         on delete cascade,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,

  primary key (room_id, user_id)
);

create index if not exists voice_participants_room_idx on public.voice_participants (room_id);

-- ---------------------------------------------------------------------------
-- Access predicates
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the policy can read organization_members and workspaces
-- without the caller needing rights on them. Returns only a boolean, and
-- nothing the caller could not infer by asking whether the row loads at all.
--
-- The workspace rule is spelled out rather than delegated: a personal
-- workspace (organization_id null) belongs to its owner or creator; an
-- organisation workspace is reachable by any member.
create or replace function public.can_access_scope(
  p_scope        text,
  p_org_id       uuid,
  p_workspace_id uuid,
  p_user_id      uuid default auth.uid()
)
returns boolean
security definer
set search_path = public
language plpgsql
stable
as $$
declare
  v_ws_org_id  uuid;
  v_owner_id   uuid;
  v_created_by uuid;
begin
  if p_user_id is null or p_org_id is null then
    return false;
  end if;

  if p_scope = 'organization' then
    return exists (
      select 1 from organization_members om
       where om.organization_id = p_org_id
         and om.user_id = p_user_id
    );
  end if;

  if p_workspace_id is null then
    return false;
  end if;

  select w.organization_id, w.owner_id, w.created_by
    into v_ws_org_id, v_owner_id, v_created_by
    from workspaces w
   where w.id = p_workspace_id;

  if not found then
    return false;
  end if;

  if v_ws_org_id is null then
    return v_owner_id = p_user_id or v_created_by = p_user_id;
  end if;

  return exists (
    select 1 from organization_members om
     where om.organization_id = v_ws_org_id
       and om.user_id = p_user_id
  );
end;
$$;

comment on function public.can_access_scope(text, uuid, uuid, uuid) is
  'True when the user may see rows scoped to this organisation or workspace. Used by whiteboard and voice policies.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.whiteboards        enable row level security;
alter table public.voice_rooms        enable row level security;
alter table public.voice_participants enable row level security;

drop policy if exists "whiteboards readable by scope members"  on public.whiteboards;
drop policy if exists "whiteboards insertable by scope members" on public.whiteboards;
drop policy if exists "whiteboards updatable by scope members"  on public.whiteboards;

create policy "whiteboards readable by scope members" on public.whiteboards
  for select using (
    public.can_access_scope(scope, organization_id, workspace_id, auth.uid())
  );

-- created_by is pinned to the caller so a row cannot be attributed to somebody
-- else on the way in.
create policy "whiteboards insertable by scope members" on public.whiteboards
  for insert with check (
    created_by = auth.uid()
    and public.can_access_scope(scope, organization_id, workspace_id, auth.uid())
  );

-- Anyone who can open a board can draw on it. That is the point of a shared
-- board, and a per-element author check would make erasing someone else's
-- stroke impossible.
create policy "whiteboards updatable by scope members" on public.whiteboards
  for update using (public.can_access_scope(scope, organization_id, workspace_id, auth.uid()))
       with check (public.can_access_scope(scope, organization_id, workspace_id, auth.uid()));

drop policy if exists "voice rooms readable by scope members"  on public.voice_rooms;
drop policy if exists "voice rooms insertable by scope members" on public.voice_rooms;
drop policy if exists "voice rooms updatable by scope members"  on public.voice_rooms;

create policy "voice rooms readable by scope members" on public.voice_rooms
  for select using (
    public.can_access_scope(scope, organization_id, workspace_id, auth.uid())
  );

create policy "voice rooms insertable by scope members" on public.voice_rooms
  for insert with check (
    started_by = auth.uid()
    and public.can_access_scope(scope, organization_id, workspace_id, auth.uid())
  );

-- Any participant can extend or close the room: the last person to leave has
-- to be able to close it, and they are rarely the one who started it.
create policy "voice rooms updatable by scope members" on public.voice_rooms
  for update using (public.can_access_scope(scope, organization_id, workspace_id, auth.uid()))
       with check (public.can_access_scope(scope, organization_id, workspace_id, auth.uid()));

drop policy if exists "voice participants readable by room members" on public.voice_participants;
drop policy if exists "voice participants insertable by self"       on public.voice_participants;
drop policy if exists "voice participants updatable by self"        on public.voice_participants;

create policy "voice participants readable by room members" on public.voice_participants
  for select using (
    exists (
      select 1 from voice_rooms r
       where r.id = voice_participants.room_id
         and public.can_access_scope(r.scope, r.organization_id, r.workspace_id, auth.uid())
    )
  );

-- You may only add or remove yourself.
create policy "voice participants insertable by self" on public.voice_participants
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from voice_rooms r
       where r.id = voice_participants.room_id
         and public.can_access_scope(r.scope, r.organization_id, r.workspace_id, auth.uid())
    )
  );

create policy "voice participants updatable by self" on public.voice_participants
  for update using (user_id = auth.uid())
       with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Lazy expiry sweep
-- ---------------------------------------------------------------------------
-- Closes rooms whose deadline has passed, or whose participants have all left.
-- Called by the app when it lists rooms, so no scheduler is required: the only
-- moment a stale room matters is when somebody is looking at the list.
create or replace function public.close_expired_voice_rooms()
returns void
security definer
set search_path = public
language sql
as $$
  update voice_rooms r
     set closed_at = now()
   where r.closed_at is null
     and (
       r.expires_at <= now()
       or not exists (
         select 1 from voice_participants p
          where p.room_id = r.id and p.left_at is null
       ) and r.started_at < now() - interval '10 seconds'
     );
$$;

comment on function public.close_expired_voice_rooms() is
  'Lazily closes idle or empty voice rooms. Called on list rather than scheduled, so no pg_cron dependency.';

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Whiteboard scene saves flow to other open canvases. Realtime respects RLS,
-- so the SELECT policy above is what stops a subscriber receiving a board they
-- cannot open.
--
-- voice_rooms is published too, so a room appearing or closing updates every
-- desktop's call indicator without polling.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whiteboards'
  ) then
    alter publication supabase_realtime add table public.whiteboards;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'voice_rooms'
  ) then
    alter publication supabase_realtime add table public.voice_rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'voice_participants'
  ) then
    alter publication supabase_realtime add table public.voice_participants;
  end if;
end $$;

commit;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--   begin;
--   alter publication supabase_realtime drop table public.voice_participants;
--   alter publication supabase_realtime drop table public.voice_rooms;
--   alter publication supabase_realtime drop table public.whiteboards;
--
--   drop policy if exists "voice participants updatable by self"        on public.voice_participants;
--   drop policy if exists "voice participants insertable by self"       on public.voice_participants;
--   drop policy if exists "voice participants readable by room members" on public.voice_participants;
--   drop policy if exists "voice rooms updatable by scope members"      on public.voice_rooms;
--   drop policy if exists "voice rooms insertable by scope members"     on public.voice_rooms;
--   drop policy if exists "voice rooms readable by scope members"       on public.voice_rooms;
--   drop policy if exists "whiteboards updatable by scope members"      on public.whiteboards;
--   drop policy if exists "whiteboards insertable by scope members"     on public.whiteboards;
--   drop policy if exists "whiteboards readable by scope members"       on public.whiteboards;
--
--   drop function if exists public.close_expired_voice_rooms();
--   drop function if exists public.can_access_scope(text, uuid, uuid, uuid);
--
--   drop table if exists public.voice_participants;
--   drop table if exists public.voice_rooms;
--   drop table if exists public.whiteboards;
--   commit;
