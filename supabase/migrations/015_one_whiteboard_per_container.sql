-- ===========================================================================
-- ONE WHITEBOARD PER CONTAINER
-- ===========================================================================
--
-- 014 allowed any number of boards per organisation or workspace, unique only
-- by name. That is an invitation to fill the sidebar with junk. This migration
-- narrows it to exactly one board per container: one for the organisation, one
-- per workspace, created on first open and never listed as a choice.
--
-- Enforced by unique indexes rather than app logic, so no client — however it
-- is driven — can create a second.
--
-- SAFE TO RE-RUN. Idempotent throughout.
--
-- IF YOU ALREADY CREATED MULTIPLE BOARDS
--   The de-duplication step below keeps the most recently updated board in each
--   container and archives the rest. Archived rows are NOT deleted: their
--   scenes are left intact in case something on them mattered, and they simply
--   stop being visible. To see what was archived:
--
--     select id, scope, organization_id, workspace_id, name, updated_at
--       from public.whiteboards
--      where archived_at is not null;
--
-- ROLLBACK is at the bottom.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Archive duplicates, keeping the liveliest board per container
-- ---------------------------------------------------------------------------
-- Ordered by updated_at desc, then created_at desc: the board people have
-- actually been drawing on is the one worth keeping, and the tiebreak favours
-- the older row so a board created by accident a moment ago loses.
with ranked as (
  select
    id,
    row_number() over (
      partition by organization_id
      order by updated_at desc, created_at desc
    ) as rn
  from public.whiteboards
  where scope = 'organization'
    and archived_at is null
)
update public.whiteboards w
   set archived_at = now()
  from ranked
 where w.id = ranked.id
   and ranked.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id
      order by updated_at desc, created_at desc
    ) as rn
  from public.whiteboards
  where scope = 'workspace'
    and archived_at is null
)
update public.whiteboards w
   set archived_at = now()
  from ranked
 where w.id = ranked.id
   and ranked.rn > 1;

-- ---------------------------------------------------------------------------
-- 2. Swap the name-keyed indexes for container-keyed ones
-- ---------------------------------------------------------------------------
-- The old pair keyed on (container, lower(name)), which permitted any number of
-- differently-named boards. The new pair keys on the container alone, so a
-- second INSERT fails with a unique violation whatever it is called.
drop index if exists public.whiteboards_unique_org_name;
drop index if exists public.whiteboards_unique_workspace_name;

create unique index if not exists whiteboards_one_per_org
  on public.whiteboards (organization_id)
  where scope = 'organization' and archived_at is null;

create unique index if not exists whiteboards_one_per_workspace
  on public.whiteboards (workspace_id)
  where scope = 'workspace' and archived_at is null;

-- ---------------------------------------------------------------------------
-- 3. Get-or-create, server side
-- ---------------------------------------------------------------------------
-- A board is now addressed by its container, not chosen from a list, so the
-- app needs one call that returns the board and makes it if it is missing.
--
-- SECURITY INVOKER (the default): the caller's own RLS applies, so this can
-- only ever return or create a board the caller could have reached anyway.
--
-- The insert races when two people open a board at the same moment; the loser
-- catches the unique violation and re-selects the winner's row, which is what
-- makes this safe to call from every client on open.
create or replace function public.get_or_create_whiteboard(
  p_scope        text,
  p_org_id       uuid,
  p_workspace_id uuid default null
)
returns public.whiteboards
language plpgsql
as $$
declare
  v_board public.whiteboards;
  v_name  text;
begin
  if p_scope not in ('organization', 'workspace') then
    raise exception 'scope must be organization or workspace';
  end if;

  if p_scope = 'workspace' and p_workspace_id is null then
    raise exception 'workspaceId is required for a workspace board';
  end if;

  -- Existing board first.
  if p_scope = 'organization' then
    select * into v_board
      from public.whiteboards
     where scope = 'organization'
       and organization_id = p_org_id
       and archived_at is null
     limit 1;
  else
    select * into v_board
      from public.whiteboards
     where scope = 'workspace'
       and workspace_id = p_workspace_id
       and archived_at is null
     limit 1;
  end if;

  if found then
    return v_board;
  end if;

  -- The name is descriptive only; nothing addresses a board by it.
  v_name := case when p_scope = 'organization' then 'Organization board' else 'Workspace board' end;

  begin
    insert into public.whiteboards (scope, organization_id, workspace_id, name, created_by, updated_by)
    values (
      p_scope,
      p_org_id,
      case when p_scope = 'workspace' then p_workspace_id else null end,
      v_name,
      auth.uid(),
      auth.uid()
    )
    returning * into v_board;
  exception when unique_violation then
    -- Somebody created it between our select and our insert.
    if p_scope = 'organization' then
      select * into v_board
        from public.whiteboards
       where scope = 'organization'
         and organization_id = p_org_id
         and archived_at is null
       limit 1;
    else
      select * into v_board
        from public.whiteboards
       where scope = 'workspace'
         and workspace_id = p_workspace_id
         and archived_at is null
       limit 1;
    end if;
  end;

  return v_board;
end;
$$;

comment on function public.get_or_create_whiteboard(text, uuid, uuid) is
  'Returns the single board for a container, creating it on first open. One board per organisation and per workspace.';

commit;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--   begin;
--   drop function if exists public.get_or_create_whiteboard(text, uuid, uuid);
--   drop index if exists public.whiteboards_one_per_workspace;
--   drop index if exists public.whiteboards_one_per_org;
--
--   create unique index if not exists whiteboards_unique_org_name
--     on public.whiteboards (organization_id, lower(name))
--     where scope = 'organization' and archived_at is null;
--   create unique index if not exists whiteboards_unique_workspace_name
--     on public.whiteboards (workspace_id, lower(name))
--     where scope = 'workspace' and archived_at is null;
--
--   -- Un-archive anything this migration archived (approximate: archives from
--   -- other causes share the column, so review before running).
--   -- update public.whiteboards set archived_at = null where archived_at is not null;
--   commit;
