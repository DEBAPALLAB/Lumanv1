-- 1. Drop existing policies on notes that use the old signature
DROP POLICY IF EXISTS "view notes" ON notes;
DROP POLICY IF EXISTS "update notes" ON notes;
DROP POLICY IF EXISTS "delete notes" ON notes;

-- 2. Drop old function signature to keep schema clean
DROP FUNCTION IF EXISTS check_note_visibility(UUID, UUID);

-- 3. Recreate check_note_visibility to accept column parameters instead of p_note_id.
-- This bypasses MVCC command visibility snapshots (which are blank for the notes table during the INSERT statement) 
-- when inserting a note with RETURNING clause.
CREATE OR REPLACE FUNCTION check_note_visibility(
  p_workspace_id UUID,
  p_visibility_mode TEXT,
  p_minimum_visible_role_level INT,
  p_specific_role_ids UUID[],
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN SECURITY DEFINER AS $$
DECLARE
    v_org_id UUID;
    v_owner_id UUID;
    v_created_by UUID;
    v_member_role_id UUID;
    v_member_level INT;
BEGIN
    -- Get workspace details
    SELECT w.organization_id, w.owner_id, w.created_by
    INTO v_org_id, v_owner_id, v_created_by
    FROM workspaces w
    WHERE w.id = p_workspace_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Case 1: Workspace is personal (no organization)
    IF v_org_id IS NULL THEN
        RETURN (v_owner_id = p_user_id OR v_created_by = p_user_id);
    END IF;

    -- Case 2: Workspace is in an organization
    -- Get member's role and hierarchy level
    SELECT om.assigned_role_id, r.hierarchy_level
    INTO v_member_role_id, v_member_level
    FROM organization_members om
    JOIN roles r ON om.assigned_role_id = r.id
    WHERE om.organization_id = v_org_id AND om.user_id = p_user_id;

    -- If user is not a member of the organization, they have no visibility
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Public: any member can view
    IF p_visibility_mode = 'public' THEN
        RETURN TRUE;
    END IF;

    -- Hierarchy based: member level <= minimum visible level (lower number is higher authority)
    IF p_visibility_mode = 'hierarchy' THEN
        RETURN (v_member_level IS NOT NULL AND p_minimum_visible_role_level IS NOT NULL AND v_member_level <= p_minimum_visible_role_level);
    END IF;

    -- Specific roles: member's role must be in the specific roles array
    IF p_visibility_mode = 'specific' THEN
        RETURN (v_member_role_id IS NOT NULL AND p_specific_role_ids IS NOT NULL AND v_member_role_id = ANY(p_specific_role_ids));
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 4. Recreate policies with column parameters
CREATE POLICY "view notes" ON notes FOR SELECT
USING (
  check_note_visibility(
    workspace_id,
    visibility_mode,
    minimum_visible_role_level,
    specific_role_ids,
    auth.uid()
  )
);

CREATE POLICY "update notes" ON notes FOR UPDATE
USING (
  check_note_visibility(
    workspace_id,
    visibility_mode,
    minimum_visible_role_level,
    specific_role_ids,
    auth.uid()
  )
  AND (
    EXISTS (
      SELECT 1 FROM workspaces 
      WHERE workspaces.id = workspace_id 
      AND (workspaces.owner_id = auth.uid() OR workspaces.created_by = auth.uid())
    )
  )
);

CREATE POLICY "delete notes" ON notes FOR DELETE
USING (
  check_note_visibility(
    workspace_id,
    visibility_mode,
    minimum_visible_role_level,
    specific_role_ids,
    auth.uid()
  )
  AND (
    EXISTS (
      SELECT 1 FROM workspaces 
      WHERE workspaces.id = workspace_id 
      AND (workspaces.owner_id = auth.uid() OR workspaces.created_by = auth.uid())
    )
  )
);
