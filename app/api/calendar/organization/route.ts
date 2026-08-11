import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getOrganizationEvents } from "@/lib/db/events";
import { getOrganizationBySlug, getUserOrganizations } from "@/lib/db/organizations";
import type { NextRequest } from "next/server";

// GET /api/calendar/organization
export async function GET(req: NextRequest) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { searchParams } = new URL(req.url);
    const orgSlug = searchParams.get("org");

    let targetOrg = null;
    if (orgSlug) {
      targetOrg = await getOrganizationBySlug(orgSlug);
    }

    if (!targetOrg) {
      const userOrgs = await getUserOrganizations(user.id);
      if (userOrgs && userOrgs.length > 0) {
        targetOrg = userOrgs[0];
      }
    }

    if (!targetOrg) {
      return apiSuccess([]);
    }

    const events = await getOrganizationEvents(targetOrg.id);
    return apiSuccess(events);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to fetch organization calendar", 500);
  }
}
