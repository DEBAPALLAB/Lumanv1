-- ===========================================================================
-- NOT APPLIED. This file is a proposal awaiting your approval.
-- ===========================================================================
--
-- Nothing in this file has been run against any database. It is checked in so
-- you can read it, run the pre-flight checks below, and decide.
--
-- WHAT IT DOES
--   Closes issues 2 and 3 in DEPLOYMENT_READINESS.md: `tasks`, `events` and
--   `migration_users` currently have Row Level Security switched off, so any
--   signed-in user can read and edit every other company's rows in them.
--
--   This is NOT a desktop-only problem, and not a future one. `lib/db/tasks.ts`
--   and `lib/db/events.ts` both use the ordinary anon-key client, so these
--   tables are already reachable by any signed-in user of the WEB app today.
--   `/api/tasks?workspaceId=<uuid>` returns that workspace's tasks without ever
--   checking whether the caller belongs to it — the route only verifies that
--   someone is logged in. RLS is the layer that makes that check, and it is
--   switched off.
--
--   The desktop build does not create this hole. It removes the last excuse
--   for leaving it open.
--
-- WHY IT IS NOT APPLIED
--   You asked for no database changes without approval, and this one deserves
--   the caution: a too-narrow policy does not raise an error, it silently
--   returns zero rows. To a user that is indistinguishable from data loss.
--
-- ===========================================================================
-- STEP 1 — Run the pre-flight audit FIRST.
-- ===========================================================================
--
--   supabase/checks/preflight_rls_audit.sql
--
-- It is read-only and safe. It tells you what is actually true of YOUR
-- database — these migration files do not capture changes made by hand in the
-- dashboard — and it answers the one question that can bite: whether any
-- `tasks` or `events` rows have no workspace. Such rows belong to no
-- organisation, so no rule below can grant anyone sight of them again.
--
-- Do not apply this file until that audit reports zero orphan rows, or you
-- have decided what the orphans belong to.
--
-- Note what the audit says about `workspaces`. Every policy below decides
-- access by looking through that table, and this file deliberately does not
-- touch it, because its live state was never verified.
--
-- ===========================================================================
-- STEP 2 — Apply, then test with TWO accounts in DIFFERENT organisations.
-- ===========================================================================
--
--   Sign in as each and confirm: tasks and calendar events still load, can be
--   created, edited and deleted, and neither account can see the other's.
--   A rollback block is at the bottom of this file.
--
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- Shared access predicate
-- ---------------------------------------------------------------------------
-- `tasks` and `events` both hang off `workspaces`, and a workspace is reachable
-- in exactly two ways — the same two cases check_note_visibility() already
-- encodes in migration 010:
--
--   1. Personal workspace (organization_id is null) -> its owner or creator.
--   2. Organisation workspace                       -> any member of that org.
--
-- SECURITY DEFINER so the lookup itself is not filtered by the caller's own RLS
-- on `workspaces` / `organization_members`, which is what produces the infinite
-- recursion that migrations 005 and 006 were written to fix. The function reads
-- nothing the caller could not already infer and returns only a boolean.
create or replace function public.can_access_workspace(
  p_workspace_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
security definer
set search_path = public
language plpgsql
stable
as $$
declare
  v_org_id uuid;
  v_owner_id uuid;
  v_created_by uuid;
begin
  if p_workspace_id is null or p_user_id is null then
    return false;
  end if;

  select w.organization_id, w.owner_id, w.created_by
    into v_org_id, v_owner_id, v_created_by
    from workspaces w
   where w.id = p_workspace_id;

  if not found then
    return false;
  end if;

  -- Case 1: personal workspace.
  if v_org_id is null then
    return (v_owner_id = p_user_id or v_created_by = p_user_id);
  end if;

  -- Case 2: organisation workspace.
  return exists (
    select 1
      from organization_members om
     where om.organization_id = v_org_id
       and om.user_id = p_user_id
  );
end;
$$;

comment on function public.can_access_workspace(uuid, uuid) is
  'True when the user may see a workspace: its owner/creator for personal workspaces, any organisation member otherwise. Used by the tasks and events RLS policies.';

-- ---------------------------------------------------------------------------
-- tasks and events
-- ---------------------------------------------------------------------------
-- Both hang off `workspaces`, so both get the same four rules.
--
-- SELECT/INSERT/UPDATE/DELETE are spelled out separately rather than as one
-- FOR ALL policy, because UPDATE needs both USING and WITH CHECK: USING decides
-- which rows may be changed, WITH CHECK decides what they may become. Without
-- the second, a member could move a task into a workspace they cannot reach.
--
-- Wrapped in a guard so a table that does not exist is skipped with a notice
-- instead of aborting the whole transaction and leaving nothing applied.
-- `tasks_and_dates.sql:14` has the enabling line for tasks already written,
-- and commented out.
do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'events']
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %: table does not exist', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || ' readable by workspace members', t);
    execute format('drop policy if exists %I on public.%I', t || ' insertable by workspace members', t);
    execute format('drop policy if exists %I on public.%I', t || ' updatable by workspace members', t);
    execute format('drop policy if exists %I on public.%I', t || ' deletable by workspace members', t);

    execute format(
      'create policy %I on public.%I for select using (public.can_access_workspace(workspace_id))',
      t || ' readable by workspace members', t);

    execute format(
      'create policy %I on public.%I for insert with check (public.can_access_workspace(workspace_id))',
      t || ' insertable by workspace members', t);

    execute format(
      'create policy %I on public.%I for update using (public.can_access_workspace(workspace_id)) '
      || 'with check (public.can_access_workspace(workspace_id))',
      t || ' updatable by workspace members', t);

    execute format(
      'create policy %I on public.%I for delete using (public.can_access_workspace(workspace_id))',
      t || ' deletable by workspace members', t);

    raise notice 'protected %', t;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- migration_users  (issue 3)
-- ---------------------------------------------------------------------------
-- Scratch space from the one-time migration in 002_migrate_existing_data.sql,
-- holding owner_name, temp_email and role. Nothing in the current codebase
-- reads it.
--
-- RLS on with no policies denies everything to ordinary clients, which makes
-- the table invisible without destroying anything. The service-role key still
-- reaches it, so the data remains recoverable. Reversible; `drop table` is not,
-- which is why it is not what this does.
do $$
begin
  if to_regclass('public.migration_users') is null then
    raise notice 'skipping migration_users: table does not exist (already dropped?)';
  else
    execute 'alter table public.migration_users enable row level security';
    raise notice 'protected migration_users (no policies: invisible to normal users)';
  end if;
end $$;

commit;

-- ===========================================================================
-- ROLLBACK — run this if anything above breaks a screen.
-- ===========================================================================
--
-- begin;
--   alter table public.tasks           disable row level security;
--   alter table public.events          disable row level security;
--   alter table public.migration_users disable row level security;
--   drop policy if exists "tasks readable by workspace members"   on public.tasks;
--   drop policy if exists "tasks insertable by workspace members"  on public.tasks;
--   drop policy if exists "tasks updatable by workspace members"   on public.tasks;
--   drop policy if exists "tasks deletable by workspace members"   on public.tasks;
--   drop policy if exists "events readable by workspace members"   on public.events;
--   drop policy if exists "events insertable by workspace members" on public.events;
--   drop policy if exists "events updatable by workspace members"  on public.events;
--   drop policy if exists "events deletable by workspace members"  on public.events;
--   drop function if exists public.can_access_workspace(uuid, uuid);
-- commit;
