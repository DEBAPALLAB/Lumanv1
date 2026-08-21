-- Role reordering (PUT /api/organization/[orgId]/roles with a `roles` array)
-- updates every role's hierarchy_level in one batch via Promise.all. Swapping
-- two roles' levels — e.g. Admin 2 <-> Manager 3 — means one of those UPDATEs
-- momentarily collides with the other role's still-current level. Postgres
-- checks UNIQUE(organization_id, hierarchy_level) immediately after each row
-- write by default, so whichever update lands second aborts with a unique
-- violation and the route surfaces it as a 500 on an ordinary drag-and-drop.
--
-- Making the constraint DEFERRABLE INITIALLY DEFERRED postpones the check to
-- transaction commit instead of per-row, so the whole batch can land in any
-- order as long as the *final* state has no duplicate levels — which is all
-- this constraint is meant to guarantee in the first place.
ALTER TABLE roles
  DROP CONSTRAINT IF EXISTS roles_organization_id_hierarchy_level_key;

ALTER TABLE roles
  ADD CONSTRAINT roles_organization_id_hierarchy_level_key
  UNIQUE (organization_id, hierarchy_level)
  DEFERRABLE INITIALLY DEFERRED;

-- Deferring the constraint only helps within a single transaction, and the
-- reorder route was issuing one independent PostgREST call per role via
-- Promise.all — each its own auto-committed statement, sharing no
-- transaction to defer within. This RPC does the whole batch as one
-- statement (a single UPDATE ... FROM, so it's one transaction by
-- construction) so the deferred check above actually applies.
CREATE OR REPLACE FUNCTION reorder_roles(p_org_id UUID, p_roles JSONB)
RETURNS SETOF roles
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT is_top_level_authorized(p_org_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to reorder roles for this organization';
  END IF;

  IF p_roles IS NULL OR jsonb_typeof(p_roles) <> 'array' THEN
    RAISE EXCEPTION 'p_roles must be a JSON array';
  END IF;

  -- Every element must carry a role id already belonging to this org and an
  -- integer level, so a malformed payload fails with a clear message here
  -- rather than a raw cast error, and can't touch another org's roles.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_roles) AS elem
    WHERE elem->>'id' IS NULL
       OR elem->>'hierarchy_level' IS NULL
       OR (elem->>'hierarchy_level') !~ '^-?[0-9]+$'
       OR NOT EXISTS (
         SELECT 1 FROM roles WHERE id = (elem->>'id')::UUID AND organization_id = p_org_id
       )
  ) THEN
    RAISE EXCEPTION 'p_roles contains an invalid or out-of-organization role entry';
  END IF;

  UPDATE roles r
  SET hierarchy_level = (elem->>'hierarchy_level')::INT
  FROM jsonb_array_elements(p_roles) AS elem
  WHERE r.id = (elem->>'id')::UUID
    AND r.organization_id = p_org_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> jsonb_array_length(p_roles) THEN
    RAISE EXCEPTION 'Reorder touched % rows but % were requested', v_count, jsonb_array_length(p_roles);
  END IF;

  RETURN QUERY SELECT * FROM roles WHERE organization_id = p_org_id ORDER BY hierarchy_level ASC;
END;
$$ LANGUAGE plpgsql;
