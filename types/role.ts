// Shared role-tier constants. The DB drives actual authorization via
// roles.hierarchy_level (see types/organization.ts) — these names are the
// single place the "founder"/"admin"/"intern" strings are defined, instead
// of being re-hardcoded independently across auth/register, set-role,
// the workspace layout guard, and api/workspaces (as in the source app).
export const ROLE_TIERS = ["founder", "admin", "intern"] as const;
export type RoleTier = (typeof ROLE_TIERS)[number];

export const ROLE_HIERARCHY_LEVEL: Record<RoleTier, number> = {
  founder: 1,
  admin: 2,
  intern: 3,
};

export function isRoleTier(value: string): value is RoleTier {
  return (ROLE_TIERS as readonly string[]).includes(value);
}
