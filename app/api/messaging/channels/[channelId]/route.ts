import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { getChannel } from "@/lib/db/messaging";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** GET /api/messaging/channels/[channelId] — header metadata for one channel. */
export async function GET(_req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { channelId } = await params;
    const channel = await getChannel(channelId);

    // RLS returns no row both when the channel does not exist and when the
    // caller may not open it. 404 for both is the honest response: telling
    // them apart would confirm the existence of channels in other orgs.
    if (!channel) return apiError("Channel not found", 404);

    return apiSuccess(channel);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * PATCH /api/messaging/channels/[channelId]
 * Body: { name?, topic?, archived? }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ channelId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { channelId } = await params;

    let body: { name?: string; topic?: string | null; archived?: boolean };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (!body.name.trim()) return apiError("name cannot be empty", 400);
      if (body.name.trim().length > 80) return apiError("Channel name is too long (80 characters max)", 400);
      updates.name = body.name.trim();
    }
    if (body.topic !== undefined) updates.topic = body.topic;
    if (body.archived !== undefined) updates.archived_at = body.archived ? new Date().toISOString() : null;

    if (Object.keys(updates).length === 0) {
      return apiError("No changes supplied", 400);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("channels")
      .update(updates)
      .eq("id", channelId)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === "23505") return apiError("A channel with that name already exists here", 409);
      return apiError(error.message, 500);
    }
    if (!data) return apiError("Channel not found", 404);

    return apiSuccess(data);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
