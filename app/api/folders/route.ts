import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { createFolder, deleteFolder, getFolders } from "@/lib/db/folders";
import { getUserMembership } from "@/lib/db/organizations";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) return apiError("Org ID required", 400);

  const session = await requireUser();
  if (!session) return apiError("Unauthorized", 401);
  const { user } = session;

  const member = await getUserMembership(orgId, user.id);
  if (!member) return apiError("Not a member", 403);

  const folders = await getFolders(orgId);
  return apiSuccess(folders);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, orgId, color } = body;

    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const member = await getUserMembership(orgId, user.id);
    if (!member) return apiError("Not a member", 403);

    const folder = await createFolder(name, orgId, color || "stone", user.id);
    return apiSuccess(folder);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("id");
  if (!folderId) return apiError("ID required", 400);

  const session = await requireUser();
  if (!session) return apiError("Unauthorized", 401);

  try {
    await deleteFolder(folderId);
    return apiSuccess({ success: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
