import { apiError, apiSuccess } from "@/lib/api-response";
import { getOrganizationBySlug, getUserMembership } from "@/lib/db/organizations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, orgSlug } = body;

    if (!email || !password || !orgSlug) {
      return apiError("Email, password, and organization are required", 400);
    }

    const supabase = await createSupabaseServerClient();

    // Verify organization exists
    const organization = await getOrganizationBySlug(orgSlug);
    if (!organization) {
      return apiError("Organization not found", 404);
    }

    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return apiError("Invalid email or password", 401);
    }

    // Check if user is a member of this organization
    const membership = await getUserMembership(organization.id, authData.user.id);
    if (!membership) {
      // User exists but not in this organization
      await supabase.auth.signOut();
      return apiError("You are not a member of this organization", 403);
    }

    // Check if email is verified
    if (!authData.user.email_confirmed_at) {
      return apiError("Please verify your email address before logging in", 403);
    }

    return apiSuccess({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        role: membership.role,
        organizationId: organization.id,
        organizationName: organization.name,
      },
    });
  } catch (err) {
    return apiError("Internal server error", 500);
  }
}
