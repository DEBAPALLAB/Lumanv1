"use client";

import { MESSAGE_MAX_LENGTH } from "@/lib/messaging/content";
import { cn } from "@/lib/utils";
import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FOCUS_RING, FRAME, PANEL, SHADOW_MD, initialsFor, tintFor } from "./chrome";

export type MentionCandidate = { id: string; name: string; email: string };

/** How many suggestions the popup shows at once. */
const MAX_SUGGESTIONS = 6;

/** Characters remaining at which the counter appears. Showing it constantly is
 *  noise for messages that are nowhere near the ceiling. */
const COUNTER_THRESHOLD = 200;

/** Window height below which the composer drops its optional chrome and gives
 *  the space back to the transcript. */
const SHORT_VIEWPORT = 620;

/**
 * Finds an in-progress `@mention` immediately before the caret.
 *
 * Returns the query and where it starts, or null when the caret is not inside
 * a mention. The `@` must start a word — an email address mid-word should not
 * open the picker.
 */
function findMentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const upToCaret = text.slice(0, caret);
  const at = upToCaret.lastIndexOf("@");
  if (at === -1) return null;

  const charBefore = at > 0 ? upToCaret[at - 1] : " ";
  if (!/\s|^/.test(charBefore) && at !== 0) return null;

  const query = upToCaret.slice(at + 1);
  // A mention token is a single word; a space means the user moved on.
  if (/\s/.test(query)) return null;

  return { query, start: at };
}

