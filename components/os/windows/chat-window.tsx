"use client";

import { MessageComposer } from "@/components/messaging/message-composer";
import { type AuthorDirectory, MessageList } from "@/components/messaging/message-list";
import { useChannelRealtime } from "@/components/messaging/use-channel-realtime";
import type { Message, MessageWithCounts } from "@/lib/db/messaging";
import { useCallback, useEffect, useState } from "react";

/** Realtime hands back a bare row; the view's extras are filled in on refetch. */
function withEmptyCounts(message: Message): MessageWithCounts {
  return { ...message, reaction_counts: {}, my_reactions: [], reply_count: 0, last_reply_at: null };
}

/**
 * One channel, open as a window.
 *
 * Reuses the v1 MessageList and MessageComposer unchanged — the transcript and
 * the composer never knew they were inside a page, so they work as-is inside a
 * window. What used to be ChatShell's job (loading history, realtime, posting)
 * lives here, scoped to a single channel rather than to a channel switcher,
 * because in the OS each channel is its own window.
 */
export function ChatWindow({
  channelId,
  channelName,
  orgId,
  userId,
  directory,
}: {
  channelId: string;
  channelName: string;
  orgId: string | null;
  userId: string | null;
  directory: AuthorDirectory;
}) {
  const [messages, setMessages] = useState<MessageWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const mentionCandidates = Object.entries(directory)
    .filter(([id]) => id !== userId)
    .map(([id, entry]) => ({
      id,
      name: entry.name && entry.name !== "Unknown" ? entry.name : (entry.email?.split("@")[0] ?? "Teammate"),
      email: entry.email ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/messaging/channels/${channelId}/messages`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages: MessageWithCounts[]; nextCursor: string | null };
        if (cancelled) return;
        // The API pages newest-first; the transcript reads oldest-first.
        setMessages([...data.messages].reverse());
        setNextCursor(data.nextCursor);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const upsert = useCallback((incoming: MessageWithCounts) => {
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === incoming.id);
      if (index === -1) return [...prev, incoming];
      const next = [...prev];
      next[index] = { ...prev[index], ...incoming };
      return next;
    });
  }, []);

  useChannelRealtime({
    channelId,
    onInsert: useCallback((m: Message) => upsert(withEmptyCounts(m)), [upsert]),
    onUpdate: useCallback((incoming: Message) => {
      setMessages((prev) => prev.map((m) => (m.id === incoming.id ? { ...m, ...incoming } : m)));
    }, []),
  });

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/messaging/channels/${channelId}/messages?before=${encodeURIComponent(nextCursor)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: MessageWithCounts[]; nextCursor: string | null };
      setMessages((prev) => [...[...data.messages].reverse(), ...prev]);
      setNextCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [channelId, nextCursor, loadingMore]);

  const postMessage = useCallback(
    async (text: string) => {
      const res = await fetch(`/api/messaging/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: {
            type: "doc",
            content: text
              .split("\n")
              .map((line) =>
                line.length > 0
                  ? { type: "paragraph", content: [{ type: "text", text: line }] }
                  : { type: "paragraph" },
              ),
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not send message");
      }
      upsert(withEmptyCounts((await res.json()) as Message));
    },
    [channelId, upsert],
  );

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const res = await fetch(`/api/messaging/messages/${messageId}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) return;
    const { message } = (await res.json()) as { message: MessageWithCounts };
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, ...message } : m)));
  }, []);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const res = await fetch(`/api/messaging/channels/${channelId}/messages/${messageId}`, { method: "DELETE" });
      if (!res.ok) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, deleted_at: new Date().toISOString(), content_text: "" } : m)),
      );
    },
    [channelId],
  );

  return (
    // os-chat establishes the container the transcript's compact form keys off
    // — what matters is this window's width, not the viewport's.
    <div className="os-chat flex h-full flex-col">
      <MessageList
        messages={messages}
        directory={directory}
        currentUserId={userId}
        loading={loading}
        hasMore={Boolean(nextCursor)}
        loadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
        onToggleReaction={(id, emoji) => void toggleReaction(id, emoji)}
        // Threads are a panel in v1. In the OS a thread is just another window,
        // which is a change worth making deliberately rather than in passing —
        // wired next.
        onOpenThread={() => {}}
        onDelete={(id) => void deleteMessage(id)}
        channelName={channelName}
      />
      <MessageComposer
        channelId={channelId}
        channelName={channelName}
        mentionCandidates={mentionCandidates}
        onSend={postMessage}
      />
    </div>
  );
}
