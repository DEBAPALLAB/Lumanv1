import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { MESSAGE_PAGE_SIZE, createMessage, getChannel, getMessages } from "@/lib/db/messaging";
import { docToText, validateMessageDoc } from "@/lib/messaging/content";

/**
 * GET /api/messaging/channels/[channelId]/messages?before=<iso>_<id>&limit=50
 *
 * One page of history, newest first. `before` is the opaque cursor returned as
 * `nextCursor` by the previous page — the client should pass it back rather
 * than construct one.
 */
export async function GET(req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { channelId } = await params;
    const { searchParams } = new URL(req.url);

    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : MESSAGE_PAGE_SIZE;
    if (Number.isNaN(limit) || limit < 1) return apiError("limit must be a positive number", 400);

    // Cursor is "<created_at>_<id>". created_at is an ISO timestamp and so
    // contains no underscore; splitting on the LAST one keeps the id intact.
    let before: { createdAt: string; id: string } | null = null;
    const rawCursor = searchParams.get("before");
    if (rawCursor) {
      const separator = rawCursor.lastIndexOf("_");
      if (separator === -1) return apiError("Malformed cursor", 400);
      before = { createdAt: rawCursor.slice(0, separator), id: rawCursor.slice(separator + 1) };
      if (!before.createdAt || !before.id) return apiError("Malformed cursor", 400);
    }

    const messages = await getMessages({ channelId, before, limit });

    // An empty first page is ambiguous — an empty channel, or one the caller
    // cannot open. Only then is it worth a second query to tell those apart,
    // so the client can show "no messages yet" rather than a silent blank.
    if (messages.length === 0 && !before) {
      const channel = await getChannel(channelId);
      if (!channel) return apiError("Channel not found", 404);
    }

    const oldest = messages.at(-1);
    return apiSuccess({
      messages,
      // A full page implies there may be more; a short page is definitively the end.
      nextCursor: messages.length === limit && oldest ? `${oldest.created_at}_${oldest.id}` : null,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * POST /api/messaging/channels/[channelId]/messages
 * Body: { content: TiptapDoc, parentMessageId? }
 *
 * The INSERT policy is what actually stops a non-member posting; the checks
 * here exist to return a useful status code instead of a bare RLS rejection.
 */
export async function POST(req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { channelId } = await params;

    let body: { content?: unknown; parentMessageId?: string | null };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const invalid = validateMessageDoc(body.content);
    if (invalid) return apiError(invalid, 400);

    // content_text is derived here, never taken from the client: it feeds
    // channel previews, and a client-supplied value could disagree with the
    // body it claims to summarise.
    const contentText = docToText(body.content);

    try {
      const message = await createMessage({
        channelId,
        authorId: user.id,
        content: body.content,
        contentText,
        parentMessageId: body.parentMessageId ?? null,
      });
      return apiSuccess(message, 201);
    } catch (error) {
      // 42501 = insufficient_privilege: the RLS INSERT policy refused, which
      // here means the caller cannot open this channel.
      const code = (error as { code?: string })?.code;
      if (code === "42501") return apiError("You do not have access to this channel", 403);
      if (code === "23503") return apiError("Channel not found", 404);
      throw error;
    }
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
