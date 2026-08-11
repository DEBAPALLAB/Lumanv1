import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getOrganizationBySlug, getUserMembership, getUserOrganizations } from "@/lib/db/organizations";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await requireUser();
    const { searchParams } = new URL(request.url);
    const orgSlug = searchParams.get("org");

    if (!session) {
      return apiError("Unauthorized", 401);
    }
    const { user } = session;

    // Get user's organizations
    const organizations = await getUserOrganizations(user.id);

    // Default values
    let role = "intern";
    const ownerName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

    // If orgSlug provided, get specific role
    if (orgSlug) {
      const org = await getOrganizationBySlug(orgSlug);
      if (!org) {
        return apiError("Organization not found", 404);
      }
      const membership = await getUserMembership(org.id, user.id);
      if (!membership) {
        return apiError("Not a member of this organization", 403);
      }
      role = membership.role;
    } else {
      if (organizations.length === 0) {
        return apiError("User has no organizations", 403);
      }
      // Use first organization as default
      role = organizations[0].userRole;
    }

    return apiSuccess({
      authenticated: true,
      user: {
        userId: user.id,
        email: user.email,
        role: role,
        ownerName: ownerName,
        organizations,
      },
    });
  } catch (error) {
    return apiError("Failed to get session", 500);
  }
}
