"use client";

import type { MessageWithCounts } from "@/lib/db/messaging";
import { cn } from "@/lib/utils";
import { CornerDownRight, Hash, SmilePlus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FOCUS_RING, FRAME, PANEL, SHADOW_SM, initialsFor, tintFor } from "./chrome";
import { QUICK_EMOJI, ReactionRow } from "./reaction-row";

export type AuthorDirectory = Record<string, { name: string; email: string }>;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDayHeading(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

export function authorLabel(directory: AuthorDirectory, authorId: string | null, currentUserId: string | null) {
  if (!authorId) return "Unknown";
  if (authorId === currentUserId) return "You";
  const entry = directory[authorId];
  if (!entry) return "Teammate";
  // The members endpoint returns "Unknown" when a user has no full_name in
  // their metadata; the email local-part is a better handle than that.
  if (entry.name && entry.name !== "Unknown") return entry.name;
  return entry.email?.split("@")[0] ?? "Teammate";
}

/**
 * Renders `@name` tokens as pills.
 *
 * Mentions are stored inline in the message text rather than as structured
 * nodes, so this matches them on read. `myNames` is the set of tokens that
 * refer to the reader, which get the stronger highlight — being mentioned
 * should be visible at a glance while scrolling.
 */
function renderWithMentions(text: string, myNames: Set<string>) {
  const parts = text.split(/(@[\w.-]+)/g);

  return parts.map((part, index) => {
    if (!part.startsWith("@") || part.length < 2) return part;

    const isMe = myNames.has(part.slice(1).toLowerCase());
    return (
      <span
        // Index is safe here: the array is derived from this exact string and
        // is rebuilt whenever it changes.
        key={`${index}-${part}`}
        className={cn(
          "rounded-[3px] px-1 py-[1px] font-semibold",
          isMe
            ? "bg-[#FBBF24] text-black ring-1 ring-black/20"
            : "bg-black/[0.06] text-black dark:bg-stone-100/10 dark:text-stone-100",
        )}
      >
        {part}
      </span>
    );
  });
}

/**
 * Transcript-shaped placeholder. A centred "Loading messages…" label tells the
 * reader nothing about what is arriving; staggered rows in the shape of the
 * real thing make the wait feel like the channel is already there.
 */
function TranscriptSkeleton() {
  const rows = [
    { name: "w-24", lines: ["w-[78%]", "w-[52%]"] },
    { name: "w-16", lines: ["w-[64%]"] },
    { name: "w-28", lines: ["w-[86%]", "w-[71%]", "w-[38%]"] },
    { name: "w-20", lines: ["w-[45%]"] },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-hidden px-6 py-5" aria-hidden="true">
      <div className="mx-auto flex h-full max-w-[68rem] flex-col justify-end gap-5">
        {rows.map((row, rowIndex) => (
          <div
            key={row.name}
            className="flex gap-3 animate-skeleton"
            style={{ animationDelay: `${rowIndex * 110}ms` }}
          >
            <div className="h-8 w-8 shrink-0 rounded-[7px] bg-black/12 dark:bg-stone-100/12" />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <div className={cn("h-2.5 rounded-full bg-black/12 dark:bg-stone-100/12", row.name)} />
              {row.lines.map((line) => (
                <div
                  key={line}
                  className={cn("h-2.5 rounded-full bg-black/[0.07] dark:bg-stone-100/[0.07]", line)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * First-run view for a channel with no history.
 *
 * The old version was two lines of muted text, which reads as an error rather
 * than an invitation. This states what the channel is and gives the reader
 * something to actually do.
 */
function EmptyChannel({ channelName }: { channelName: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <div
          className={cn(
            "mx-auto flex h-14 w-14 items-center justify-center rounded-[12px] border-[3px] bg-[#FBBF24] text-black",
            FRAME,
            SHADOW_SM,
          )}
        >
          <Hash className="h-6 w-6" strokeWidth={2.75} />
        </div>

        <h2 className="mt-5 text-[22px] font-bold leading-tight tracking-[-0.02em] text-black dark:text-stone-100">
          This is #{channelName}
        </h2>
        <p className="mx-auto mt-2 max-w-[38ch] text-[13px] leading-relaxed text-black/55 dark:text-stone-100/55">
          The beginning of the channel. Messages posted here stay with the channel, so anyone who joins later can read
          back through it.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-black/40 dark:text-stone-100/40">
          <kbd
            className={cn(
              "rounded-[4px] border-[1.5px] px-1.5 py-0.5 font-mono text-[10px] font-semibold",
              "border-black/25 dark:border-stone-100/25",
            )}
          >
            @
          </kbd>
          <span>to mention someone</span>
          <span className="text-black/20 dark:text-stone-100/20">·</span>
          <kbd
            className={cn(
              "rounded-[4px] border-[1.5px] px-1.5 py-0.5 font-mono text-[10px] font-semibold",
              "border-black/25 dark:border-stone-100/25",
            )}
          >
            Shift ↵
          </kbd>
          <span>for a new line</span>
        </div>
      </div>
    </div>
  );
}

/** Hover toolbar. Split out so the emoji picker can own local open state. */
function MessageActions({
  isMine,
  onToggleReaction,
  onOpenThread,
  onDelete,
}: {
  isMine: boolean;
  onToggleReaction: (emoji: string) => void;
  onOpenThread: () => void;
  onDelete: () => void;
}) {
  const [picking, setPicking] = useState(false);

  // Close on Escape while the picker is open, so it never traps focus.
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicking(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  const button = cn(
    "flex h-7 w-7 items-center justify-center rounded-[5px] text-black/70 dark:text-stone-100/70",
    "transition-colors duration-150 hover:bg-[#FBBF24] hover:text-black",
    FOCUS_RING,
  );

  return (
    <div
      className={cn(
        "absolute -top-3 right-2 z-20 flex items-center gap-0.5 rounded-[7px] border-[2px] p-0.5",
        FRAME,
        PANEL,
        SHADOW_SM,
        // Kept mounted so the picker can stay open once the pointer moves into
        // it; opacity rather than `hidden` gives it something to animate.
        "opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100",
        picking && "opacity-100",
      )}
    >
      {picking && (
        <div
          className={cn(
            "absolute bottom-full right-0 mb-1.5 flex items-center gap-0.5 rounded-[7px] border-[2px] p-1",
            FRAME,
            PANEL,
            SHADOW_SM,
            "animate-pop-in",
          )}
        >
          {QUICK_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onToggleReaction(emoji);
                setPicking(false);
              }}
              aria-label={`React with ${emoji}`}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-[5px] text-[15px] leading-none",
                "transition-transform duration-150 hover:scale-[1.18] hover:bg-black/[0.05] dark:hover:bg-stone-100/10",
                FOCUS_RING,
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setPicking((open) => !open)}
        aria-label="Add reaction"
        aria-expanded={picking}
        className={cn(button, picking && "bg-[#FBBF24] text-black")}
      >
        <SmilePlus className="h-[15px] w-[15px]" strokeWidth={2.25} />
      </button>
      <button type="button" onClick={onOpenThread} aria-label="Reply in thread" className={button}>
        <CornerDownRight className="h-[15px] w-[15px]" strokeWidth={2.25} />
      </button>
      {isMine && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete message"
          className={cn(button, "hover:bg-red-500 hover:text-white")}
        >
          <Trash2 className="h-[15px] w-[15px]" strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}

export function MessageList({
  messages,
  directory,
  currentUserId,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onToggleReaction,
  onOpenThread,
  onDelete,
  channelName,
}: {
  messages: MessageWithCounts[];
  directory: AuthorDirectory;
  currentUserId: string | null;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onOpenThread: (message: MessageWithCounts) => void;
  onDelete: (messageId: string) => void;
  channelName: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const previousScrollHeight = useRef(0);
  const previousCount = useRef(0);

  // Ids present on the first render of a channel. Those render without the
  // entry animation — animating a whole page of history on open is noise;
  // only genuinely new arrivals should move.
  const settled = useRef<Set<string>>(new Set());
  const seededFor = useRef<string | null>(null);

  if (seededFor.current !== channelName && !loading) {
    settled.current = new Set(messages.map((m) => m.id));
    seededFor.current = channelName;
  }

  // Which @tokens mean "you". The composer writes mentions with whitespace
  // stripped, so the same normalisation has to happen on the way back out, and
  // the email local-part is included because that is the fallback display name
  // for anyone without a full_name in their metadata.
  const myMentionTokens = useMemo(() => {
    const tokens = new Set<string>();
    if (!currentUserId) return tokens;

    const me = directory[currentUserId];
    if (me?.name && me.name !== "Unknown") tokens.add(me.name.replace(/\s+/g, "").toLowerCase());
    const localPart = me?.email?.split("@")[0];
    if (localPart) tokens.add(localPart.toLowerCase());

    return tokens;
  }, [directory, currentUserId]);

  // Two distinct scroll behaviours share this effect, and conflating them is
  // the classic chat bug:
  //
  //   - a message arrives at the bottom -> follow it, but only if the reader
  //     was already near the bottom, so we never yank them out of history
  //     they are part-way through reading.
  //   - a page of history loads at the top -> hold position by restoring the
  //     offset by however much taller the list just became.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const grewAtTop = messages.length > previousCount.current && previousScrollHeight.current > 0 && loadingMore;

    if (grewAtTop) {
      container.scrollTop = container.scrollHeight - previousScrollHeight.current;
    } else if (messages.length !== previousCount.current) {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const wasNearBottom = distanceFromBottom < 150 || previousCount.current === 0;
      if (wasNearBottom) {
        bottomRef.current?.scrollIntoView({ behavior: previousCount.current === 0 ? "auto" : "smooth" });
      }
    }

    previousCount.current = messages.length;
    previousScrollHeight.current = container.scrollHeight;
  }, [messages, loadingMore]);

  if (loading) return <TranscriptSkeleton />;

  let lastDay = "";
  let lastAuthor: string | null = null;
  let lastStamp = 0;

  return (
    <div ref={scrollRef} className="relative flex-1 min-h-0 overflow-y-auto scrollbar-thin chat-grain">
      {/* mt-auto in a flex-col is what bottom-anchors a short conversation:
          with only one message the spacer absorbs the slack, so the message
          sits just above the composer instead of stranded at the top.
          The inner max-width is the reading column — full-bleed message text
          on a wide monitor is unreadable. */}
      <div className="relative z-10 min-h-full flex flex-col justify-end px-4 py-3 sm:px-6 sm:py-5">
        <div className="mx-auto w-full max-w-[68rem]">
          {hasMore && (
            <div className="flex justify-center pb-5">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className={cn(
                  "rounded-[7px] border-[2px] px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.02em]",
                  "text-black dark:text-stone-100",
                  FRAME,
                  PANEL,
                  SHADOW_SM,
                  "transition-[transform,box-shadow] duration-150 hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]",
                  "disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0",
                  FOCUS_RING,
                )}
              >
                {loadingMore ? "Loading…" : "Load earlier messages"}
              </button>
            </div>
          )}

          {messages.length === 0 && <EmptyChannel channelName={channelName} />}

          {messages.map((message) => {
            const day = formatDayHeading(message.created_at);
            const showDay = day !== lastDay;
            if (showDay) lastDay = day;

            const stamp = new Date(message.created_at).getTime();
            // Consecutive messages from one person inside five minutes read as
            // a single turn, so only the first carries a name and avatar. A day
            // divider always restarts the grouping.
            const grouped =
              !showDay && message.author_id === lastAuthor && stamp - lastStamp < 5 * 60 * 1000 && !message.deleted_at;

            lastAuthor = message.author_id;
            lastStamp = stamp;

            const name = authorLabel(directory, message.author_id, currentUserId);
            const isMine = message.author_id === currentUserId;
            const hasReactions = Object.keys(message.reaction_counts ?? {}).length > 0;
            const mentionsMe = mentionsReader(message.content_text, myMentionTokens);

            const isNew = !settled.current.has(message.id);
            if (isNew) settled.current.add(message.id);

            return (
              <div key={message.id}>
                {showDay && (
                  <div className="flex items-center gap-3 py-4">
                    <div className="h-px flex-1 bg-black/12 dark:bg-stone-100/12" />
                    <span
                      className={cn(
                        "rounded-full border-[1.5px] px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.06em]",
                        "border-black/15 text-black/50 dark:border-stone-100/15 dark:text-stone-100/50",
                      )}
                    >
                      {day}
                    </span>
                    <div className="h-px flex-1 bg-black/12 dark:bg-stone-100/12" />
                  </div>
                )}

                <div
                  className={cn(
                    "group relative flex gap-3 rounded-[7px] px-3 transition-colors duration-150",
                    "hover:bg-black/[0.028] dark:hover:bg-stone-100/[0.045]",
                    grouped ? "py-[3px]" : "pt-3 pb-[3px]",
                    // A message that mentions you gets a standing amber marker,
                    // not just an inline pill — findable while scrolling fast.
                    mentionsMe &&
                      !message.deleted_at &&
                      "bg-[#FBBF24]/[0.09] hover:bg-[#FBBF24]/[0.14] ring-1 ring-inset ring-[#FBBF24]/30",
                    isNew && "animate-message-in",
                  )}
                >
                  {grouped ? (
                    <div className="w-8 shrink-0 pt-[3px] text-right">
                      <span className="text-[10px] tabular-nums text-black/0 transition-colors duration-150 group-hover:text-black/35 dark:group-hover:text-stone-100/35">
                        {formatTime(message.created_at)}
                      </span>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border-[2px] text-[10px] font-bold tracking-[0.02em] text-black",
                        FRAME,
                        tintFor(message.author_id),
                      )}
                      aria-hidden="true"
                    >
                      {initialsFor(name)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1 pb-0.5">
                    {!grouped && (
                      <div className="mb-1 flex items-baseline gap-2 leading-none">
                        <span className="text-[13px] font-bold tracking-[-0.01em] text-black dark:text-stone-100">
                          {name}
                        </span>
                        <span className="text-[10px] tabular-nums text-black/35 dark:text-stone-100/35">
                          {formatTime(message.created_at)}
                        </span>
                      </div>
                    )}

                    {message.deleted_at ? (
                      <p className="text-[13.5px] italic leading-[1.55] text-black/30 dark:text-stone-100/30">
                        This message was deleted
                      </p>
                    ) : (
                      <p className="text-[13.5px] leading-[1.55] text-black/90 dark:text-stone-100/90 whitespace-pre-wrap break-words [text-wrap:pretty]">
                        {renderWithMentions(message.content_text, myMentionTokens)}
                        {message.edited_at && (
                          <span className="ml-1.5 text-[10px] text-black/30 dark:text-stone-100/30">(edited)</span>
                        )}
                      </p>
                    )}

                    {hasReactions && !message.deleted_at && (
                      <ReactionRow
                        counts={message.reaction_counts}
                        mine={message.my_reactions ?? []}
                        onToggle={(emoji) => onToggleReaction(message.id, emoji)}
                      />
                    )}

                    {message.reply_count > 0 && (
                      <button
                        type="button"
                        onClick={() => onOpenThread(message)}
                        className={cn(
                          "mt-1.5 inline-flex items-center gap-1.5 rounded-[5px] py-0.5 pr-1.5",
                          "text-[11.5px] font-semibold text-black/60 dark:text-stone-100/60",
                          "transition-colors duration-150 hover:text-black dark:hover:text-stone-100",
                          FOCUS_RING,
                        )}
                      >
                        <CornerDownRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                        {message.reply_count} {message.reply_count === 1 ? "reply" : "replies"}
                      </button>
                    )}
                  </div>

                  {!message.deleted_at && (
                    <MessageActions
                      isMine={isMine}
                      onToggleReaction={(emoji) => onToggleReaction(message.id, emoji)}
                      onOpenThread={() => onOpenThread(message)}
                      onDelete={() => onDelete(message.id)}
                    />
                  )}
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

/** Whether a message's text mentions the reader. */
function mentionsReader(text: string, myNames: Set<string>) {
  if (myNames.size === 0 || !text) return false;
  for (const match of text.matchAll(/@([\w.-]+)/g)) {
    if (myNames.has(match[1].toLowerCase())) return true;
  }
  return false;
}
