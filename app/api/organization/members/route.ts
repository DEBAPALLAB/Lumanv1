import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getOrganizationMembers, getUserMembership, updateMemberRole } from "@/lib/db/organizations";
import { delegateIfSecretMissing } from "@/lib/server/delegate";
import { getUserSummaries } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    // Resolving a teammate's name and email needs the Supabase Admin API, and
    // therefore the service-role key — which never ships to a user machine.
    // On desktop this hands the request to the deployed backend, which has it.
    const delegated = await delegateIfSecretMissing(req, ["SUPABASE_SERVICE_ROLE_KEY"]);
    if (delegated) return delegated;

    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return apiError("Organization ID is required", 400);
    }

    // Verify user is a member of the organization
    const membership = await getUserMembership(orgId, user.id);
    if (!membership) {
      return apiError("Unauthorized", 403);
    }

    const members = await getOrganizationMembers(orgId);

    // One Admin API call for the whole org, not one per member. The previous
    // per-member lookup made this route's latency scale with headcount, which
    // was noticeable wherever it sits on a page's critical path.
    const summaries = await getUserSummaries(members.map((member) => member.user_id));

    const membersWithDetails = members.map((member) => {
      const summary = summaries.get(member.user_id);
      return {
        ...member,
        full_name: summary?.full_name ?? "Unknown",
        email: summary?.email ?? "Unknown",
      };
    });

    return apiSuccess(membersWithDetails);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const body = await req.json();
    const { orgId, userId, role, assignedRoleId } = body;

    if (!orgId || !userId || (!role && !assignedRoleId)) {
      return apiError("Missing required fields", 400);
    }

    // Verify requesting user is admin/founder
    const requesterMembership = await getUserMembership(orgId, user.id);
    if (!requesterMembership || (requesterMembership.role !== "founder" && requesterMembership.role !== "admin")) {
      return apiError("Forbidden: Insufficient permissions", 403);
    }

    const updatedMember = await updateMemberRole(orgId, userId, role, assignedRoleId);
    return apiSuccess(updatedMember);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
