import { apiError, apiSuccess } from "@/lib/api-response";
import { corsPreflight, withCors } from "@/lib/cors";
import { getOrganizationBySlug } from "@/lib/db/organizations";
import type { NextRequest } from "next/server";

export function OPTIONS() {
  return corsPreflight();
}

// GET /api/auth/org/[slug] - Verify organization exists
//
// CORS-enabled: the desktop app calls this directly against the deployed
// origin before a session exists (its own embedded server never shares
// cookies with the browser that completes OAuth). See lib/cors.ts.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const organization = await getOrganizationBySlug(slug);

    if (!organization) {
      return withCors(apiError("Not found", 404));
    }

    return withCors(
      apiSuccess({
        exists: true,
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      }),
    );
  } catch (error) {
    return withCors(apiError("Failed to fetch organization", 500));
  }
}
