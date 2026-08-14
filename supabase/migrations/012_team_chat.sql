-- ===========================================================================
-- TEAM CHAT — organisation and workspace channels. Phase 1.
-- ===========================================================================
--
-- Adds real-time team messaging: channels that belong either to a whole
-- organisation or to a single workspace, and the messages inside them.
--
-- WHAT THIS TOUCHES
--   Only new tables. No existing table, policy or function is altered or
--   dropped. That is deliberate: `.env.local` notes this database is SHARED
--   with the Luman and Luman-Desktop apps, and RLS is a property of the
--   database rather than of one app. Everything below is additive, so applying
--   it cannot change what any existing screen can see.
--
-- DEPENDENCY NOTE — read before applying
--   migrations/011 defines public.can_access_workspace(), and its own header
--   says it is a proposal that may never have been applied. This file
--   therefore does NOT call it. It defines its own predicate,
--   public.can_access_channel(), which inlines the same two workspace rules
--   (personal -> owner/creator, organisation -> any member) rather than
--   depending on a function that may not exist.
--
--   If 011 is applied later, nothing here breaks: the two functions are
--   independent and agree on the rules. `create or replace` is not used on
--   can_access_workspace anywhere in this file.
--
-- REALTIME
--   The app subscribes to `messages` over Supabase Realtime. Realtime respects
--   RLS, so the policies below are what stop a subscriber receiving messages
--   from a channel they cannot open. The final section adds the table to the
--   `supabase_realtime` publication, which is what makes change events flow at
--   all. Both halves are required.
--
-- ROLLBACK is at the bottom of this file.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------------------
-- A channel is scoped one of two ways, and the CHECK constraint makes the
-- invalid combinations unrepresentable rather than merely discouraged:
--
--   scope = 'organization' -> organization_id set, workspace_id null
--   scope = 'workspace'    -> organization_id set, workspace_id set
--
-- organization_id is stored on workspace-scoped rows too, even though it is
-- derivable through workspaces. That denormalisation is what lets the sidebar
-- list every channel for an org in one indexed query, and lets the RLS
-- predicate answer the organisation case without a join.
create table if not exists public.channels (
  id               uuid primary key default gen_random_uuid(),
  scope            text        not null check (scope in ('organization', 'workspace')),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  workspace_id     uuid                 references public.workspaces(id)    on delete cascade,
  name             text        not null check (length(trim(name)) between 1 and 80),
  topic            text,
  is_default       boolean     not null default false,
  created_by       uuid                 references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  archived_at      timestamptz,

  constraint channels_scope_workspace_consistency check (
    (scope = 'organization' and workspace_id is null) or
    (scope = 'workspace'    and workspace_id is not null)
  )
);

-- Channel names are unique per scope container. Two partial unique indexes
-- rather than one UNIQUE(organization_id, workspace_id, name): in Postgres,
-- NULLs are distinct in a unique constraint, so the single-constraint version
-- would happily allow two org-level channels both called "general".
create unique index if not exists channels_unique_org_name
  on public.channels (organization_id, lower(name))
  where scope = 'organization';

create unique index if not exists channels_unique_workspace_name
  on public.channels (workspace_id, lower(name))
  where scope = 'workspace';

create index if not exists channels_org_idx       on public.channels (organization_id);
create index if not exists channels_workspace_idx on public.channels (workspace_id) where workspace_id is not null;

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
-- content is Tiptap document JSON, the same convention notes.content follows.
-- content_text is a plain-text projection written at insert time, used for
-- channel-list previews and (later) notification bodies. It is NOT a search
-- index — full-text search is deliberately out of scope for v1.
--
-- parent_message_id models threads. A reply always points at the THREAD ROOT,
-- never at another reply, so "every reply in this thread" is one indexed
-- lookup instead of a recursive walk. Phase 1 ships no threading UI, but the
-- column exists from the start so Phase 2 needs no migration.
--
-- deleted_at is a soft delete. Hard deletes would cascade away the replies and
-- reactions hanging off a message; a tombstone lets the UI keep a thread
-- intact under a "message deleted" placeholder.
create table if not exists public.messages (
  id                 uuid        primary key default gen_random_uuid(),
  channel_id         uuid        not null references public.channels(id) on delete cascade,
  parent_message_id  uuid                 references public.messages(id) on delete cascade,
  author_id          uuid                 references auth.users(id)      on delete set null,
  content            jsonb       not null,
  content_text       text        not null default '',
  created_at         timestamptz not null default now(),
  edited_at          timestamptz,
  deleted_at         timestamptz
);

