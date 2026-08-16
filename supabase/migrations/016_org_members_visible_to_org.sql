-- SUPERSEDED by migration 017 — the EXISTS subquery below recurses (it is
-- itself subject to the policy it's defined inside), which broke login.
-- Kept as-is for history; do not reapply this file on its own.
--
-- Fix: organization_members SELECT only ever returned the caller's own row.
--
-- Migration 006 replaced a recursive policy with `USING (user_id = auth.uid())`
-- as a stopgap — that stopped the recursion, but it also means every SELECT
-- against this table (e.g. GET /api/organization/members, which builds the
-- chat/voice author directory) returns exactly one row: the caller's. Every
-- other member's id is absent from that response, so their messages render
-- with the "Teammate" fallback instead of their real name — regardless of the
-- application code, since RLS filters the rows before they ever reach it.
--
-- Migration 008 added is_org_member(), a SECURITY DEFINER helper built for
-- exactly this: querying organization_members from inside its own policy
-- without the self-reference recursing. It just was never applied to this
-- table's own SELECT policy. This migration does that.
--
-- Table aliases are used explicitly (om.organization_id / om.user_id) rather
-- than bare column names, because is_org_member()'s parameters are also named
-- organization_id/user_id — an unqualified reference inside that function
-- resolves to the parameter, not the column, per Postgres's function-argument
-- shadowing rule. That bug already exists in is_org_member() itself (a bare
-- `user_id = user_id` in its body always compares the column to itself), but
-- fixing that is a separate, larger change since three other policies already
-- depend on its current behaviour — flagged here rather than fixed silently.

DROP POLICY IF EXISTS "Users can view their own organization memberships" ON organization_members;

CREATE POLICY "Users can view memberships in their organizations"
  ON organization_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
    )
  );
