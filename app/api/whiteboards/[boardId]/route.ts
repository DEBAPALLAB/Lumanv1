import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getWhiteboard, saveScene } from "@/lib/db/whiteboards";

/** GET /api/whiteboards/[boardId] — the board and its saved scene. */
export async function GET(_req: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { boardId } = await params;
    const board = await getWhiteboard(boardId);

    // RLS already hid it if the caller cannot reach it, so a miss here is
    // indistinguishable from "does not exist" — which is the intent.
    if (!board) return apiError("Board not found", 404);

    return apiSuccess(board);
  } catch (err) {
    console.error("GET /api/whiteboards/[boardId] failed", err);
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * PUT /api/whiteboards/[boardId]
 * Body: { scene }
 *
 * The periodic snapshot. Live strokes travel over Realtime broadcast; this is
 * what a late joiner loads and what survives a reload.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { boardId } = await params;

    let body: { scene?: { elements?: unknown[] } };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    if (!body.scene || !Array.isArray(body.scene.elements)) {
      return apiError("scene.elements must be an array", 400);
    }

    // A ceiling on scene size. Without it a runaway client could write an
    // unbounded document into a single row.
    if (body.scene.elements.length > 20_000) {
      return apiError("This board has too many elements to save", 413);
    }

    await saveScene(boardId, { elements: body.scene.elements as never[] }, user.id);
    return apiSuccess({ ok: true });
  } catch (err) {
    console.error("PUT /api/whiteboards/[boardId] failed", {
      code: (err as { code?: string })?.code,
      message: err instanceof Error ? err.message : err,
    });
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
