import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { deleteAnnotation } from "@/lib/db/pdf-annotations";

export const runtime = "nodejs";

/**
 * DELETE /api/org-files/:id/annotations/:annotationId
 *
 * Only the author may delete — enforced by the RLS policy in migration 020,
 * so someone else's annotation simply matches no row.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; annotationId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { annotationId } = await params;
    await deleteAnnotation(annotationId);

    return apiSuccess({ ok: true });
  } catch (err) {
    console.error("DELETE /api/org-files/[id]/annotations/[annotationId] failed", err);
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
