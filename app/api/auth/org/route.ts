import { apiError, apiSuccess } from "@/lib/api-response";
import { getSession } from "@/lib/auth/session";
import { createOrganization, getOrganizations, issueFounderClaim } from "@/lib/db/organizations";
import { cookies } from "next/headers";
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

    // Anonymous creation: this org has zero members, and register/route.ts
    // grants Founder to whoever registers against its slug first. Bind that
    // grant to this request via a short-lived signed cookie so a stranger
    // can't race the real creator to claim Founder on an org they just made.
    if (!session) {
      const cookieStore = await cookies();
      cookieStore.set("founder_claim", issueFounderClaim(organization.id), {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 10,
      });
    }

    return apiSuccess(
      {
        ...organization,
        loggedIn: !!session,
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create organization";
    const isNameCollision = message.includes("already exists");
    return apiError(message, isNameCollision ? 409 : 500);
  }
}
