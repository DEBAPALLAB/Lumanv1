import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { addMemberToOrganization, getOrganizationBySlug } from "@/lib/db/organizations";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orgSlug, role } = body;

    if (!orgSlug || !role) {
      return apiError("Missing required fields", 400);
    }

    if (!["founder", "admin", "intern"].includes(role)) {
      return apiError("Invalid role", 400);
    }

    // Get the authenticated user
    const session = await requireUser();
    if (!session) {
      return apiError("Not authenticated", 401);
    }
    const { user } = session;

    // Verify organization exists
    const organization = await getOrganizationBySlug(orgSlug);
    if (!organization) {
      return apiError("Organization not found", 404);
    }

    // Add user to organization with selected role
    await addMemberToOrganization(organization.id, user.id, role as "founder" | "admin" | "intern");

    return apiSuccess({ success: true });
  } catch (err) {
    return apiError("Internal server error", 500);
  }
}
