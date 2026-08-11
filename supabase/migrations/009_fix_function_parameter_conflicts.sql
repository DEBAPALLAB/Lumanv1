-- 1. Drop note RLS policies depending on check_note_visibility and is_org_member
DROP POLICY IF EXISTS "view notes" ON notes;
DROP POLICY IF EXISTS "insert notes" ON notes;
DROP POLICY IF EXISTS "update notes" ON notes;
DROP POLICY IF EXISTS "delete notes" ON notes;

-- 2. Drop organization and member RLS policies depending on get_user_hierarchy_level
DROP POLICY IF EXISTS "Only founders and admins can update organizations" ON organizations;
DROP POLICY IF EXISTS "Only founders and admins can add members" ON organization_members;
DROP POLICY IF EXISTS "Only founders and admins can update members" ON organization_members;
DROP POLICY IF EXISTS "Only founders and admins can remove members" ON organization_members;

-- 3. Drop roles RLS policies depending on is_top_level_authorized and is_org_member
DROP POLICY IF EXISTS "view roles" ON roles;
DROP POLICY IF EXISTS "manage roles" ON roles;

-- 4. Drop the functions
DROP FUNCTION IF EXISTS check_note_visibility(UUID, UUID);
DROP FUNCTION IF EXISTS is_top_level_authorized(UUID, UUID);
DROP FUNCTION IF EXISTS get_user_hierarchy_level(UUID, UUID);
DROP FUNCTION IF EXISTS get_user_role_id(UUID, UUID);
DROP FUNCTION IF EXISTS is_org_member(UUID, UUID);

-- 5. Recreate functions with p_ prefixes to prevent column naming conflicts

CREATE OR REPLACE FUNCTION is_org_member(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM organization_members 
    WHERE organization_id = p_org_id AND user_id = p_user_id
  );
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION get_user_role_id(p_org_id UUID, p_user_id UUID)
RETURNS UUID SECURITY DEFINER AS $$
  SELECT assigned_role_id 
  FROM organization_members 
  WHERE organization_id = p_org_id AND user_id = p_user_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION get_user_hierarchy_level(p_org_id UUID, p_user_id UUID)
RETURNS INT SECURITY DEFINER AS $$
  SELECT r.hierarchy_level 
  FROM organization_members om
  JOIN roles r ON om.assigned_role_id = r.id
  WHERE om.organization_id = p_org_id AND om.user_id = p_user_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION is_top_level_authorized(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
DECLARE
    v_level INT;
BEGIN
    SELECT r.hierarchy_level INTO v_level
    FROM organization_members om
    JOIN roles r ON om.assigned_role_id = r.id
    WHERE om.organization_id = p_org_id AND om.user_id = p_user_id;
    
    -- Level 1 is top-level authority
    RETURN (v_level IS NOT NULL AND v_level = 1);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_note_visibility(p_note_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN SECURITY DEFINER AS $$
DECLARE
    v_workspace_id UUID;
    v_org_id UUID;
    v_owner_id UUID;
    v_created_by UUID;
    v_visibility_mode TEXT;
    v_min_level INT;
    v_specific_role_ids UUID[];
    v_member_role_id UUID;
    v_member_level INT;
BEGIN
    -- Get workspace and note details
    SELECT n.workspace_id, n.visibility_mode, n.minimum_visible_role_level, n.specific_role_ids,
           w.organization_id, w.owner_id, w.created_by
    INTO v_workspace_id, v_visibility_mode, v_min_level, v_specific_role_ids,
         v_org_id, v_owner_id, v_created_by
    FROM notes n
    JOIN workspaces w ON n.workspace_id = w.id
    WHERE n.id = p_note_id;

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
    IF v_visibility_mode = 'public' THEN
        RETURN TRUE;
    END IF;

    -- Hierarchy based: member level <= minimum visible level (lower number is higher authority)
    IF v_visibility_mode = 'hierarchy' THEN
        RETURN (v_member_level IS NOT NULL AND v_min_level IS NOT NULL AND v_member_level <= v_min_level);
    END IF;

    -- Specific roles: member's role must be in the specific roles array
    IF v_visibility_mode = 'specific' THEN
        RETURN (v_member_role_id IS NOT NULL AND v_specific_role_ids IS NOT NULL AND v_member_role_id = ANY(v_specific_role_ids));
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 6. Recreate roles policies
CREATE POLICY "view roles" ON roles FOR SELECT
USING (is_org_member(organization_id, auth.uid()));

CREATE POLICY "manage roles" ON roles FOR ALL
USING (is_top_level_authorized(organization_id, auth.uid()));

-- 7. Recreate note policies
CREATE POLICY "view notes" ON notes FOR SELECT
USING (check_note_visibility(id, auth.uid()));

CREATE POLICY "insert notes" ON notes FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workspaces 
    WHERE workspaces.id = workspace_id 
    AND (
      workspaces.organization_id IS NULL 
      OR is_org_member(workspaces.organization_id, auth.uid())
    )
  )
);

CREATE POLICY "update notes" ON notes FOR UPDATE
USING (
  check_note_visibility(id, auth.uid()) 
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
  check_note_visibility(id, auth.uid()) 
  AND (
    EXISTS (
      SELECT 1 FROM workspaces 
      WHERE workspaces.id = workspace_id 
      AND (workspaces.owner_id = auth.uid() OR workspaces.created_by = auth.uid())
    )
  )
);

-- 8. Recreate organizations and members policies
CREATE POLICY "Only founders and admins can update organizations"
  ON organizations FOR UPDATE
  USING (
    get_user_hierarchy_level(id, auth.uid()) <= 2
  );

CREATE POLICY "Only founders and admins can add members"
  ON organization_members FOR INSERT
  WITH CHECK (
    get_user_hierarchy_level(organization_id, auth.uid()) <= 2
  );

CREATE POLICY "Only founders and admins can update members"
  ON organization_members FOR UPDATE
  USING (
    get_user_hierarchy_level(organization_id, auth.uid()) <= 2
  );

CREATE POLICY "Only founders and admins can remove members"
  ON organization_members FOR DELETE
  USING (
    get_user_hierarchy_level(organization_id, auth.uid()) <= 2
  );
