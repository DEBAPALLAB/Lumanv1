import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { softDeleteMessage, updateMessage } from "@/lib/db/messaging";
import { docToText, validateMessageDoc } from "@/lib/messaging/content";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Loads a message for an authorship check, or null if RLS hides it. */
async function loadOwnMessage(messageId: string, channelId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, channel_id, author_id, deleted_at")
    .eq("id", messageId)
    .eq("channel_id", channelId)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; channel_id: string; author_id: string | null; deleted_at: string | null } | null;
}

/**
 * PATCH /api/messaging/channels/[channelId]/messages/[messageId]
 * Body: { content }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string }> },
) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { channelId, messageId } = await params;

    let body: { content?: unknown };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const invalid = validateMessageDoc(body.content);
    if (invalid) return apiError(invalid, 400);

    const existing = await loadOwnMessage(messageId, channelId);
    if (!existing) return apiError("Message not found", 404);
    if (existing.author_id !== user.id) return apiError("You can only edit your own messages", 403);
    if (existing.deleted_at) return apiError("Cannot edit a deleted message", 409);

    const message = await updateMessage({
      messageId,
      content: body.content,
      contentText: docToText(body.content),
    });

    return apiSuccess(message);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * DELETE /api/messaging/channels/[channelId]/messages/[messageId]
 *
 * Soft delete — the row stays so that thread replies keep their anchor. Only
 * the author can do this in Phase 1: an admin override would need to satisfy
 * the author-only UPDATE policy, which means either a service-role call or a
 * SECURITY DEFINER function, and neither is worth adding before moderation is
 * actually asked for.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ channelId: string; messageId: string }> },
) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { channelId, messageId } = await params;

    const existing = await loadOwnMessage(messageId, channelId);
    if (!existing) return apiError("Message not found", 404);
    if (existing.author_id !== user.id) return apiError("You can only delete your own messages", 403);

    // Already a tombstone: nothing to do, and reporting success keeps a
    // double-click from surfacing an error.
    if (existing.deleted_at) return apiSuccess({ ok: true });

    await softDeleteMessage(messageId);
    return apiSuccess({ ok: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
