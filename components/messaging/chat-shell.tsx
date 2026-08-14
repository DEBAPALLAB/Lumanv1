"use client";

import type { Channel, Message, MessageWithCounts } from "@/lib/db/messaging";
import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Hash, MessagesSquare, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppRail } from "./app-rail";
import { ChannelSidebar, type WorkspaceSummary } from "./channel-sidebar";
import { FRAME, PANEL, SURFACE } from "./chrome";
import { ConfirmDialog } from "./confirm-dialog";
import { MessageComposer } from "./message-composer";
import { type AuthorDirectory, MessageList } from "./message-list";
import { ThreadPanel } from "./thread-panel";
import { useChannelRealtime } from "./use-channel-realtime";

/** Realtime hands back a bare row; the view's extras are filled in on refetch. */
function withEmptyCounts(message: Message): MessageWithCounts {
  return { ...message, reaction_counts: {}, my_reactions: [], reply_count: 0, last_reply_at: null };
}

export function ChatShell() {
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [orgChannels, setOrgChannels] = useState<Channel[]>([]);
  const [workspaceChannels, setWorkspaceChannels] = useState<Record<string, Channel[]>>({});
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [directory, setDirectory] = useState<AuthorDirectory>({});
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  const [messages, setMessages] = useState<MessageWithCounts[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [threadRoot, setThreadRoot] = useState<MessageWithCounts | null>(null);
  // The message queued for deletion, held while the confirm dialog is open.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Per-channel transcript cache, so switching back to a channel renders from
  // memory instead of blanking and refetching. A ref rather than state: it is
  // read during an effect and must never itself trigger a render.
  const messageCache = useRef<Map<string, { messages: MessageWithCounts[]; nextCursor: string | null }>>(new Map());

  const activeChannel = useMemo(() => {
    if (!activeChannelId) return null;
    const all = [...orgChannels, ...Object.values(workspaceChannels).flat()];
    return all.find((c) => c.id === activeChannelId) ?? null;
  }, [activeChannelId, orgChannels, workspaceChannels]);

  const memberCount = Object.keys(directory).length;

  // The author directory already holds every org member, so mention
  // autocomplete reuses it rather than adding an endpoint and a round trip.
  // Yourself excluded — @-ing yourself is never the intent.
  const mentionCandidates = useMemo(
    () =>
      Object.entries(directory)
        .filter(([id]) => id !== userId)
        .map(([id, entry]) => ({
          id,
          name: entry.name && entry.name !== "Unknown" ? entry.name : (entry.email?.split("@")[0] ?? "Teammate"),
          email: entry.email ?? "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [directory, userId],
  );

  // Identity, organisation and workspaces. Mirrors the org-selection order the
  // workspace sidebar uses (?org= slug, then the remembered one, then the
  // first membership) so both surfaces agree on which org is open.
  //
  // Resolving the org used to cost three serial round trips before a single
  // channel could be requested, on every visit. The id is cached per slug in
  // sessionStorage so a return visit starts fetching channels immediately;
  // the authoritative lookup still runs and corrects the cache if it is stale.
  useEffect(() => {
    let cancelled = false;

    const slug =
      searchParams.get("org") || (typeof window !== "undefined" ? sessionStorage.getItem("selected_org_slug") : null);
    setOrgSlug(slug);

    const cacheKey = `luman_chat_org_id:${slug ?? "__default__"}`;
    const cachedOrgId = typeof window !== "undefined" ? sessionStorage.getItem(cacheKey) : null;
    if (cachedOrgId) {
      setOrgId(cachedOrgId);
      setBootstrapping(false);
    }

    (async () => {
      const supabase = createSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        if (!cancelled) {
          setError("You need to be signed in to use chat.");
          setBootstrapping(false);
        }
        return;
      }
      if (!cancelled) setUserId(userData.user.id);

      let resolvedOrgId: string | null = null;
      if (slug) {
        const { data: org } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle();
        resolvedOrgId = org?.id ?? null;
      }
      if (!resolvedOrgId) {
        const { data: membership } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", userData.user.id)
          .limit(1)
          .maybeSingle();
        resolvedOrgId = membership?.organization_id ?? null;
      }

      if (cancelled) return;

      if (!resolvedOrgId) {
        setError("Create or join an organization to start chatting.");
        setBootstrapping(false);
        return;
      }

      if (typeof window !== "undefined") sessionStorage.setItem(cacheKey, resolvedOrgId);
      // Only re-set when it actually differs, so the cached-value path does
      // not fire a second identical render and refetch everything downstream.
      setOrgId((current) => (current === resolvedOrgId ? current : resolvedOrgId));

      const { data: ws } = await supabase
        .from("workspaces")
        .select("id, owner_name")
        .eq("organization_id", resolvedOrgId)
        .order("owner_name", { ascending: true });

      if (!cancelled) setWorkspaces((ws as WorkspaceSummary[]) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Author names live behind the service-role key, so they come from the
  // existing members endpoint (which carries the desktop delegation guard)
  // rather than a join on the messages query.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/organization/members?orgId=${orgId}`);
        if (!res.ok) return;
        const members = (await res.json()) as { user_id: string; full_name?: string; email?: string }[];
        if (cancelled) return;

        const next: AuthorDirectory = {};
        for (const member of members) {
          next[member.user_id] = { name: member.full_name ?? "", email: member.email ?? "" };
        }
        setDirectory(next);
      } catch {
        // Names are a nicety — the transcript still renders without them.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const loadChannels = useCallback(
    async (selectFirst: boolean) => {
      if (!orgId) return;
      try {
        const res = await fetch(`/api/messaging/channels?organizationId=${orgId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Could not load channels");
          return;
        }
        const data = (await res.json()) as {
          organizationChannels: Channel[];
          workspaceChannels: Record<string, Channel[]>;
        };
        setOrgChannels(data.organizationChannels);
        setWorkspaceChannels(data.workspaceChannels);
        setError(null);

        if (selectFirst) {
          const first = data.organizationChannels[0] ?? Object.values(data.workspaceChannels).flat()[0];
          if (first) setActiveChannelId((current) => current ?? first.id);
        }
      } catch {
        setError("Could not load channels");
      } finally {
        setBootstrapping(false);
      }
    },
    [orgId],
  );

  useEffect(() => {
    if (orgId) void loadChannels(true);
  }, [orgId, loadChannels]);

  // History for the open channel. Switching channels closes any open thread —
  // a thread panel belonging to a conversation you have left is confusing.
  //
  // Already-visited channels render from cache immediately and refresh behind
  // the scenes, so flicking between channels does not blank the transcript
  // and wait on a round trip every time.
  useEffect(() => {
    if (!activeChannelId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setThreadRoot(null);

    const cached = messageCache.current.get(activeChannelId);
    if (cached) {
      setMessages(cached.messages);
      setNextCursor(cached.nextCursor);
      setLoadingMessages(false);
    } else {
      setMessages([]);
      setLoadingMessages(true);
    }

    (async () => {
      try {
        const res = await fetch(`/api/messaging/channels/${activeChannelId}/messages`);
        if (!res.ok) {
          if (!cancelled && !cached) setError("Could not load messages");
          return;
        }
        const data = (await res.json()) as { messages: MessageWithCounts[]; nextCursor: string | null };
        if (cancelled) return;
        // The API pages newest-first; the transcript reads oldest-first.
        const ordered = [...data.messages].reverse();
        messageCache.current.set(activeChannelId, { messages: ordered, nextCursor: data.nextCursor });
        setMessages(ordered);
        setNextCursor(data.nextCursor);
        setError(null);
      } catch {
        if (!cancelled && !cached) setError("Could not load messages");
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeChannelId]);

  // Mirror the live transcript into the cache so returning to a channel shows
  // what was actually last on screen — sends, edits, reactions and realtime
  // arrivals included — rather than the state it had when first opened.
  useEffect(() => {
    if (!activeChannelId || loadingMessages) return;
    messageCache.current.set(activeChannelId, { messages, nextCursor });
  }, [activeChannelId, messages, nextCursor, loadingMessages]);

  const loadMore = useCallback(async () => {
    if (!activeChannelId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/messaging/channels/${activeChannelId}/messages?before=${encodeURIComponent(nextCursor)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { messages: MessageWithCounts[]; nextCursor: string | null };
      setMessages((prev) => [...[...data.messages].reverse(), ...prev]);
      setNextCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [activeChannelId, nextCursor, loadingMore]);

  // Realtime INSERTs race the POST response — whichever lands second must not
  // duplicate the row, so both paths merge by id. An incoming realtime row
  // carries no view extras, so a merge preserves whatever counts are already
  // known rather than blanking them.
  const upsert = useCallback((incoming: MessageWithCounts) => {
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === incoming.id);
      if (index === -1) return [...prev, incoming];
      const next = [...prev];
      next[index] = { ...prev[index], ...incoming };
      return next;
    });
  }, []);

  const handleRealtimeInsert = useCallback(
    (message: Message) => upsert(withEmptyCounts(message)),
    [upsert],
  );

  const handleRealtimeUpdate = useCallback((incoming: Message) => {
    setMessages((prev) => prev.map((m) => (m.id === incoming.id ? { ...m, ...incoming } : m)));
  }, []);

  useChannelRealtime({
    channelId: activeChannelId,
    onInsert: handleRealtimeInsert,
    onUpdate: handleRealtimeUpdate,
  });

  const postMessage = useCallback(
    async (text: string, parentMessageId?: string) => {
      if (!activeChannelId) return;

      const res = await fetch(`/api/messaging/channels/${activeChannelId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: {
            type: "doc",
            content: text
              .split("\n")
              .map((line) =>
                line.length > 0 ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
              ),
          },
          parentMessageId,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not send message");
      }

      const created = (await res.json()) as Message;
      // A reply belongs to the thread panel, not the main transcript; the
      // root's reply_count is refreshed below instead.
      if (parentMessageId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === parentMessageId ? { ...m, reply_count: m.reply_count + 1 } : m)),
        );
        return;
      }
      upsert(withEmptyCounts(created));
    },
    [activeChannelId, upsert],
  );

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const res = await fetch(`/api/messaging/messages/${messageId}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) return;

    // The route returns the message with recomputed tallies, so two people
    // reacting at once converge instead of drifting.
    const { message } = (await res.json()) as { message: MessageWithCounts };
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, ...message } : m)));
    setThreadRoot((prev) => (prev && prev.id === message.id ? { ...prev, ...message } : prev));
  }, []);

  // Confirmation lives in the dialog rather than window.confirm, so this runs
  // only once the reader has actually agreed.
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!activeChannelId) return;

      const res = await fetch(`/api/messaging/channels/${activeChannelId}/messages/${messageId}`, {
        method: "DELETE",
      });
      if (!res.ok) return;

      // The soft delete arrives over realtime as an UPDATE too; setting it
      // here as well keeps the author's own view instant.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, deleted_at: new Date().toISOString(), content_text: "" } : m,
        ),
      );
    },
    [activeChannelId],
  );

  // The name arrives from the sidebar's inline field, so there is no prompt()
  // here — the caller has already collected and trimmed it.
  const createChannel = useCallback(
    async (scope: "organization" | "workspace", name: string, workspaceId?: string) => {
      if (!orgId || !name.trim()) return;

      setCreating(true);
      try {
        const res = await fetch("/api/messaging/channels", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope, organizationId: orgId, workspaceId, name: name.trim() }),
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? "Could not create channel");
          return;
        }

        await loadChannels(false);
        setActiveChannelId((body as Channel).id);
        setError(null);
      } finally {
        setCreating(false);
      }
    },
    [orgId, loadChannels],
  );

  // Skeleton in the shape of the real layout — rail, channel column, transcript
  // — so the page does not reflow when the data lands.
  if (bootstrapping) {
    return (
      <div className={cn("flex h-full", SURFACE)} aria-busy="true">
        <div className={cn("w-[76px] shrink-0 border-r-[3px]", FRAME)} />
        <div className={cn("w-60 shrink-0 border-r-[3px] px-3 pt-5 space-y-2.5", FRAME, PANEL)}>
          {["w-24", "w-32", "w-20", "w-28", "w-16"].map((width, index) => (
            <div
              key={width}
              className={cn("h-3 rounded-full bg-black/10 animate-skeleton dark:bg-stone-100/10", width)}
              style={{ animationDelay: `${index * 90}ms` }}
            />
          ))}
        </div>
        <div className="flex-1">
          <div className={cn("h-[56px] border-b-[3px]", FRAME, PANEL)} />
        </div>
      </div>
    );
  }

  if (error && !activeChannel && orgChannels.length === 0) {
    return (
      <div className={cn("flex h-full items-center justify-center px-6", SURFACE)}>
        <div className="max-w-sm text-center">
          <div
            className={cn(
              "mx-auto flex h-12 w-12 items-center justify-center rounded-[10px] border-[3px] bg-white dark:bg-zinc-900",
              FRAME,
            )}
          >
            <MessagesSquare className="h-5 w-5 text-black dark:text-stone-100" strokeWidth={2.5} />
          </div>
          <p className="mt-4 text-[15px] font-bold tracking-[-0.02em] text-black dark:text-stone-100">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full", SURFACE)}>
      <AppRail orgSlug={orgSlug} />

      <ChannelSidebar
        organizationChannels={orgChannels}
        workspaceChannels={workspaceChannels}
        workspaces={workspaces}
        activeChannelId={activeChannelId}
        onSelect={setActiveChannelId}
        onCreate={createChannel}
        creating={creating}
      />

      <section className={cn("flex min-w-0 flex-1 flex-col", SURFACE)}>
        {/* h-[56px] matches the thread panel's header so the two align. The
            right padding clears the floating dock pinned over this corner. */}
        <header
          className={cn(
            "flex h-[56px] shrink-0 items-center gap-2.5 border-b-[3px] pl-5 pr-[136px]",
            FRAME,
            PANEL,
          )}
        >
          <Hash className="h-[18px] w-[18px] shrink-0 text-black/30 dark:text-stone-100/30" strokeWidth={2.75} />
          <h1 className="truncate text-[15px] font-bold tracking-[-0.02em] text-black dark:text-stone-100">
            {activeChannel?.name ?? "No channel selected"}
          </h1>

          {activeChannel?.scope === "workspace" && (
            <span
              className={cn(
                "shrink-0 rounded-[4px] border-[1.5px] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em]",
                "border-black/20 text-black/50 dark:border-stone-100/20 dark:text-stone-100/50",
              )}
            >
              Workspace
            </span>
          )}

          {activeChannel?.topic && (
            <span className="truncate border-l-[1.5px] border-black/12 pl-2.5 text-[12px] text-black/45 dark:border-stone-100/12 dark:text-stone-100/45">
              {activeChannel.topic}
            </span>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1.5 text-black/40 dark:text-stone-100/40">
            <Users className="h-3.5 w-3.5" strokeWidth={2.25} />
            <span className="text-[12px] font-semibold tabular-nums">{memberCount}</span>
          </div>
        </header>

        {error && (
          <p
            role="alert"
            className="shrink-0 border-b-[1.5px] border-red-500/25 bg-red-500/[0.07] px-5 py-2 text-[11.5px] font-semibold text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}

        {activeChannel ? (
          <>
            <MessageList
              messages={messages}
              directory={directory}
              currentUserId={userId}
              loading={loadingMessages}
              hasMore={Boolean(nextCursor)}
              loadingMore={loadingMore}
              onLoadMore={() => void loadMore()}
              onToggleReaction={(id, emoji) => void toggleReaction(id, emoji)}
              onOpenThread={setThreadRoot}
              onDelete={setPendingDelete}
              channelName={activeChannel.name}
            />
            <MessageComposer
              channelId={activeChannel.id}
              channelName={activeChannel.name}
              mentionCandidates={mentionCandidates}
              onSend={(text) => postMessage(text)}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-sm text-center">
              <div
                className={cn(
                  "mx-auto flex h-12 w-12 items-center justify-center rounded-[10px] border-[3px]",
                  FRAME,
                  PANEL,
                )}
              >
                <MessagesSquare className="h-5 w-5 text-black/50 dark:text-stone-100/50" strokeWidth={2.25} />
              </div>
              <h2 className="mt-4 text-[16px] font-bold tracking-[-0.02em] text-black dark:text-stone-100">
                No channel open
              </h2>
              <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-black/50 dark:text-stone-100/50">
                Pick a channel from the list, or use the + beside a section heading to make a new one.
              </p>
            </div>
          </div>
        )}
      </section>

      {threadRoot && (
        <ThreadPanel
          root={threadRoot}
          directory={directory}
          currentUserId={userId}
          mentionCandidates={mentionCandidates}
          onClose={() => setThreadRoot(null)}
          onSendReply={(text) => postMessage(text, threadRoot.id)}
          onToggleReaction={(id, emoji) => void toggleReaction(id, emoji)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this message?"
        body="It will be removed for everyone in the channel. This can't be undone."
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteMessage(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
