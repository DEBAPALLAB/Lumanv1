import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { deleteOrgFile, getOrgFile } from "@/lib/db/org-files";
import { getUserMembership } from "@/lib/db/organizations";
import { del } from "@vercel/blob";

export const runtime = "nodejs";

/**
 * DELETE /api/org-files/:id
 *
 * Any member of the file's organisation may delete it (see the RLS policy
 * comment in migration 019) — a shared library only one uploader can tidy
 * becomes permanent clutter once that person leaves.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { id } = await params;
    const file = await getOrgFile(id);
    if (!file) return apiError("File not found", 404);

    const membership = await getUserMembership(file.organization_id, user.id);
    if (!membership) return apiError("Not a member of this organization", 403);

    await deleteOrgFile(id);

    // Best-effort: the row is already gone, and a dangling blob is a storage
    // cost rather than a visible bug, so a delete failure here should not
    // surface as a failed request.
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(file.blob_url);
      } catch (err) {
        console.error("Failed to delete blob for org file", id, err);
      }
    }

    return apiSuccess({ ok: true });
  } catch (err) {
    console.error("DELETE /api/org-files/[id] failed", err);
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
