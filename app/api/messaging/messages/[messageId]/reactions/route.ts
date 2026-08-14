import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getMessageWithCounts, toggleReaction } from "@/lib/db/messaging";

/** Emoji are short, but "short" needs a bound — this is a text column. */
const EMOJI_MAX_LENGTH = 32;

/**
 * POST /api/messaging/messages/[messageId]/reactions
 * Body: { emoji }
 *
 * Toggles: adds the caller's reaction, or removes it if already present.
 * A single RPC rather than the client choosing POST vs DELETE — a fast double
 * click would otherwise race itself into a unique-constraint error.
 */
export async function POST(req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { messageId } = await params;

    let body: { emoji?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const emoji = body.emoji?.trim();
    if (!emoji) return apiError("emoji is required", 400);
    if (emoji.length > EMOJI_MAX_LENGTH) return apiError("emoji is too long", 400);

    try {
      const reacted = await toggleReaction({ messageId, emoji });

      // Return the message with fresh tallies so the client renders the real
      // counts rather than guessing at its own increment — two people
      // reacting at once would otherwise drift apart until a refetch.
      const message = await getMessageWithCounts(messageId);
      if (!message) return apiError("Message not found", 404);

      return apiSuccess({ reacted, message });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      // 42501 from the function's own auth guard or the RLS insert policy.
      if (code === "42501") return apiError("You do not have access to this message", 403);
      if (code === "23503") return apiError("Message not found", 404);
      throw error;
    }
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
