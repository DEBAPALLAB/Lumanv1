-- Migration script to convert existing workspaces to organizations
-- This will create an organization for each existing workspace and migrate users

DO $$
DECLARE
  workspace_record RECORD;
  new_org_id UUID;
  new_user_id UUID;
  temp_email TEXT;
  temp_password TEXT;
BEGIN
  -- Loop through each existing workspace
  FOR workspace_record IN SELECT * FROM workspaces LOOP
    -- Generate a slug from owner_name (lowercase, replace spaces with hyphens)
    DECLARE
      org_slug TEXT;
    BEGIN
      org_slug := lower(regexp_replace(workspace_record.owner_name, '[^a-zA-Z0-9]+', '-', 'g'));
      org_slug := trim(both '-' from org_slug);
      
      -- Ensure slug is unique by appending random string if needed
      WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = org_slug) LOOP
        org_slug := org_slug || '-' || substr(md5(random()::text), 1, 4);
      END LOOP;

      -- Create organization
      INSERT INTO organizations (name, slug)
      VALUES (workspace_record.owner_name, org_slug)
      RETURNING id INTO new_org_id;

      -- Create temporary email for Supabase Auth user
      temp_email := workspace_record.owner_name || '@luman.local';
      
      -- Generate a random temporary password (users will need to reset)
      temp_password := encode(gen_random_bytes(16), 'hex');

      -- Note: We cannot directly insert into auth.users from SQL
      -- This needs to be done via Supabase Admin API
      -- For now, we'll create a temporary table to track migration needs
      CREATE TABLE IF NOT EXISTS migration_users (
        workspace_id UUID,
        organization_id UUID,
        owner_name TEXT,
        temp_email TEXT,
        role TEXT,
        migrated BOOLEAN DEFAULT FALSE
      );

      INSERT INTO migration_users (workspace_id, organization_id, owner_name, temp_email, role)
      VALUES (workspace_record.id, new_org_id, workspace_record.owner_name, temp_email, workspace_record.role);

      -- Update workspace with organization_id
      UPDATE workspaces 
      SET organization_id = new_org_id
      WHERE id = workspace_record.id;

    END;
  END LOOP;
END $$;

-- Create a function to complete user migration (to be called from application)
CREATE OR REPLACE FUNCTION complete_user_migration(
  p_workspace_id UUID,
  p_user_id UUID
) RETURNS void AS $$
DECLARE
  v_org_id UUID;
  v_role TEXT;
BEGIN
  -- Get organization and role from migration table
  SELECT organization_id, role INTO v_org_id, v_role
  FROM migration_users
  WHERE workspace_id = p_workspace_id;

  -- Add user to organization_members
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, p_user_id, v_role)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  -- Update workspace created_by
  UPDATE workspaces
  SET created_by = p_user_id
  WHERE id = p_workspace_id;

  -- Mark as migrated
  UPDATE migration_users
  SET migrated = TRUE
  WHERE workspace_id = p_workspace_id;
END;
$$ LANGUAGE plpgsql;
