import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Organization, OrganizationMember } from "@/types/organization";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return null;
}

/**
 * Generate a URL-friendly slug from organization name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * When POST /api/auth/org is called anonymously (the legitimate "create an
 * org, then register" flow for a brand-new user), the org is created with
 * zero members. Without proof of who ran that step, ANY subsequent stranger
 * registering against that slug would be granted Founder — the org-creation
 * step and the founder-claiming step were unlinked. This issues a signed,
 * short-lived claim naming the exact org just created, which register/route.ts
 * must present to be granted Founder instead of Intern. Reuses the service
 * role key as the HMAC secret rather than adding a new env var: it's already
 * server-only (lib/server/delegate.ts never ships it to desktop builds), so
 * it's available wherever this needs to run without new deployment config.
 */
const FOUNDER_CLAIM_TTL_MS = 10 * 60 * 1000;

export function issueFounderClaim(organizationId: string): string {
  const expires = Date.now() + FOUNDER_CLAIM_TTL_MS;
  const payload = `${organizationId}.${expires}`;
  const sig = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyFounderClaim(claim: string, organizationId: string): boolean {
  const parts = claim.split(".");
  if (parts.length !== 3) return false;
  const [claimedOrgId, expiresStr, sig] = parts;
  const expires = Number(expiresStr);
  if (claimedOrgId !== organizationId || !Number.isFinite(expires) || Date.now() > expires) return false;

  const payload = `${claimedOrgId}.${expiresStr}`;
  const expectedSig = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  return a.length === b.length && timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
}

/**
 * Get all organizations
 */
export async function getOrganizations() {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());
  const { data, error } = await supabase.from("organizations").select("*").order("created_at", { ascending: true });

  if (error) throw error;
  return data as Organization[];
}

/**
 * Get organization by slug
 */
export async function getOrganizationBySlug(slug: string) {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());
  const { data, error } = await supabase.from("organizations").select("*").eq("slug", slug).single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    console.error("getOrganizationBySlug error:", error);
    throw error;
  }

  return data as Organization;
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(id: string) {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());
  const { data, error } = await supabase.from("organizations").select("*").eq("id", id).single();

  if (error) throw error;
  return data as Organization;
}

/**
 * Create a new organization
 */
export async function createOrganization(
  name: string,
  creatorUserId?: string,
  hierarchyType: "fixed" | "custom" = "fixed",
  customRoles?: { role_name: string; hierarchy_level: number }[],
) {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());

  let slug = generateSlug(name);

  // Generate a 6-character alphanumeric invitation code
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let invitationCode = "";
  for (let i = 0; i < 6; i++) {
    invitationCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Ensure slug is unique
  let slugExists = await getOrganizationBySlug(slug);
  let counter = 1;
  while (slugExists) {
    slug = `${generateSlug(name)}-${counter}`;
    slugExists = await getOrganizationBySlug(slug);
    counter++;
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({ name, slug, invitation_code: invitationCode, hierarchy_type: hierarchyType })
    .select()
    .single();

  if (error) throw error;

  // If custom hierarchy, create the custom roles
  if (hierarchyType === "custom" && customRoles && customRoles.length > 0) {
    const rolesToInsert = customRoles.map((role) => ({
      organization_id: data.id,
      role_name: role.role_name,
      hierarchy_level: role.hierarchy_level,
    }));
    const { error: rolesError } = await supabase.from("roles").insert(rolesToInsert);
    if (rolesError) throw rolesError;
  }

  // If creator user ID provided, add them as founder
  if (creatorUserId) {
    let assignedRoleId: string | undefined;
    if (hierarchyType === "custom") {
      const { data: roleData } = await supabase
        .from("roles")
        .select("id")
        .eq("organization_id", data.id)
        .eq("hierarchy_level", 1)
        .single();
      if (roleData) assignedRoleId = roleData.id;
    }
    await addMemberToOrganization(data.id, creatorUserId, "founder", assignedRoleId);
  }

  return data as Organization;
}

/**
 * Update organization
 */
export async function updateOrganization(id: string, updates: { name?: string }) {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());

  const updateData: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };

  // If name is updated, regenerate slug
  if (updates.name) {
    updateData.slug = generateSlug(updates.name);
  }

  const { data, error } = await supabase.from("organizations").update(updateData).eq("id", id).select().single();

  if (error) throw error;
  return data as Organization;
}

/**
 * Add a member to an organization
 */
export async function addMemberToOrganization(
  organizationId: string,
  userId: string,
  role = "intern",
  assignedRoleId?: string,
) {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());

  const insertData: Record<string, unknown> = {
    organization_id: organizationId,
    user_id: userId,
    role,
  };
  if (assignedRoleId) {
    insertData.assigned_role_id = assignedRoleId;
  }

  const { data, error } = await supabase.from("organization_members").insert(insertData).select().single();

  if (error) {
    console.error("addMemberToOrganization error:", error);
    throw error;
  }
  return data as OrganizationMember;
}

/**
 * Get all members of an organization
 */
export async function getOrganizationMembers(organizationId: string) {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());
  const { data, error } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as OrganizationMember[];
}

/**
 * Get user's membership in an organization
 */
export async function getUserMembership(organizationId: string, userId: string) {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());
  const { data, error } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    throw error;
  }

  return data as OrganizationMember;
}

/**
 * Get all organizations a user belongs to
 */
export async function getUserOrganizations(userId: string) {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(*)")
    .eq("user_id", userId);

  if (error) throw error;
  return data.map((item: any) => ({
    ...item.organizations,
    userRole: item.role,
  }));
}

/**
 * Update member role
 */
export async function updateMemberRole(organizationId: string, userId: string, role?: string, assignedRoleId?: string) {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (role !== undefined) updateData.role = role;
  if (assignedRoleId !== undefined) updateData.assigned_role_id = assignedRoleId;

  const { data, error } = await supabase
    .from("organization_members")
    .update(updateData)
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data as OrganizationMember;
}

/**
 * Remove member from organization
 */
export async function removeMemberFromOrganization(organizationId: string, userId: string) {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (error) throw error;
}

/**
 * Verify invitation code
 */
export async function verifyOrganizationCode(slug: string, code: string) {
  const admin = getAdminClient();
  const supabase = admin ?? (await createSupabaseServerClient());
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug, hierarchy_type")
    .eq("slug", slug)
    .eq("invitation_code", code)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}
