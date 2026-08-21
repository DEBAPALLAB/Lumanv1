import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getOrgFile } from "@/lib/db/org-files";
import { getUserMembership } from "@/lib/db/organizations";
import {
  type AnnotationGeometry,
  type AnnotationKind,
  createAnnotation,
  listAnnotations,
} from "@/lib/db/pdf-annotations";

export const runtime = "nodejs";

const KINDS: AnnotationKind[] = ["highlight", "draw", "note"];

/** GET /api/org-files/:id/annotations — every mark on this file. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { id } = await params;
    const file = await getOrgFile(id);
    if (!file) return apiError("File not found", 404);

    const membership = await getUserMembership(file.organization_id, user.id);
    if (!membership) return apiError("Not a member of this organization", 403);

    return apiSuccess(await listAnnotations(id));
  } catch (err) {
    console.error("GET /api/org-files/[id]/annotations failed", err);
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * POST /api/org-files/:id/annotations
 * Body: { page, kind, color, geometry, body?, authorName? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { id } = await params;
    const file = await getOrgFile(id);
    if (!file) return apiError("File not found", 404);

    const membership = await getUserMembership(file.organization_id, user.id);
    if (!membership) return apiError("Not a member of this organization", 403);

    let body: {
      page?: number;
      kind?: string;
      color?: string;
      geometry?: AnnotationGeometry;
      body?: string | null;
      authorName?: string;
    };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const page = Number(body.page);
    if (!Number.isInteger(page) || page < 1) return apiError("page must be a positive integer", 400);
    if (!body.kind || !KINDS.includes(body.kind as AnnotationKind)) {
      return apiError("kind must be 'highlight', 'draw' or 'note'", 400);
    }
    if (!body.color) return apiError("color is required", 400);
    if (!body.geometry || typeof body.geometry !== "object") return apiError("geometry is required", 400);
    if (body.body != null && body.body.length > 2000) return apiError("body is too long", 400);

    const annotation = await createAnnotation({
      fileId: id,
      page,
      kind: body.kind as AnnotationKind,
      color: body.color,
      geometry: body.geometry,
      body: body.body ?? null,
      createdBy: user.id,
      authorName: body.authorName ?? "",
    });

    return apiSuccess(annotation, 201);
  } catch (err) {
    console.error("POST /api/org-files/[id]/annotations failed", err);
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
