import type { RoleTier } from "./role";

/**
 * Visibility tier for a workspace (founder/admin/intern-only visibility) —
 * NOT the same concept as OrganizationMember.role (the user's org role),
 * even though the source app's DB column is also confusingly named "role".
 * Renaming the DB column itself is a Phase 7 schema change (deferred); this
 * type-level distinction removes the ambiguity at the application layer now.
 */
export type WorkspaceVisibilityTier = RoleTier;

export type Workspace = {
  id: string;
  owner_name: string;
  role: WorkspaceVisibilityTier | string;
  organization_id: string | null;
  created_by: string;
  // Duplicate of created_by, kept only for backwards compatibility with
  // rows/queries written before this field existed. Do not write new logic
  // that depends on owner_id and created_by ever diverging — Phase 7 plans
  // to consolidate these into one column.
  owner_id: string;
  folder_id: string | null;
  color: string;
  created_at: string;
};

export type WorkspaceFolder = {
  id: string;
  name: string;
  color: string;
  organization_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};
