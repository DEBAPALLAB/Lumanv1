-- Fixes a regression introduced by migration 016.
--
-- 016 replaced the overly-narrow "own row only" SELECT policy with an
-- EXISTS subquery against organization_members, evaluated from inside that
-- same table's own SELECT policy. That subquery is itself subject to RLS, so
-- evaluating it re-triggers the same policy, which re-runs the subquery, and
-- so on — this is exactly the infinite recursion migration 006 hit and
-- worked around, just reintroduced. It broke every query that joins through
-- organization_members, including the one behind login (getUserOrganizations
-- in lib/db/organizations.ts), which is why /api/auth/session started
-- returning 500 and sign-in stopped working entirely.
--
-- The fix is the pattern migration 008 already established for this exact
-- situation: a SECURITY DEFINER function. Its internal query runs with the
-- function owner's privileges and so is NOT subject to RLS, which is what
-- breaks the cycle — a plain subquery inside the policy body, however it is
-- written, cannot do this no matter how the WHERE clause is phrased.
--
-- is_org_member() from migration 008 is not reused here: its body has a
-- parameter/column shadowing bug (`user_id = user_id` inside the function
-- always compares the column to itself, ignoring the argument), and three
-- other policies already depend on that exact behaviour. Changing it now
-- would change what those policies allow as a side effect of this fix.
-- A new, correctly-written function is safer than touching a shared one.

CREATE OR REPLACE FUNCTION is_member_of_org(check_org_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = check_org_id
      AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE;

DROP POLICY IF EXISTS "Users can view memberships in their organizations" ON organization_members;
DROP POLICY IF EXISTS "Users can view their own organization memberships" ON organization_members;

CREATE POLICY "Users can view memberships in their organizations"
  ON organization_members FOR SELECT
  USING (is_member_of_org(organization_id));
