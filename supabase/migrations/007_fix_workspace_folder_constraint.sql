-- Drop any unintended unique constraint on folder_id to allow multiple workspaces per folder
ALTER TABLE workspaces
  DROP CONSTRAINT IF EXISTS workspaces_folder_id_key;
