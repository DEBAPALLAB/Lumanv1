-- ===========================================================================
-- PRE-FLIGHT AUDIT — READ ONLY. Safe to run at any time.
-- ===========================================================================
--
-- Run this FIRST, before
-- migrations/011_enable_rls_tasks_events_migration_users.sql.
--
-- It changes nothing. Every statement is a SELECT. Paste the whole file into
-- Supabase -> SQL Editor -> New query -> Run. You get 11 result sets (numbered
-- 1, 2, 3, two under 4, 5, 6, 7, two under 8, and 9 below).
-- Send them all back and I will confirm whether migration 011 is safe for YOUR
-- database, or rewrite it so it is.
--
-- Why this is needed: the migration files in this repo do not capture changes
-- made by hand in the Supabase dashboard, and this project's .env.local notes
-- that the database is SHARED with the Luman and Luman-Desktop apps. Row Level
-- Security is a property of the database, not of one app — switching it on
-- affects every application connected to it. I can only read this repo.
--
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1 — Which tables are protected, and which are not?
-- ---------------------------------------------------------------------------
-- rls_enabled = false              -> open to any signed-in user (the problem)
-- rls_enabled = true,  policies 0  -> denies everything to normal users
-- rls_enabled = true,  policies >0 -> protected (the goal)
--
-- Watch `workspaces` especially: every policy in migration 011 decides access
-- by looking through it.
select
  c.relname                                        as table_name,
  c.relrowsecurity                                 as rls_enabled,
  c.relforcerowsecurity                            as rls_forced,
  (select count(*)
     from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = c.relname)                 as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;


-- ---------------------------------------------------------------------------
-- 2 — Policies that ALREADY exist on the tables I intend to touch
-- ---------------------------------------------------------------------------
-- Matters because permissive policies combine with OR. If something was added
-- by hand in the dashboard, my policies would widen access rather than define
-- it, and `drop policy if exists` in migration 011 only removes policies with
-- my exact names — it will not touch yours.
select tablename,
       policyname,
       permissive,
       roles,
       cmd,
       qual        as using_expression,
       with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in ('tasks', 'events', 'workspaces', 'migration_users',
                    'notes', 'organization_members')
order by tablename, policyname;


-- ---------------------------------------------------------------------------
-- 3 — Do the columns my policy function assumes actually exist?
-- ---------------------------------------------------------------------------
-- can_access_workspace() reads workspaces.organization_id, .owner_id,
-- .created_by, and joins organization_members on .organization_id/.user_id.
-- I inferred those from lib/db/workspaces.ts and migration 010, never from the
-- live schema. If a name or type differs, the function would misbehave.
--
-- Also shows whether tasks.workspace_id / events.workspace_id are nullable.
select table_name,
       column_name,
       data_type,
       is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('workspaces', 'tasks', 'events', 'organization_members',
                     'migration_users')
order by table_name, ordinal_position;


-- ---------------------------------------------------------------------------
-- 4 — Would the new rules hide any existing rows?
-- ---------------------------------------------------------------------------
-- A row with no workspace belongs to no organisation, so no rule can work out
-- who should see it. Nothing is deleted — the service-role key still reaches
-- it — but ordinary users would lose sight of it.
--
-- WANT: orphan_rows = 0 on both lines. If not, tell me the number.
select 'events' as table_name, count(*) as orphan_rows from events where workspace_id is null
union all
select 'tasks',  count(*) from tasks  where workspace_id is null;

-- Same question one level up: rows whose workspace exists but has no
-- organisation AND no owner/creator would also become unreachable.
select 'workspaces with no org and no owner' as issue, count(*) as rows
from workspaces
where organization_id is null
  and owner_id is null
  and created_by is null;


-- ---------------------------------------------------------------------------
-- 5 — Does anything already own the name I want to create?
-- ---------------------------------------------------------------------------
-- Migration 011 runs CREATE OR REPLACE FUNCTION can_access_workspace(...).
-- If a function of that name already exists and something else depends on it,
-- replacing it would change that behaviour too.
select p.proname                              as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef                            as is_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('can_access_workspace', 'check_note_visibility')
order by p.proname;


-- ---------------------------------------------------------------------------
-- 6 — Is anything subscribed to these tables over Realtime?
-- ---------------------------------------------------------------------------
-- Realtime respects RLS. If another app streams changes from tasks or events,
-- enabling RLS changes which rows it receives.
select pubname, schemaname, tablename
from pg_publication_tables
where schemaname = 'public'
order by pubname, tablename;


-- ---------------------------------------------------------------------------
-- 7 — Who currently has table-level permission?
-- ---------------------------------------------------------------------------
-- RLS only filters roles that hold a grant. `service_role` bypasses RLS
-- entirely, which is why the Vercel members lookup is unaffected. This shows
-- whether anything unexpected (e.g. `anon` with write access) is in play.
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('tasks', 'events', 'workspaces', 'migration_users')
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
group by table_name, grantee
order by table_name, grantee;


-- ---------------------------------------------------------------------------
-- 8 — Triggers and views that touch these tables
-- ---------------------------------------------------------------------------
-- A view owned by a privileged role can read straight past RLS, and a trigger
-- may write rows as the calling user and start failing the WITH CHECK rules.
select event_object_table as on_table,
       trigger_name,
       action_timing,
       event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('tasks', 'events', 'workspaces', 'migration_users')
order by on_table, trigger_name;

select table_name as view_name
from information_schema.views
where table_schema = 'public'
order by table_name;


-- ---------------------------------------------------------------------------
-- 9 — Baseline row counts
-- ---------------------------------------------------------------------------
-- Note these down. After applying, they let "did anything disappear?" have an
-- answer rather than an impression. These counts ignore access rules, so they
-- should NOT change — what changes is how many rows each user can see.
select 'tasks' as table_name, count(*) as total_rows from tasks
union all select 'events', count(*) from events
union all select 'workspaces', count(*) from workspaces
union all select 'organization_members', count(*) from organization_members
union all select 'notes', count(*) from notes;


