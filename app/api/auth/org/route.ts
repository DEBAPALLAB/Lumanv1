import { apiError, apiSuccess } from "@/lib/api-response";
import { getSession } from "@/lib/auth/session";
import { createOrganization, getOrganizations } from "@/lib/db/organizations";
import type { NextRequest } from "next/server";

// GET /api/auth/org - List all organizations
export async function GET() {
  try {
    const organizations = await getOrganizations();
    return apiSuccess(organizations);
  } catch (error) {
    return apiError("Failed to fetch organizations", 500);
  }
}

// POST /api/auth/org - Create new organization
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, hierarchyType = "fixed", customRoles } = body;

    if (!name || name.trim().length < 3) {
      return apiError("Organization name must be at least 3 characters", 400);
    }

    const session = await getSession();
    const creatorUserId = session ? session.user.id : undefined;

    const organization = await createOrganization(name.trim(), creatorUserId, hierarchyType, customRoles);

    return apiSuccess(
      {
        ...organization,
        loggedIn: !!session,
      },
      201,
    );
  } catch (error) {
    return apiError("Failed to create organization", 500);
  }
}
