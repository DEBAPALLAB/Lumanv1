import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Organization, OrganizationMember } from "@/types/organization";

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
 * Get all organizations
 */
export async function getOrganizations() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("organizations").select("*").order("created_at", { ascending: true });

  if (error) throw error;
  return data as Organization[];
}

/**
 * Get organization by slug
 */
export async function getOrganizationBySlug(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("organizations").select("*").eq("slug", slug).single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    throw error;
  }

  return data as Organization;
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(id: string) {
  const supabase = await createSupabaseServerClient();
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
  const supabase = await createSupabaseServerClient();

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
  const supabase = await createSupabaseServerClient();

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
  const supabase = await createSupabaseServerClient();

  const insertData: Record<string, unknown> = {
    organization_id: organizationId,
    user_id: userId,
    role,
  };
  if (assignedRoleId) {
    insertData.assigned_role_id = assignedRoleId;
  }

  const { data, error } = await supabase.from("organization_members").insert(insertData).select().single();

  if (error) throw error;
  return data as OrganizationMember;
}

/**
 * Get all members of an organization
 */
export async function getOrganizationMembers(organizationId: string) {
  const supabase = await createSupabaseServerClient();
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
  const supabase = await createSupabaseServerClient();
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
  const supabase = await createSupabaseServerClient();
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
  const supabase = await createSupabaseServerClient();

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
  const supabase = await createSupabaseServerClient();
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
  const supabase = await createSupabaseServerClient();
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
