import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getMessageWithCounts, getThreadReplies } from "@/lib/db/messaging";

/**
 * GET /api/messaging/channels/[channelId]/messages/[messageId]/thread
 *
 * The thread root plus every reply, oldest first. Unpaginated by design —
 * threads are bounded in practice and capped in the data layer.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string }> },
) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { channelId, messageId } = await params;

    const root = await getMessageWithCounts(messageId);
    // RLS hides a message the caller cannot reach, so a missing root covers
    // both "no such thread" and "not yours to read".
    if (!root || root.channel_id !== channelId) return apiError("Message not found", 404);

    const replies = await getThreadReplies({ parentMessageId: messageId });

    return apiSuccess({ root, replies });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
