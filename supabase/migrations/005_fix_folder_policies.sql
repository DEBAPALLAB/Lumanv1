-- Drop existing policies that have infinite recursion issue
DROP POLICY IF EXISTS "Users can view folders of their organizations" ON workspace_folders;
DROP POLICY IF EXISTS "Only members can create folders" ON workspace_folders;
DROP POLICY IF EXISTS "Only members can update folders" ON workspace_folders;
DROP POLICY IF EXISTS "Only members can delete folders" ON workspace_folders;

-- Recreate policies using a simpler approach that doesn't trigger RLS recursion
-- We check the organization_members table directly with the user's ID
CREATE POLICY "Users can view folders of their organizations"
  ON workspace_folders FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id 
      FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Only members can create folders"
  ON workspace_folders FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id 
      FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Only members can update folders"
  ON workspace_folders FOR UPDATE
  USING (
    organization_id IN (
      SELECT om.organization_id 
      FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Only members can delete folders"
  ON workspace_folders FOR DELETE
  USING (
    organization_id IN (
      SELECT om.organization_id 
      FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );
