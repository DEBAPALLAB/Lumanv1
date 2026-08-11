import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getOrganizationBySlug, getUserOrganizations } from "@/lib/db/organizations";
import { getTasksForWorkspaces, getWorkspaceTasks, upsertTasks } from "@/lib/db/tasks";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tasks, workspaceId } = body;

    if (!tasks || !Array.isArray(tasks) || !workspaceId) {
      return apiError("Invalid data", 400);
    }

    const data = await upsertTasks(tasks, workspaceId);
    return apiSuccess(data);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal Error", 500);
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const orgSlug = searchParams.get("org");

    if (workspaceId) {
      const data = await getWorkspaceTasks(workspaceId);
      return apiSuccess(data);
    }

    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    let targetOrg = null;
    if (orgSlug) {
      targetOrg = await getOrganizationBySlug(orgSlug);
    }

    if (!targetOrg) {
      const userOrgs = await getUserOrganizations(user.id);
      if (userOrgs && userOrgs.length > 0) {
        targetOrg = userOrgs[0];
      }
    }

    if (!targetOrg) {
      return apiSuccess([]);
    }

    // Get workspace IDs of this organization
    const supabase = await createSupabaseServerClient();
    const { data: workspaces, error: wsError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("organization_id", targetOrg.id);

    if (wsError) throw wsError;

    const workspaceIds = workspaces.map((w: any) => w.id);
    const data = await getTasksForWorkspaces(workspaceIds);
    return apiSuccess(data);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal Error", 500);
  }
}
