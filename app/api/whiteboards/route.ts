import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getUserMembership } from "@/lib/db/organizations";
import { getOrCreateWhiteboard, listWhiteboards } from "@/lib/db/whiteboards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/whiteboards?organizationId=...
 *
 * Every board the caller can open, split the way the flyout renders them.
 */
export async function GET(req: Request) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user, supabase } = session;

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    if (!organizationId) return apiError("organizationId is required", 400);

    const [membership, boards] = await Promise.all([
      supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("user_id", user.id)
        .maybeSingle(),
      listWhiteboards(organizationId),
    ]);

    // Checked in the app layer as well as by RLS: without this a non-member
    // gets an empty list, which reads as "no boards yet" rather than a 403.
    if (!membership.data) return apiError("Not a member of this organization", 403);

    const organizationBoards = boards.filter((b) => b.scope === "organization");
    const workspaceBoards: Record<string, typeof boards> = {};
    for (const board of boards) {
      if (board.scope !== "workspace" || !board.workspace_id) continue;
      const bucket = workspaceBoards[board.workspace_id] ?? [];
      bucket.push(board);
      workspaceBoards[board.workspace_id] = bucket;
    }

    return apiSuccess({ organizationBoards, workspaceBoards });
  } catch (err) {
    console.error("GET /api/whiteboards failed", err);
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * POST /api/whiteboards
 * Body: { scope, organizationId, workspaceId? }
 *
 * Returns the container's single board, creating it on first open. There is no
 * `name` and no way to make a second: one organisation board, one board per
 * workspace, enforced by unique indexes in the database.
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
      return apiError("workspaceId is required for a workspace board", 400);
    }

    const membership = await getUserMembership(organizationId, user.id);
    if (!membership) return apiError("Not a member of this organization", 403);

    // A workspace board must live in the organisation it claims to, or it
    // would be listed under an org the workspace does not belong to.
    if (scope === "workspace") {
      const supabase = await createSupabaseServerClient();
      const { data: workspace, error } = await supabase
        .from("workspaces")
        .select("id, organization_id")
        .eq("id", workspaceId as string)
        .maybeSingle();

      if (error) return apiError(error.message, 500);
      if (!workspace) return apiError("Workspace not found", 404);
      if (workspace.organization_id !== organizationId) {
        return apiError("Workspace does not belong to this organization", 400);
      }
    }

    try {
      const board = await getOrCreateWhiteboard({ scope, organizationId, workspaceId });
      return apiSuccess(board);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "42501") return apiError("You do not have permission to open this board", 403);
      // 42883 = undefined_function: migration 015 has not been applied.
      if (code === "42883") {
        return apiError("Whiteboards are not set up yet — apply migration 015", 500);
      }
      throw error;
    }
  } catch (err) {
    console.error("POST /api/whiteboards failed", {
      code: (err as { code?: string })?.code,
      message: err instanceof Error ? err.message : err,
    });
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
