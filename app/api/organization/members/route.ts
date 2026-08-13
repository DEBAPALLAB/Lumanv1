import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getOrganizationMembers, getUserMembership, updateMemberRole } from "@/lib/db/organizations";
import { delegateIfSecretMissing } from "@/lib/server/delegate";
import { getUserById } from "@/lib/supabase/admin";
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

    // Fetch user details for each member
    const membersWithDetails = await Promise.all(
      members.map(async (member) => {
        const userData = await getUserById(member.user_id);

        if (!userData) {
          return { ...member, full_name: "Unknown", email: "Unknown" };
        }

        return {
          ...member,
          full_name: userData.user_metadata?.full_name || userData.user_metadata?.name || "Unknown",
          email: userData.email || "Unknown",
        };
      }),
    );

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
