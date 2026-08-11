import { apiError, apiSuccess } from "@/lib/api-response";
import { getOrganizationBySlug } from "@/lib/db/organizations";
import type { NextRequest } from "next/server";

// GET /api/auth/org/[slug] - Verify organization exists
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const organization = await getOrganizationBySlug(slug);

    if (!organization) {
      return apiError("Not found", 404);
    }

    return apiSuccess({
      exists: true,
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    });
  } catch (error) {
    return apiError("Failed to fetch organization", 500);
  }
}