-- The channel history query: newest-first within a channel, top-level only,
-- tombstones excluded. Ordering by (created_at, id) rather than created_at
-- alone gives the keyset pagination a total order — two messages sent inside
-- the same clock tick would otherwise be able to straddle a page boundary and
-- be returned twice, or skipped.
create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at desc, id desc)
  where deleted_at is null and parent_message_id is null;

create index if not exists messages_thread_idx
  on public.messages (parent_message_id, created_at asc)
  where parent_message_id is not null;

-- ---------------------------------------------------------------------------
-- Access predicate
-- ---------------------------------------------------------------------------
-- Answers one question: may this user open this channel?
--
--   organisation channel -> any member of that organisation
--   workspace channel    -> personal workspace: its owner or creator
--                           org workspace:      any member of that org
--
-- The workspace half intentionally mirrors can_access_workspace() in 011 and
-- check_note_visibility() in 010. It is inlined rather than delegated for the
-- reason given in the header: 011 may never have been applied.
--
-- SECURITY DEFINER so the lookup is not itself filtered by the caller's RLS on
-- channels / workspaces / organization_members. That is what avoids the
-- policy-recursion that migrations 005 and 006 were written to fix: a policy on
-- `messages` that read `channels` directly would re-enter the channels policy,
-- which reads organization_members, which has a policy of its own.
--
-- It returns only a boolean and reads nothing the caller could not infer by
-- asking whether the channel loads at all.
create or replace function public.can_access_channel(
  p_channel_id uuid,
  p_user_id    uuid default auth.uid()
)
returns boolean
security definer
set search_path = public
language plpgsql
stable
as $$
declare
  v_scope        text;
  v_org_id       uuid;
  v_workspace_id uuid;
  v_ws_org_id    uuid;
  v_owner_id     uuid;
  v_created_by   uuid;
begin
  if p_channel_id is null or p_user_id is null then
    return false;
  end if;

  select c.scope, c.organization_id, c.workspace_id
    into v_scope, v_org_id, v_workspace_id
    from channels c
   where c.id = p_channel_id;

  if not found then
    return false;
  end if;

  -- Organisation channel: membership of the owning org is the whole rule.
  if v_scope = 'organization' then
    return exists (
      select 1
        from organization_members om
       where om.organization_id = v_org_id
         and om.user_id = p_user_id
    );
  end if;

  -- Workspace channel.
  select w.organization_id, w.owner_id, w.created_by
    into v_ws_org_id, v_owner_id, v_created_by
    from workspaces w
   where w.id = v_workspace_id;

  if not found then
    return false;
  end if;

  if v_ws_org_id is null then
    return (v_owner_id = p_user_id or v_created_by = p_user_id);
  end if;

  return exists (
    select 1
      from organization_members om
     where om.organization_id = v_ws_org_id
       and om.user_id = p_user_id
  );
end;
$$;

comment on function public.can_access_channel(uuid, uuid) is
  'True when the user may open a chat channel: any org member for organisation-scoped channels; the workspace''s own access rule for workspace-scoped ones. Used by the channels and messages RLS policies.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.channels enable row level security;
alter table public.messages enable row level security;

drop policy if exists "channels readable by scope members"  on public.channels;
drop policy if exists "channels insertable by scope members" on public.channels;
drop policy if exists "channels updatable by scope members"  on public.channels;

