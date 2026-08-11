import type { RoleTier } from "./role";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  invitation_code: string;
  hierarchy_type: "fixed" | "custom";
  created_at: string;
  updated_at: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string;
  // Kept in sync with assigned_role_id by a DB trigger — this is the org
  // role tier, distinct from workspaces.role (a visibility tier). See
  // types/workspace.ts for the disambiguation note.
  role: RoleTier | string;
  assigned_role_id: string;
  created_at: string;
  updated_at: string;
};

export type OrganizationMemberWithUser = OrganizationMember & {
  full_name: string;
  email: string;
};

export type Role = {
  id: string;
  organization_id: string;
  role_name: string;
  hierarchy_level: number;
  created_by: string | null;
  created_at: string;
};
