-- roles' only write-capable policy is "manage roles" (migration 008), which
-- requires the caller to already be the org's top-level (hierarchy_level 1)
-- member. That's correct for managing an *existing* org's roles, but custom
-- hierarchy org creation needs to insert the org's initial role list before
-- any member exists at all — nobody can be "top-level authorized" for an org
-- with zero members yet, so that insert is rejected by RLS.
--
-- organizations itself already has a deliberately permissive INSERT policy
-- for this same bootstrap problem (`WITH CHECK (true)`, "restricted in
-- application logic" — see migration 001's comment). This mirrors that
-- pattern for roles, scoped tighter: insertion is allowed only while the
-- target org still has zero members, i.e. only during the brief window
-- between POST /api/auth/org and the founder actually registering. Once a
-- member exists, this policy no longer applies and "manage roles" is the
-- only way in — identical to how organizations' own INSERT policy is wide
-- open but application code + the founder_claim cookie are what actually
-- keep a stranger from claiming a freshly-created org.
CREATE POLICY "bootstrap roles for memberless org" ON roles FOR INSERT
WITH CHECK (
  NOT EXISTS (
    SELECT 1 FROM organization_members WHERE organization_id = roles.organization_id
  )
);
