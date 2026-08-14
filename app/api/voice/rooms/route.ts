import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getUserMembership } from "@/lib/db/organizations";
import { listOpenRooms, openRoom } from "@/lib/db/voice";

/** GET /api/voice/rooms?organizationId=... — every live room in the org. */
export async function GET(req: Request) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    if (!organizationId) return apiError("organizationId is required", 400);

    const membership = await getUserMembership(organizationId, user.id);
    if (!membership) return apiError("Not a member of this organization", 403);

    const rooms = await listOpenRooms(organizationId);
    return apiSuccess({ rooms });
  } catch (err) {
    console.error("GET /api/voice/rooms failed", err);
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * POST /api/voice/rooms
 * Body: { scope, organizationId, workspaceId? }
 *
 * Idempotent: returns the live room for the container, opening one only when
 * there is none. Pressing "call" when a call is already running joins it.
 */
export async function POST(req: Request) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    let body: { scope?: string; organizationId?: string; workspaceId?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const { scope, organizationId, workspaceId } = body;

    if (scope !== "organization" && scope !== "workspace") {
      return apiError("scope must be 'organization' or 'workspace'", 400);
    }
    if (!organizationId) return apiError("organizationId is required", 400);
    if (scope === "workspace" && !workspaceId) {
      return apiError("workspaceId is required for a workspace call", 400);
    }

    const membership = await getUserMembership(organizationId, user.id);
    if (!membership) return apiError("Not a member of this organization", 403);

    const room = await openRoom({ scope, organizationId, workspaceId, startedBy: user.id });
    return apiSuccess(room, 201);
  } catch (err) {
    console.error("POST /api/voice/rooms failed", {
      code: (err as { code?: string })?.code,
      message: err instanceof Error ? err.message : err,
    });
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
