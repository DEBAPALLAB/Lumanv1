import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { joinRoom, leaveRoom, listParticipants, touchRoom } from "@/lib/db/voice";

/** GET /api/voice/rooms/[roomId] — who is currently in the room. */
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { roomId } = await params;
    const participants = await listParticipants(roomId);
    return apiSuccess({ participants });
  } catch (err) {
    console.error("GET /api/voice/rooms/[roomId] failed", err);
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * POST /api/voice/rooms/[roomId]
 * Body: { action: "join" | "leave" | "touch" }
 *
 * One endpoint for the three membership transitions rather than three routes:
 * they share their auth, their room lookup and their error handling, and the
 * client always knows which it wants.
 */
export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { roomId } = await params;

    let body: { action?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    switch (body.action) {
      case "join":
        await joinRoom(roomId, user.id);
        break;
      case "leave":
        await leaveRoom(roomId, user.id);
        break;
      case "touch":
        // Keeps the 2-minute idle deadline pushed out while somebody is
        // actually talking. Cheap enough to send on a timer.
        await touchRoom(roomId);
        break;
      default:
        return apiError("action must be 'join', 'leave' or 'touch'", 400);
    }

    const participants = await listParticipants(roomId);
    return apiSuccess({ ok: true, participants });
  } catch (err) {
    console.error("POST /api/voice/rooms/[roomId] failed", {
      code: (err as { code?: string })?.code,
      message: err instanceof Error ? err.message : err,
    });
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
