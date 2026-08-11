import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getUserMembership } from "@/lib/db/organizations";
import { createWorkspace, deleteWorkspace, getWorkspaces, updateWorkspace } from "@/lib/db/workspaces";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return apiError("orgId is required", 400);
    }

    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const membership = await getUserMembership(orgId, user.id);
    if (!membership) {
      return apiError("Not a member of this organization", 403);
    }

    const rawWorkspaces = await getWorkspaces(orgId, user.id);
    const userRole = membership.role; // 'founder', 'admin', 'intern'

    const filtered = rawWorkspaces.filter((ws) => {
      // Owner/creator can always access
      if (ws.owner_id === user.id || ws.created_by === user.id) {
        return true;
      }
      // Otherwise enforce visibility checks
      if (ws.role === "founder") {
        return userRole === "founder";
      }
      if (ws.role === "admin") {
        return userRole === "founder" || userRole === "admin";
      }
      // 'intern' workspaces are visible to all members
      return true;
    });

    return apiSuccess(filtered);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ownerName, ownerId, role: requestedRole, folderId, color } = body;

    if (!ownerName) {
      return apiError("ownerName is required", 400);
    }

    if (!ownerId) {
      return apiError("ownerId is required", 400);
    }

    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const membership = await getUserMembership(ownerId, user.id);
    if (!membership) {
      return apiError("Not a member of this organization", 403);
    }

    const roleToAssign = requestedRole || "intern";

    const data = await createWorkspace({
      ownerName,
      role: roleToAssign,
      orgId: ownerId,
      userId: user.id,
      folderId,
      color,
    });

    return apiSuccess(data, 201);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("id");

    if (!workspaceId) {
      return apiError("Workspace ID is required", 400);
    }

    const body = await req.json();
    const { folderId, color, name, role } = body;

    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user, supabase } = session;

    const { data: wsData } = await supabase.from("workspaces").select("organization_id").eq("id", workspaceId).single();

    let isFounder = false;

    if (wsData?.organization_id) {
      const membership = await getUserMembership(wsData.organization_id, user.id);
      if (membership && membership.role === "founder") {
        isFounder = true;
      }
    }

    await updateWorkspace(workspaceId, user.id, { folderId, color, name, role }, isFounder);

    return apiSuccess({ success: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("id");

    if (!workspaceId) {
      return apiError("Workspace ID is required", 400);
    }

    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user, supabase } = session;

    // We need to check if user is founder of the org the workspace belongs to
    const { data: wsData } = await supabase.from("workspaces").select("organization_id").eq("id", workspaceId).single();

    let isFounder = false;

    if (wsData?.organization_id) {
      const membership = await getUserMembership(wsData.organization_id, user.id);
      if (membership && membership.role === "founder") {
        isFounder = true;
      }
    }

    // We pass user.id as ownerId to ensure they own it.
    await deleteWorkspace(workspaceId, user.id, isFounder);

    return apiSuccess({ success: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