-- Reading a channel and creating one are governed by the same question — can
-- you reach the container it lives in — so SELECT and INSERT share a predicate.
-- INSERT additionally pins created_by to the caller, so a row cannot be
-- attributed to someone else.
create policy "channels readable by scope members" on public.channels
  for select using (
    case
      when scope = 'organization' then exists (
        select 1 from organization_members om
         where om.organization_id = channels.organization_id
           and om.user_id = auth.uid()
      )
      else public.can_access_channel(channels.id, auth.uid())
    end
  );

-- Note this predicate cannot call can_access_channel(): during INSERT the row
-- is not yet visible to a SECURITY DEFINER function's snapshot, which is the
-- same MVCC trap migration 010 hit with check_note_visibility and RETURNING.
-- The workspace rule is therefore spelled out against the incoming values.
create policy "channels insertable by scope members" on public.channels
  for insert with check (
    created_by = auth.uid()
    and case
      when scope = 'organization' then exists (
        select 1 from organization_members om
         where om.organization_id = channels.organization_id
           and om.user_id = auth.uid()
      )
      else exists (
        select 1 from workspaces w
         where w.id = channels.workspace_id
           and (
             (w.organization_id is null and (w.owner_id = auth.uid() or w.created_by = auth.uid()))
             or exists (
               select 1 from organization_members om
                where om.organization_id = w.organization_id
                  and om.user_id = auth.uid()
             )
           )
      )
    end
  );

-- Rename / set topic / archive. No DELETE policy: channels are archived
-- (archived_at), not removed, so that their message history cannot be
-- destroyed by a single click.
create policy "channels updatable by scope members" on public.channels
  for update using (public.can_access_channel(channels.id, auth.uid()))
       with check (public.can_access_channel(channels.id, auth.uid()));

drop policy if exists "messages readable by channel members"  on public.messages;
drop policy if exists "messages insertable by channel members" on public.messages;
drop policy if exists "messages updatable by author"           on public.messages;

create policy "messages readable by channel members" on public.messages
  for select using (public.can_access_channel(messages.channel_id, auth.uid()));

create policy "messages insertable by channel members" on public.messages
  for insert with check (
    author_id = auth.uid()
    and public.can_access_channel(messages.channel_id, auth.uid())
  );

-- Editing and deleting are the same operation to Postgres here: a delete sets
-- deleted_at, so it is an UPDATE. Restricting UPDATE to the author therefore
-- covers both. The absence of a DELETE policy is the point — with RLS on and
-- no such policy, no ordinary client can hard-delete a message at all.
create policy "messages updatable by author" on public.messages
  for update using (author_id = auth.uid() and public.can_access_channel(messages.channel_id, auth.uid()))
       with check (author_id = auth.uid() and public.can_access_channel(messages.channel_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
-- Without this, the policies above are correct and no change events are ever
-- delivered — the client would show nothing until a manual refresh. Guarded so
-- re-running the file is harmless: adding a table already in the publication
-- is an error, not a no-op.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
    raise notice 'messages added to supabase_realtime publication';
  else
    raise notice 'messages already in supabase_realtime publication';
  end if;
exception
  when undefined_object then
    -- No supabase_realtime publication on this database (self-hosted setups
    -- sometimes name it differently). Surface it rather than failing the
    -- migration: every policy above is still correct, only live delivery is
    -- missing, and it can be enabled from the dashboard afterwards.
    raise notice 'publication supabase_realtime not found — enable Realtime for public.messages from the dashboard';
end $$;

commit;

-- ===========================================================================
-- ROLLBACK — run this if anything above misbehaves.
-- ===========================================================================
--
-- begin;
--   alter publication supabase_realtime drop table public.messages;
--   drop policy if exists "messages readable by channel members"  on public.messages;
--   drop policy if exists "messages insertable by channel members" on public.messages;
--   drop policy if exists "messages updatable by author"           on public.messages;
--   drop policy if exists "channels readable by scope members"     on public.channels;
--   drop policy if exists "channels insertable by scope members"   on public.channels;
--   drop policy if exists "channels updatable by scope members"    on public.channels;
--   drop table if exists public.messages;
--   drop table if exists public.channels;
--   drop function if exists public.can_access_channel(uuid, uuid);
-- commit;
