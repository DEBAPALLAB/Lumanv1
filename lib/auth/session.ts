import { createSupabaseServerClient, getBearerToken } from "@/lib/supabase/server";
import type { RoleTier } from "@/types/role";
import type { User } from "@supabase/supabase-js";

/**
 * The one shared auth surface. Middleware, layouts, and API routes all call
 * through here instead of each reimplementing supabase.auth.getUser() +
 * their own membership/role lookup — the source app had at least four
 * different patterns for this (see plan's "Core Architectural Fixes").
 *
 * getUser() (not getSession()) is used deliberately: it validates against
 * the auth server rather than trusting a locally-cached JWT. That holds for
 * both entry points: the cookie session, and the `Authorization: Bearer`
 * token a delegated desktop request carries — the explicit `getUser(token)`
 * call round-trips to the auth server exactly the same way, so a forged or
 * expired token cannot pass.
 */
export async function getSession() {
  const supabase = await createSupabaseServerClient();
  const bearerToken = await getBearerToken();

  const {
    data: { user },
  } = bearerToken ? await supabase.auth.getUser(bearerToken) : await supabase.auth.getUser();

  if (!user) return null;
  return { user, supabase };
}

export type RequireUserResult = { user: User; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> } | null;

/** For API routes: `const session = await requireUser(); if (!session) return apiError("Unauthorized", 401);` */
export async function requireUser(): Promise<RequireUserResult> {
  return getSession();
}

export type Membership = {
  organization_id: string;
  user_id: string;
  role: string;
  assigned_role_id: string;
  hierarchy_level: number | null;
};

/** Canonical "what's this user's role/hierarchy level in this org" lookup. */
export async function getMembership(organizationId: string, userId: string): Promise<Membership | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, user_id, role, assigned_role_id, roles(hierarchy_level)")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  const rolesObj = data.roles as unknown as { hierarchy_level: number } | null;
  return {
    organization_id: data.organization_id,
    user_id: data.user_id,
    role: data.role,
    assigned_role_id: data.assigned_role_id,
    hierarchy_level: rolesObj?.hierarchy_level ?? null,
  };
}

export async function hasAdminPermission(organizationId: string, userId: string): Promise<boolean> {
  const membership = await getMembership(organizationId, userId);
  if (!membership) return false;
  return (membership.role as RoleTier) === "founder" || (membership.role as RoleTier) === "admin";
}
