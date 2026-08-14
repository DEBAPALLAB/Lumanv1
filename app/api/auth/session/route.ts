import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getUserOrganizations } from "@/lib/db/organizations";
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

    // Get user's organizations. This already joins `organizations` and carries
    // each membership's role, so the requested org and the caller's role in it
    // can both be answered from this one result.
    const organizations = await getUserOrganizations(user.id);

    // Default values
    let role = "intern";
    const ownerName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

    if (orgSlug) {
      // Resolved in memory rather than with getOrganizationBySlug() +
      // getUserMembership(): those were two further round trips to re-fetch
      // facts already present above, and at ~200ms each they were most of this
      // route's latency. Matching on the slug also answers membership — a
      // non-member's org never appears in this list at all.
      const match = organizations.find((org) => org.slug === orgSlug);

      if (!match) {
        // Absent means either no such org or the caller is not in it. The
        // membership case is the meaningful one for a signed-in user, and
        // distinguishing them would cost the very query this avoids.
        return apiError("Not a member of this organization", 403);
      }
      role = match.userRole;
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
