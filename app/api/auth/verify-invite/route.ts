import { apiError, apiSuccess } from "@/lib/api-response";
import { getSession } from "@/lib/auth/session";
import { corsPreflight, withCors } from "@/lib/cors";
import { addMemberToOrganization, verifyOrganizationCode } from "@/lib/db/organizations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export function OPTIONS() {
  return corsPreflight();
}

// CORS-enabled: the desktop app verifies an invite code directly against the
// deployed origin before a session exists, so the resulting pending_join_org
// cookie lands on the same origin the browser's OAuth callback will read
// from. See lib/cors.ts.
export async function POST(req: Request) {
  try {
    const { orgSlug, code } = await req.json();

    if (!orgSlug || !code) {
      return withCors(apiError("Organization Name and Code are required", 400));
    }

    // Verify the code against the database
    const org = await verifyOrganizationCode(orgSlug, code);

    if (!org) {
      return withCors(apiError("Invalid Organization Name or Invitation Code", 400));
    }

    const session = await getSession();
    if (session) {
      const { user } = session;
      // User is logged in, add them to the organization immediately!
      let assignedRoleId: string | undefined;

      if (org.hierarchy_type === "custom") {
        const supabase = await createSupabaseServerClient();
        const { data: roles } = await supabase
          .from("roles")
          .select("id")
          .eq("organization_id", org.id)
          .order("hierarchy_level", { ascending: false }); // lowest role first (highest hierarchy level)
        if (roles && roles.length > 0) {
          assignedRoleId = roles[0].id;
        }
      }

      await addMemberToOrganization(org.id, user.id, "intern", assignedRoleId);

      return withCors(apiSuccess({ success: true, slug: org.slug, name: org.name, id: org.id, loggedIn: true }));
    }

    // If valid but not logged in, set a cookie to indicate pending join
    const cookieStore = await cookies();
    cookieStore.set("pending_join_org", org.slug, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10, // 10 minutes
    });

    return withCors(apiSuccess({ success: true, slug: org.slug, name: org.name, id: org.id, loggedIn: false }));
  } catch (error) {
    return withCors(apiError("Internal Server Error", 500));
  }
}
