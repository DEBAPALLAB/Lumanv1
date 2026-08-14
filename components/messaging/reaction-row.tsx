"use client";

import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./chrome";

/** Emoji offered by the quick picker. Deliberately short — a full picker is a
 *  dependency and a modal for something that is nearly always one of these. */
export const QUICK_EMOJI = ["👍", "🎉", "✅", "👀", "🔥", "❤️"];

/**
 * The pill row under a message. Each pill is a toggle: pressed state means the
 * caller has reacted with it, and clicking removes it.
 *
 * Counts come from the messages_with_counts view rather than being recomputed
 * here, and `mine` likewise — so the highlight never disagrees with the tally.
 *
 * These sit at the quietest level of the border hierarchy: a reaction is
 * metadata about a message, so a hairline pill rather than the 2px frame the
 * panels use. The amber fill is reserved for your own reactions, which is the
 * only thing here you can act on.
 */
export function ReactionRow({
  counts,
  mine,
  onToggle,
}: {
  counts: Record<string, number>;
  mine: string[];
  onToggle: (emoji: string) => void;
}) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {entries
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([emoji, count]) => {
          const reacted = mine.includes(emoji);
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => onToggle(emoji)}
              aria-pressed={reacted}
              aria-label={`${emoji} ${count} ${count === 1 ? "reaction" : "reactions"}`}
              className={cn(
                "inline-flex h-[24px] items-center gap-1.5 rounded-full border-[1.5px] pl-1.5 pr-2 text-[11px] leading-none",
                "transition-[transform,background-color,border-color] duration-150 hover:-translate-y-[1px]",
                FOCUS_RING,
                reacted
                  ? "border-black/70 bg-[#FBBF24] font-bold text-black dark:border-stone-100/70"
                  : "border-black/15 bg-black/[0.03] text-black/65 hover:border-black/40 dark:border-stone-100/15 dark:bg-stone-100/[0.05] dark:text-stone-100/65 dark:hover:border-stone-100/40",
              )}
            >
              <span className="text-[13px]">{emoji}</span>
              <span className="tabular-nums font-semibold">{count}</span>
            </button>
          );
        })}
    </div>
  );
}