export function MessageComposer({
  channelId,
  channelName,
  disabled,
  placeholder,
  mentionCandidates = [],
  onSend,
}: {
  channelId: string;
  channelName: string;
  disabled?: boolean;
  placeholder?: string;
  mentionCandidates?: MentionCandidate[];
  onSend: (text: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  // Whether the window is tall enough to spend a line on the keyboard hint.
  // Starts true so the server render and first client paint agree.
  const [roomy, setRoomy] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    return mentionCandidates
      .filter((candidate) => {
        if (!query) return true;
        return candidate.name.toLowerCase().includes(query) || candidate.email.toLowerCase().startsWith(query);
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [mention, mentionCandidates]);

  // Track how much vertical room the window has. A composer sized for a full
  // screen leaves a resized-down window with almost no transcript, so both the
  // hint line and the textarea's growth ceiling scale with the viewport.
  useEffect(() => {
    const measure = () => setRoomy(window.innerHeight >= SHORT_VIEWPORT);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Grow with the content up to a ceiling, then scroll inside. Reset to auto
  // first or the box can only ever get taller, never shorter. The ceiling is a
  // share of the window rather than a constant, so the field can never crowd
  // out the messages it belongs to.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const ceiling = Math.max(72, Math.min(180, Math.round(window.innerHeight * 0.3)));
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, ceiling)}px`;
  }, [value, roomy]);

  // Switching channels clears any half-typed message and returns focus, so a
  // draft never silently follows the reader into a different conversation.
  // Keyed on the id rather than the name: two channels in different scopes can
  // share a name, and switching between them must still reset.
  useEffect(() => {
    setValue("");
    setMention(null);
    setFailed(false);
    if (!disabled) textareaRef.current?.focus();
  }, [channelId, disabled]);

  // Keep the highlighted row in range as the candidate list narrows.
  useEffect(() => {
    setHighlighted((current) => (current >= suggestions.length ? 0 : current));
  }, [suggestions.length]);

  const syncMentionState = useCallback((text: string, caret: number) => {
    setMention(findMentionQuery(text, caret));
  }, []);

  const applyMention = useCallback(
    (candidate: MentionCandidate) => {
      if (!mention) return;
      const el = textareaRef.current;
      const caret = el?.selectionStart ?? value.length;

      // The label is written as a single token so it survives a round trip
      // through plain text; the display name's spaces would otherwise break
      // the mention back into ordinary words.
      const token = `@${candidate.name.replace(/\s+/g, "")}`;
      const next = `${value.slice(0, mention.start)}${token} ${value.slice(caret)}`;
      const nextCaret = mention.start + token.length + 1;

      setValue(next);
      setMention(null);

      // Restore the caret after React has painted the new value, otherwise the
      // browser puts it at the end of the textarea.
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [mention, value],
  );

  const overLimit = value.length > MESSAGE_MAX_LENGTH;
  const remaining = MESSAGE_MAX_LENGTH - value.length;

  const submit = async () => {
    const text = value.trim();
    if (!text || sending || disabled || overLimit) return;

    // Cleared before the await, not after: leaving the text in place during
    // the round trip invites a double-send on a slow network.
    setValue("");
    setMention(null);
    setFailed(false);
    setSending(true);
    try {
      await onSend(text);
    } catch {
      // Put it back so the message is not lost to a failed request, and say so
      // inline rather than leaving the reader to wonder where it went.
      setValue(text);
      setFailed(true);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const picking = Boolean(mention) && suggestions.length > 0;
  const canSend = Boolean(value.trim()) && !overLimit && !sending && !disabled;
  // In a short window every row belongs to the transcript, so the keyboard hint
  // — the one thing here that is purely nice-to-have — stands down.
  const showHint = focused && !disabled && roomy;

  return (
    <div className={cn("relative shrink-0 border-t-[3px] px-3 pb-2.5 pt-2.5 sm:px-5 sm:pb-3", FRAME, PANEL)}>
      {picking && (
        <div
          id="mention-popup"
          className={cn(
            "absolute bottom-full left-5 z-30 mb-2 max-h-64 w-80 overflow-y-auto rounded-[9px] border-[2.5px] scrollbar-thin",
            FRAME,
            PANEL,
            SHADOW_MD,
            "animate-pop-in",
          )}
        >
          <p className="border-b-[1.5px] border-black/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/40 dark:border-stone-100/10 dark:text-stone-100/40">
            People
          </p>
          {suggestions.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              id={`mention-option-${candidate.id}`}
              // onMouseDown, not onClick: the textarea would blur first and
              // the caret position needed to place the mention would be lost.
              onMouseDown={(e) => {
                e.preventDefault();
                applyMention(candidate);
              }}
              onMouseEnter={() => setHighlighted(index)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100",
                index === highlighted ? "bg-[#FBBF24] text-black" : "text-black dark:text-stone-100",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border-[2px] text-[10px] font-bold text-black",
                  FRAME,
                  tintFor(candidate.id),
                )}
              >
                {initialsFor(candidate.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold leading-tight">{candidate.name}</span>
                <span className="block truncate text-[10.5px] leading-tight opacity-55">{candidate.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {failed && (
        <p
          role="alert"
          className="mb-2 text-[11px] font-semibold text-red-600 dark:text-red-400"
        >
          We couldn't send that message. It's still here — try again.
        </p>
      )}

      {/* The whole field is one bordered surface with the send button living
          inside it, rather than a box and a detached square beside it. The
          focus ring moves to this wrapper so the composer reads as a single
          control. */}
      <div
        className={cn(
          "flex items-end gap-2 rounded-[9px] border-[2.5px] px-2.5 py-2 transition-[box-shadow,border-color] duration-150",
          FRAME,
          "bg-white dark:bg-zinc-950",
          focused && SHADOW_MD,
          overLimit && "border-red-600 dark:border-red-500",
          disabled && "opacity-60",
        )}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          // The textarea keeps focus while the mention popup is open, so it
          // owns the combobox semantics and points at the highlighted row
          // rather than the popup claiming focus it never takes.
          role="combobox"
          aria-expanded={picking}
          aria-controls={picking ? "mention-popup" : undefined}
          aria-activedescendant={picking ? `mention-option-${suggestions[highlighted]?.id}` : undefined}
          aria-autocomplete="list"
          onChange={(e) => {
            setValue(e.target.value);
            syncMentionState(e.target.value, e.target.selectionStart);
          }}
          onClick={(e) => syncMentionState(value, e.currentTarget.selectionStart)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setMention(null);
          }}
          onKeyDown={(e) => {
            // While the picker is open it owns the arrow keys, Enter and Tab —
            // otherwise Enter would send a message mid-selection.
            if (picking) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlighted((current) => (current + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlighted((current) => (current - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                applyMention(suggestions[highlighted]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMention(null);
                return;
              }
            }

            // Enter sends; Shift+Enter breaks the line. Guard on composing so
            // that committing an IME candidate does not fire the message.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          onKeyUp={(e) => syncMentionState(value, e.currentTarget.selectionStart)}
          placeholder={disabled ? "Select a channel to start talking" : (placeholder ?? `Message #${channelName}`)}
          className={cn(
            "flex-1 resize-none bg-transparent px-1 py-1 text-[13.5px] leading-[1.55] outline-none",
            "text-black placeholder:text-black/30 dark:text-stone-100 dark:placeholder:text-stone-100/30",
            "scrollbar-thin",
          )}
        />

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border-[2px]",
            "transition-[transform,background-color,box-shadow,opacity] duration-150",
            FOCUS_RING,
            canSend
              ? cn("bg-[#FBBF24] text-black", FRAME, "shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]")
              : "border-black/15 bg-black/[0.04] text-black/25 dark:border-stone-100/15 dark:bg-stone-100/[0.05] dark:text-stone-100/25",
          )}
        >
          <ArrowUp className={cn("h-4 w-4 transition-transform duration-150", sending && "animate-pulse")} strokeWidth={3} />
        </button>
      </div>

      {/* The hint and counter only take vertical space when they have something
          to say. Reserving a permanent line under the field left an empty band
          above the window edge that swallowed transcript rows once the window
          got short. */}
      {(showHint || remaining <= COUNTER_THRESHOLD) && (
        <div className="mt-1 flex items-center justify-between px-1">
          <span className="text-[10.5px] leading-none text-black/30 dark:text-stone-100/30">
            {showHint && (
              <>
                <span className="font-semibold">Enter</span> to send ·{" "}
                <span className="font-semibold">Shift + Enter</span> for a new line
              </>
            )}
          </span>
          {remaining <= COUNTER_THRESHOLD && (
            <span
              className={cn(
                "text-[10.5px] font-semibold leading-none tabular-nums",
                overLimit ? "text-red-600 dark:text-red-400" : "text-black/40 dark:text-stone-100/40",
              )}
            >
              {remaining.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
