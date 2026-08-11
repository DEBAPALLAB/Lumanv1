-- Create workspace_folders table
CREATE TABLE IF NOT EXISTS workspace_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT 'stone', -- Tailwind color name or hex
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add folder_id and color to workspaces table
ALTER TABLE workspaces 
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES workspace_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'stone';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_folders_org ON workspace_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_folder ON workspaces(folder_id);

-- RLS for workspace_folders
ALTER TABLE workspace_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view folders of their organizations"
  ON workspace_folders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM organization_members 
      WHERE organization_members.organization_id = workspace_folders.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Only members can create folders"
  ON workspace_folders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM organization_members 
      WHERE organization_members.organization_id = workspace_folders.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Only members can update folders"
  ON workspace_folders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 
      FROM organization_members 
      WHERE organization_members.organization_id = workspace_folders.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Only members can delete folders"
  ON workspace_folders FOR DELETE
  USING (
    EXISTS (
      SELECT 1 
      FROM organization_members 
      WHERE organization_members.organization_id = workspace_folders.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );
