"use client";

import type { MessageWithCounts } from "@/lib/db/messaging";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FOCUS_RING, FRAME, PANEL, initialsFor, tintFor } from "./chrome";
import { type MentionCandidate, MessageComposer } from "./message-composer";
import { type AuthorDirectory, authorLabel } from "./message-list";
import { ReactionRow } from "./reaction-row";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * The thread side panel: a root message and its replies.
 *
 * Replies live in the same `messages` table with parent_message_id pointing at
 * the root, so this is the same data shape as the main transcript — only the
 * ordering differs (threads read oldest-first, the channel reads newest-last
 * from a backwards page).
 */
export function ThreadPanel({
  root,
  directory,
  currentUserId,
  mentionCandidates,
  onClose,
  onSendReply,
  onToggleReaction,
}: {
  root: MessageWithCounts;
  directory: AuthorDirectory;
  currentUserId: string | null;
  mentionCandidates: MentionCandidate[];
  onClose: () => void;
  onSendReply: (text: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => void;
}) {
  const [replies, setReplies] = useState<MessageWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/messaging/channels/${root.channel_id}/messages/${root.id}/thread`);
        if (!res.ok) return;
        const data = (await res.json()) as { replies: MessageWithCounts[] };
        if (!cancelled) setReplies(data.replies ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [root.id, root.channel_id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [replies]);

  // Escape closes the panel. A side panel with no keyboard dismissal is a trap
  // for anyone not using a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async (text: string) => {
    await onSendReply(text);
    // Refetch rather than optimistically appending: the reply arrives with its
    // own id and counts from the server, and a thread is short enough that one
    // extra round trip is cheaper than reconciling two sources of truth.
    const res = await fetch(`/api/messaging/channels/${root.channel_id}/messages/${root.id}/thread`);
    if (res.ok) {
      const data = (await res.json()) as { replies: MessageWithCounts[] };
      setReplies(data.replies ?? []);
    }
  };

  const renderMessage = (message: MessageWithCounts, isRoot: boolean) => {
    const name = authorLabel(directory, message.author_id, currentUserId);
    return (
      <div
        className={cn(
          "flex gap-2.5 px-4",
          isRoot
            ? cn("border-b-[2.5px] py-3.5", FRAME, "bg-black/[0.025] dark:bg-stone-100/[0.035]")
            : "py-2.5",
        )}
      >
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border-[2px] text-[9.5px] font-bold text-black",
            FRAME,
            tintFor(message.author_id),
          )}
          aria-hidden="true"
        >
          {initialsFor(name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-baseline gap-2 leading-none">
            <span className="text-[12.5px] font-bold tracking-[-0.01em] text-black dark:text-stone-100">{name}</span>
            <span className="text-[10px] tabular-nums text-black/35 dark:text-stone-100/35">
              {formatTime(message.created_at)}
            </span>
          </div>

          {message.deleted_at ? (
            <p className="text-[13px] italic leading-[1.55] text-black/30 dark:text-stone-100/30">
              This message was deleted
            </p>
          ) : (
            <p className="text-[13px] leading-[1.55] text-black/90 dark:text-stone-100/90 whitespace-pre-wrap break-words [text-wrap:pretty]">
              {message.content_text}
            </p>
          )}

          {Object.keys(message.reaction_counts ?? {}).length > 0 && !message.deleted_at && (
            <ReactionRow
              counts={message.reaction_counts}
              mine={message.my_reactions ?? []}
              onToggle={(emoji) => onToggleReaction(message.id, emoji)}
            />
          )}
        </div>
      </div>
    );
  };

  const replyCount = replies.length;

  return (
    <aside
      className={cn("flex w-[400px] shrink-0 flex-col border-l-[3px]", FRAME, "bg-white dark:bg-zinc-950")}
      aria-label="Thread"
    >
      <header
        className={cn(
          "flex h-[56px] shrink-0 items-center justify-between border-b-[3px] px-4",
          FRAME,
          PANEL,
        )}
      >
        <div className="flex items-baseline gap-2">
          <h2 className="text-[14px] font-bold tracking-[-0.02em] text-black dark:text-stone-100">Thread</h2>
          {!loading && replyCount > 0 && (
            <span className="text-[11px] tabular-nums text-black/40 dark:text-stone-100/40">
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close thread"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-[6px] text-black/60 dark:text-stone-100/60",
            "transition-colors duration-150 hover:bg-[#FBBF24] hover:text-black",
            FOCUS_RING,
          )}
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {renderMessage(root, true)}

        {loading ? (
          <div className="space-y-4 px-4 py-4" aria-hidden="true">
            {["w-[70%]", "w-[52%]"].map((width, index) => (
              <div key={width} className="flex gap-2.5 animate-skeleton" style={{ animationDelay: `${index * 110}ms` }}>
                <div className="h-7 w-7 shrink-0 rounded-[6px] bg-black/12 dark:bg-stone-100/12" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <div className="h-2.5 w-20 rounded-full bg-black/12 dark:bg-stone-100/12" />
                  <div className={cn("h-2.5 rounded-full bg-black/[0.07] dark:bg-stone-100/[0.07]", width)} />
                </div>
              </div>
            ))}
          </div>
        ) : replyCount === 0 ? (
          <p className="px-4 py-5 text-[12px] leading-relaxed text-black/35 dark:text-stone-100/35">
            No replies yet. Start the thread below — replies stay here instead of filling the channel.
          </p>
        ) : (
          <div className="py-1">
            {replies.map((reply) => (
              <div key={reply.id}>{renderMessage(reply, false)}</div>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <MessageComposer
        channelId={`thread:${root.id}`}
        channelName="thread"
        placeholder="Reply to thread…"
        mentionCandidates={mentionCandidates}
        onSend={send}
      />
    </aside>
  );
}
