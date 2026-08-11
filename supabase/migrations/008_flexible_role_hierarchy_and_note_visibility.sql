-- Add hierarchy_type to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hierarchy_type TEXT NOT NULL DEFAULT 'fixed';

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  hierarchy_level INT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, role_name),
  UNIQUE(organization_id, hierarchy_level)
);

-- Add assigned_role_id to organization_members
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS assigned_role_id UUID REFERENCES roles(id) ON DELETE RESTRICT;

-- Add visibility columns to notes
ALTER TABLE notes ADD COLUMN IF NOT EXISTS visibility_mode TEXT NOT NULL DEFAULT 'public';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS minimum_visible_role_level INT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS specific_role_ids UUID[];
ALTER TABLE notes ADD COLUMN IF NOT EXISTS created_by_role_level INT;

-- Helper security functions
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID, user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM organization_members 
    WHERE organization_id = org_id AND user_id = user_id
  );
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION get_user_role_id(org_id UUID, user_id UUID)
RETURNS UUID SECURITY DEFINER AS $$
  SELECT assigned_role_id 
  FROM organization_members 
  WHERE organization_id = org_id AND user_id = user_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION get_user_hierarchy_level(org_id UUID, user_id UUID)
RETURNS INT SECURITY DEFINER AS $$
  SELECT r.hierarchy_level 
  FROM organization_members om
  JOIN roles r ON om.assigned_role_id = r.id
  WHERE om.organization_id = org_id AND om.user_id = user_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION is_top_level_authorized(org_id UUID, user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
DECLARE
    v_level INT;
BEGIN
    SELECT r.hierarchy_level INTO v_level
    FROM organization_members om
    JOIN roles r ON om.assigned_role_id = r.id
    WHERE om.organization_id = org_id AND om.user_id = user_id;
    
    -- Level 1 is top-level authority
    RETURN (v_level IS NOT NULL AND v_level = 1);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_note_visibility(note_id UUID, user_id UUID DEFAULT auth.uid())
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
    WHERE n.id = note_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Case 1: Workspace is personal (no organization)
    IF v_org_id IS NULL THEN
        RETURN (v_owner_id = user_id OR v_created_by = user_id);
    END IF;

    -- Case 2: Workspace is in an organization
    -- Get member's role and hierarchy level
    SELECT om.assigned_role_id, r.hierarchy_level
    INTO v_member_role_id, v_member_level
    FROM organization_members om
    JOIN roles r ON om.assigned_role_id = r.id
    WHERE om.organization_id = v_org_id AND om.user_id = user_id;

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

-- BEFORE INSERT OR UPDATE trigger on organization_members
CREATE OR REPLACE FUNCTION sync_member_roles()
RETURNS TRIGGER AS $$
DECLARE
    v_role_name TEXT;
    v_role_id UUID;
    v_org_type TEXT;
BEGIN
    -- Get the organization hierarchy type
    SELECT hierarchy_type INTO v_org_type FROM organizations WHERE id = NEW.organization_id;

    -- Ensure roles exist for this organization
    IF NOT EXISTS (SELECT 1 FROM roles WHERE organization_id = NEW.organization_id) THEN
        INSERT INTO roles (organization_id, role_name, hierarchy_level) VALUES
            (NEW.organization_id, 'Founder', 1),
            (NEW.organization_id, 'Admin', 2),
            (NEW.organization_id, 'Intern', 3)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Case 1: NEW.assigned_role_id is NULL, but role text is provided
    IF NEW.assigned_role_id IS NULL AND NEW.role IS NOT NULL THEN
        -- Try to match role text to role name (case insensitive)
        SELECT id INTO v_role_id 
        FROM roles 
        WHERE organization_id = NEW.organization_id 
        AND LOWER(role_name) = LOWER(NEW.role);
        
        -- Fallback to Founder if 'founder', Admin if 'admin', otherwise Intern
        IF v_role_id IS NULL THEN
            IF LOWER(NEW.role) = 'founder' THEN
                SELECT id INTO v_role_id FROM roles WHERE organization_id = NEW.organization_id AND hierarchy_level = 1;
            ELSIF LOWER(NEW.role) = 'admin' THEN
                SELECT id INTO v_role_id FROM roles WHERE organization_id = NEW.organization_id AND hierarchy_level = 2;
            ELSE
                SELECT id INTO v_role_id FROM roles WHERE organization_id = NEW.organization_id AND hierarchy_level = 3;
            END IF;
        END IF;

        -- Final fallback: lowest hierarchy level role
        IF v_role_id IS NULL THEN
            SELECT id INTO v_role_id 
            FROM roles 
            WHERE organization_id = NEW.organization_id 
            ORDER BY hierarchy_level DESC 
            LIMIT 1;
        END IF;
        
        NEW.assigned_role_id := v_role_id;
    END IF;

    -- Case 2: NEW.assigned_role_id is provided, sync the text role column
    IF NEW.assigned_role_id IS NOT NULL THEN
        SELECT role_name INTO v_role_name FROM roles WHERE id = NEW.assigned_role_id;
        IF v_role_name IS NOT NULL THEN
            -- Map standard roles, default to 'intern' for others
            IF LOWER(v_role_name) = 'founder' THEN
                NEW.role := 'founder';
            ELSIF LOWER(v_role_name) = 'admin' THEN
                NEW.role := 'admin';
            ELSE
                NEW.role := 'intern';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_member_roles
BEFORE INSERT OR UPDATE ON organization_members
FOR EACH ROW
EXECUTE FUNCTION sync_member_roles();

-- Backfill roles for all existing organizations and set assigned_role_id
DO $$
DECLARE
    org_rec RECORD;
    founder_role_id UUID;
    admin_role_id UUID;
    intern_role_id UUID;
BEGIN
    FOR org_rec IN SELECT id FROM organizations LOOP
        -- check if founder role exists
        SELECT id INTO founder_role_id FROM roles WHERE organization_id = org_rec.id AND hierarchy_level = 1;
        IF founder_role_id IS NULL THEN
            INSERT INTO roles (organization_id, role_name, hierarchy_level)
            VALUES (org_rec.id, 'Founder', 1)
            RETURNING id INTO founder_role_id;
        END IF;

        -- check if admin role exists
        SELECT id INTO admin_role_id FROM roles WHERE organization_id = org_rec.id AND hierarchy_level = 2;
        IF admin_role_id IS NULL THEN
            INSERT INTO roles (organization_id, role_name, hierarchy_level)
            VALUES (org_rec.id, 'Admin', 2)
            RETURNING id INTO admin_role_id;
        END IF;

        -- check if intern role exists
        SELECT id INTO intern_role_id FROM roles WHERE organization_id = org_rec.id AND hierarchy_level = 3;
        IF intern_role_id IS NULL THEN
            INSERT INTO roles (organization_id, role_name, hierarchy_level)
            VALUES (org_rec.id, 'Intern', 3)
            RETURNING id INTO intern_role_id;
        END IF;

        -- update existing organization members for this org
        UPDATE organization_members
        SET assigned_role_id = founder_role_id
        WHERE organization_id = org_rec.id AND LOWER(role) = 'founder' AND assigned_role_id IS NULL;

        UPDATE organization_members
        SET assigned_role_id = admin_role_id
        WHERE organization_id = org_rec.id AND LOWER(role) = 'admin' AND assigned_role_id IS NULL;

        UPDATE organization_members
        SET assigned_role_id = intern_role_id
        WHERE organization_id = org_rec.id AND (LOWER(role) = 'intern' OR role IS NULL) AND assigned_role_id IS NULL;
    END LOOP;
END;
$$;

-- Alter organization_members to make assigned_role_id NOT NULL
ALTER TABLE organization_members ALTER COLUMN assigned_role_id SET NOT NULL;

-- Enable RLS on roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view roles" ON roles FOR SELECT
USING (is_org_member(organization_id, auth.uid()));

CREATE POLICY "manage roles" ON roles FOR ALL
USING (is_top_level_authorized(organization_id, auth.uid()));

-- Enable RLS on notes
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow inserts (v1)" ON notes;
DROP POLICY IF EXISTS "owner edits notes" ON notes;
DROP POLICY IF EXISTS "view notes" ON notes;

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

-- Update organizations and organization_members policies to check hierarchy_level
DROP POLICY IF EXISTS "Only founders and admins can update organizations" ON organizations;
CREATE POLICY "Only founders and admins can update organizations"
  ON organizations FOR UPDATE
  USING (
    get_user_hierarchy_level(id, auth.uid()) <= 2
  );

DROP POLICY IF EXISTS "Only founders and admins can add members" ON organization_members;
CREATE POLICY "Only founders and admins can add members"
  ON organization_members FOR INSERT
  WITH CHECK (
    get_user_hierarchy_level(organization_id, auth.uid()) <= 2
  );

DROP POLICY IF EXISTS "Only founders and admins can update members" ON organization_members;
CREATE POLICY "Only founders and admins can update members"
  ON organization_members FOR UPDATE
  USING (
    get_user_hierarchy_level(organization_id, auth.uid()) <= 2
  );

DROP POLICY IF EXISTS "Only founders and admins can remove members" ON organization_members;
CREATE POLICY "Only founders and admins can remove members"
  ON organization_members FOR DELETE
  USING (
    get_user_hierarchy_level(organization_id, auth.uid()) <= 2
  );
