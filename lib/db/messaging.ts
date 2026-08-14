import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Team chat: channels and the messages inside them.
 *
 * Every function here goes through the ordinary anon-key client, so RLS
 * decides what the caller can see — `can_access_channel()` in migration 012.
 * Nothing in this file uses the service-role key, and nothing should: a route
 * that needs a teammate's display name resolves it through
 * /api/organization/members, which already carries the delegation guard.
 */

export type ChannelScope = "organization" | "workspace";

export type Channel = {
  id: string;
  scope: ChannelScope;
  organization_id: string;
  workspace_id: string | null;
  name: string;
  topic: string | null;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
};

export type Message = {
  id: string;
  channel_id: string;
  parent_message_id: string | null;
  author_id: string | null;
  content: unknown;
  content_text: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

/**
 * A message as the UI needs it: the row plus its reaction tallies and thread
 * summary, read from the messages_with_counts view (migration 013).
 *
 * `my_reactions` is resolved per-caller by the view rather than derived
 * client-side, so the composer never has to hold the full reaction list to
 * know whether the highlight is on.
 */
export type MessageWithCounts = Message & {
  reaction_counts: Record<string, number>;
  my_reactions: string[];
  reply_count: number;
  last_reply_at: string | null;
};

/** How many messages a history page holds, and the ceiling a caller may ask for. */
export const MESSAGE_PAGE_SIZE = 50;
export const MESSAGE_PAGE_MAX = 100;

/**
 * Replies returned for one thread. Threads are bounded in practice, so they
 * load in a single request rather than paging; this cap keeps a runaway thread
 * from returning an unbounded response.
 */
export const THREAD_REPLY_MAX = 200;

export async function listChannels(
  organizationId: string,
  /** Reuse a caller's client instead of building a second one per request. */
  client?: SupabaseClient,
): Promise<Channel[]> {
  const supabase = client ?? (await createSupabaseServerClient());

  // No workspace filter here: the sidebar shows org channels and every
  // workspace channel the user can reach in one pass, and RLS already removes
  // the workspaces they cannot. Filtering by a single workspace client-side is
  // cheaper than a second round trip per workspace.
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("scope", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Channel[];
}

export async function getChannel(channelId: string): Promise<Channel | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from("channels").select("*").eq("id", channelId).maybeSingle();

  if (error) throw error;
  return (data as Channel) ?? null;
}

export async function createChannel({
  scope,
  organizationId,
  workspaceId,
  name,
  topic,
  createdBy,
  isDefault = false,
}: {
  scope: ChannelScope;
  organizationId: string;
  workspaceId?: string | null;
  name: string;
  topic?: string | null;
  createdBy: string;
  isDefault?: boolean;
}): Promise<Channel> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("channels")
    .insert({
      scope,
      organization_id: organizationId,
      workspace_id: scope === "workspace" ? workspaceId : null,
      name: name.trim(),
      topic: topic ?? null,
      is_default: isDefault,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Channel;
}

/**
 * Finds a channel by name within its scope, or creates it.
 *
 * Used for the per-org and per-workspace "general" channel, which is created
 * lazily on first visit rather than by a trigger — a trigger would have to run
 * as the inserting user and satisfy the INSERT policy, and would fire on rows
 * created by the other apps sharing this database too.
 *
 * The unique-violation branch is not defensive padding: two tabs opening a
 * fresh workspace at once genuinely race here, and the loser should return the
 * winner's channel rather than surface an error the user cannot act on.
 */
export async function ensureDefaultChannel({
  scope,
  organizationId,
  workspaceId,
  createdBy,
  name = "general",
}: {
  scope: ChannelScope;
  organizationId: string;
  workspaceId?: string | null;
  createdBy: string;
  name?: string;
}): Promise<Channel> {
  const supabase = await createSupabaseServerClient();

  const existingQuery = supabase
    .from("channels")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("scope", scope)
    .ilike("name", name);

  const { data: existing, error: existingError } =
    scope === "workspace"
      ? await existingQuery.eq("workspace_id", workspaceId!).maybeSingle()
      : await existingQuery.is("workspace_id", null).maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as Channel;

  try {
    return await createChannel({
      scope,
      organizationId,
      workspaceId,
      name,
      createdBy,
      isDefault: true,
    });
  } catch (error) {
    // 23505 = unique_violation: another request created it first.
    if ((error as { code?: string })?.code === "23505") {
      const retryQuery = supabase
        .from("channels")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("scope", scope)
        .ilike("name", name);

      const { data: raced } =
        scope === "workspace"
          ? await retryQuery.eq("workspace_id", workspaceId!).maybeSingle()
          : await retryQuery.is("workspace_id", null).maybeSingle();

      if (raced) return raced as Channel;
    }
    throw error;
  }
}

/**
 * One page of channel history, newest first.
 *
 * Keyset pagination on (created_at, id), not OFFSET. A live chat inserts rows
 * at the head constantly, and OFFSET counts from the head — by the time the
 * user scrolls up, the window has shifted and rows get duplicated across pages
 * or skipped entirely. The cursor names a fixed point instead.
 */
export async function getMessages({
  channelId,
  before,
  limit = MESSAGE_PAGE_SIZE,
}: {
  channelId: string;
  before?: { createdAt: string; id: string } | null;
  limit?: number;
}): Promise<MessageWithCounts[]> {
  const supabase = await createSupabaseServerClient();
  const safeLimit = Math.min(Math.max(1, limit), MESSAGE_PAGE_MAX);

  const build = (source: string) => {
    let query = supabase
      .from(source)
      .select("*")
      .eq("channel_id", channelId)
      .is("parent_message_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(safeLimit);

    if (before) {
      // Strictly older than the cursor: either an earlier timestamp, or the
      // same timestamp with a lower id. Without the id tiebreaker, messages
      // sharing a millisecond would repeat on the next page.
      query = query.or(
        `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`,
      );
    }
    return query;
  };

  // Prefer the view — it carries reaction tallies and reply counts, and runs
  // security_invoker so the same RLS applies. It only exists once migration
  // 013 is applied, so fall back to the base table when it is not: chat keeps
  // working through the gap between deploying this code and running that
  // migration, instead of failing to load history entirely.
  const { data, error } = await build("messages_with_counts");

  if (error) {
    // 42P01 = undefined_table, PGRST205 = PostgREST cannot find it in its
    // schema cache. Any other error is a real failure and must not be masked.
    const missingView = error.code === "42P01" || error.code === "PGRST205";
    if (!missingView) throw error;

    const { data: fallback, error: fallbackError } = await build("messages");
    if (fallbackError) throw fallbackError;

    return (fallback ?? []).map((row) => ({
      ...(row as Message),
      reaction_counts: {},
      my_reactions: [],
      reply_count: 0,
      last_reply_at: null,
    }));
  }

  return (data ?? []) as MessageWithCounts[];
}

/**
 * Every reply in one thread, oldest first.
 *
 * Threads read chronologically, unlike the channel transcript which pages
 * backwards from the newest. They are also bounded in practice, so this takes
 * no cursor — if a thread ever grows past the cap, the tail is the part worth
 * keeping and the UI says so.
 */
export async function getThreadReplies({
  parentMessageId,
  limit = THREAD_REPLY_MAX,
}: {
  parentMessageId: string;
  limit?: number;
}): Promise<MessageWithCounts[]> {
  const supabase = await createSupabaseServerClient();

  const safeLimit = Math.min(Math.max(1, limit), THREAD_REPLY_MAX);

  const build = (source: string) =>
    supabase
      .from(source)
      .select("*")
      .eq("parent_message_id", parentMessageId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(safeLimit);

  // Same view-or-table fallback as getMessages; see the note there.
  const { data, error } = await build("messages_with_counts");

  if (error) {
    const missingView = error.code === "42P01" || error.code === "PGRST205";
    if (!missingView) throw error;

    const { data: fallback, error: fallbackError } = await build("messages");
    if (fallbackError) throw fallbackError;

    return (fallback ?? []).map((row) => ({
      ...(row as Message),
      reaction_counts: {},
      my_reactions: [],
      reply_count: 0,
      last_reply_at: null,
    }));
  }

  return (data ?? []) as MessageWithCounts[];
}

/** One message by id, with its counts. Used to refresh a thread root. */
export async function getMessageWithCounts(messageId: string): Promise<MessageWithCounts | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from("messages_with_counts").select("*").eq("id", messageId).maybeSingle();

  if (error) {
    // Same view-or-table fallback as getMessages; see the note there.
    const missingView = error.code === "42P01" || error.code === "PGRST205";
    if (!missingView) throw error;

    const { data: fallback, error: fallbackError } = await supabase
      .from("messages")
      .select("*")
      .eq("id", messageId)
      .maybeSingle();

    if (fallbackError) throw fallbackError;
    if (!fallback) return null;

    return {
      ...(fallback as Message),
      reaction_counts: {},
      my_reactions: [],
      reply_count: 0,
      last_reply_at: null,
    };
  }

  return (data as MessageWithCounts) ?? null;
}

/**
 * Adds the caller's reaction, or removes it if already there.
 *
 * Delegates to the toggle_reaction() function from migration 013 so the
 * read-then-write race is resolved in the database rather than across the
 * network. Returns true when the reaction is now set.
 */
export async function toggleReaction({
  messageId,
  emoji,
}: {
  messageId: string;
  emoji: string;
}): Promise<boolean> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("toggle_reaction", {
    p_message_id: messageId,
    p_emoji: emoji,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function createMessage({
  channelId,
  authorId,
  content,
  contentText,
  parentMessageId,
}: {
  channelId: string;
  authorId: string;
  content: unknown;
  contentText: string;
  parentMessageId?: string | null;
}): Promise<Message> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("messages")
    .insert({
      channel_id: channelId,
      author_id: authorId,
      content,
      content_text: contentText,
      parent_message_id: parentMessageId ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Message;
}

export async function updateMessage({
  messageId,
  content,
  contentText,
}: {
  messageId: string;
  content: unknown;
  contentText: string;
}): Promise<Message> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("messages")
    .update({ content, content_text: contentText, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .select()
    .single();

  if (error) throw error;
  return data as Message;
}

/**
 * Soft delete. The content is blanked here rather than merely hidden by the
 * UI: a tombstone that still carries the text is not a deletion, and Realtime
 * would hand the old body to every subscriber in the payload.
 */
export async function softDeleteMessage(messageId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("messages")
    .update({
      deleted_at: new Date().toISOString(),
      content: { type: "doc", content: [] },
      content_text: "",
    })
    .eq("id", messageId);

  if (error) throw error;
}
