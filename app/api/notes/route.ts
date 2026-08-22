import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    // `workspaceIds` (comma-separated) fetches several workspaces at once. The
    // dashboard needs notes for every workspace it lists, and asking per
    // workspace meant N requests each paying full middleware + auth cost.
    // `workspaceId` still works exactly as before for single-workspace callers.
    const workspaceIdsParam = searchParams.get("workspaceIds");

    if (!workspaceId && !workspaceIdsParam) {
      return apiError("workspaceId or workspaceIds is required", 400);
    }

    const columns = "id, workspace_id, title, created_at, tags, due_date";

    if (workspaceIdsParam) {
      const ids = workspaceIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      if (ids.length === 0) return apiError("workspaceIds must contain at least one id", 400);

      const { data, error } = await supabase
        .from("notes")
        .select(columns)
        .in("workspace_id", ids)
        .order("created_at", { ascending: false });

      if (error) {
        return apiError(error.message, 500);
      }

      // Grouped by workspace so the caller does not have to bucket them, and
      // so a workspace with no notes is still represented.
      const grouped: Record<string, unknown[]> = {};
      for (const id of ids) grouped[id] = [];
      for (const note of data ?? []) {
        // Every requested id was seeded above; RLS can only ever return fewer
        // workspaces than asked for, never more, so this lookup always hits.
        grouped[note.workspace_id]?.push(note);
      }

      return apiSuccess(grouped);
    }

    const { data, error } = await supabase
      .from("notes")
      .select(columns)
      .eq("workspace_id", workspaceId!)
      .order("created_at", { ascending: false });

    if (error) {
      return apiError(error.message, 500);
    }

    return apiSuccess(data ?? []);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    let body: {
      workspaceId?: string;
      title?: string;
      templateType?: string;
      visibilityMode?: string;
      minimumVisibleRoleLevel?: number;
      specificRoleIds?: string[];
    };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const {
      workspaceId,
      title,
      templateType,
      visibilityMode = "public",
      minimumVisibleRoleLevel,
      specificRoleIds,
    } = body;

    if (!workspaceId || !title || !templateType) {
      return apiError("Missing required fields", 400);
    }

    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    // Retrieve workspace organization context
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("organization_id")
      .eq("id", workspaceId)
      .single();

    if (wsError || !workspace) {
      return apiError("Workspace not found", 404);
    }

    let userHierarchyLevel: number | null = null;
    let userRoleId: string | null = null;

    if (workspace.organization_id) {
      // Fetch user's membership and hierarchy level
      const { data: member, error: memberError } = await supabase
        .from("organization_members")
        .select("assigned_role_id, roles(hierarchy_level)")
        .eq("organization_id", workspace.organization_id)
        .eq("user_id", user.id)
        .single();

      if (memberError || !member) {
        return apiError("Not a member of this organization", 403);
      }

      userRoleId = member.assigned_role_id;
      const rolesObj = member.roles as any;
      userHierarchyLevel = rolesObj?.hierarchy_level;

      if (userHierarchyLevel === null || userHierarchyLevel === undefined) {
        return apiError("User role hierarchy level not found", 403);
      }

      // Enforce Note Creation Rules:
      // Creator must have visibility to the note they are creating under the rules
      if (visibilityMode === "hierarchy" && minimumVisibleRoleLevel !== undefined) {
        if (userHierarchyLevel > minimumVisibleRoleLevel) {
          return apiError("Cannot create note visible above your hierarchy level", 403);
        }
      } else if (visibilityMode === "specific" && specificRoleIds) {
        if (!specificRoleIds.includes(userRoleId || "")) {
          return apiError("Cannot create note that you do not have visibility for", 403);
        }
      }
    }

    const { data, error } = await supabase
      .from("notes")
      .insert({
        workspace_id: workspaceId,
        title,
        template_type: templateType,
        content: { type: "doc", content: [{ type: "paragraph" }] },
        visibility_mode: visibilityMode,
        minimum_visible_role_level: minimumVisibleRoleLevel,
        specific_role_ids: specificRoleIds,
        created_by_role_level: userHierarchyLevel,
      })
      .select()
      .single();

    if (error) {
      return apiError(error.message, 500);
    }

    return apiSuccess(data, 201);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
