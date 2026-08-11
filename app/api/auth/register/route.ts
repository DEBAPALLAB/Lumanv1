import { apiError, apiSuccess } from "@/lib/api-response";
import { addMemberToOrganization, getOrganizationBySlug, getOrganizationMembers } from "@/lib/db/organizations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password, role, orgSlug } = body;

    if (!name || !email || !password || !role || !orgSlug) {
      return apiError("All fields are required", 400);
    }

    // Validate role
    if (!["founder", "admin", "intern"].includes(role)) {
      return apiError("Invalid role", 400);
    }

    const supabase = await createSupabaseServerClient();

    // Verify organization exists
    const organization = await getOrganizationBySlug(orgSlug);
    if (!organization) {
      return apiError("Organization not found", 404);
    }

    // Smart Role Assignment
    // Check if organization has any members
    const members = await getOrganizationMembers(organization.id);
    const assignedRole = members.length === 0 ? "founder" : "intern";

    // Invite validation for existing organizations: require verified invite code
    if (assignedRole === "intern") {
      const cookieStore = await cookies();
      const pendingOrg = cookieStore.get("pending_join_org")?.value;
      if (!pendingOrg || pendingOrg !== orgSlug) {
        return apiError("An invitation code is required to join this organization.", 403);
      }

      // Clean up the verified cookie on success
      cookieStore.delete("pending_join_org");
    }

    // Create user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          organization_id: organization.id,
          role: assignedRole, // Use calculated role
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login?org=${orgSlug}`,
      },
    });

    if (authError) {
      if (authError.message.includes("already registered")) {
        return apiError("This email is already registered", 400);
      }
      return apiError(authError.message, 400);
    }

    if (!authData.user) {
      return apiError("Failed to create user", 500);
    }

    // Add user to organization
    try {
      await addMemberToOrganization(organization.id, authData.user.id, assignedRole);
    } catch (memberError) {
      // User was created but failed to add to organization
      // This should be handled by a cleanup job or manual intervention
    }

    return apiSuccess(
      {
        success: true,
        message: "Account created successfully. Please check your email to verify your account.",
        user: {
          id: authData.user.id,
          email: authData.user.email,
        },
      },
      201,
    );
  } catch (err) {
    return apiError("Internal server error", 500);
  }
}
