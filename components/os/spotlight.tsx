"use client";

import { type WindowKind, useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import { CornerDownLeft, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { KIND_ICON } from "./dock";

export type SpotlightItem = {
  id: string;
  title: string;
  /** Right-hand context line — the workspace a note is in, unread count, … */
  hint?: string;
  section: string;
  kind: WindowKind;
  payload?: Record<string, unknown>;
};

/**
 * Command palette.
 *
 * Results are *things*, not links: choosing one opens it as a window rather
 * than navigating away, which is the whole premise of the desktop. Filtering
 * happens here over an already-loaded set rather than per-keystroke over the
 * network — the desktop knows its own notes and channels, and a round trip per
 * character would make the palette feel worse than the sidebar it replaces.
 */
export function Spotlight({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: SpotlightItem[];
  onClose: () => void;
}) {
  const actions = useDesktopActions();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
      // Focus after paint, or the browser drops it on a freshly mounted node.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 8);
    return items.filter((item) => item.title.toLowerCase().includes(q)).slice(0, 8);
  }, [items, query]);

  useEffect(() => {
    setHighlighted((current) => (current >= results.length ? 0 : current));
  }, [results.length]);

  if (!open) return null;

  const choose = (item: SpotlightItem) => {
    actions.open({ kind: item.kind, title: item.title, payload: item.payload, dedupeKey: item.id });
    onClose();
  };

  // Section headings are derived from the result order rather than grouped
  // ahead of time, so the arrow keys still walk one flat list.
  let lastSection = "";

  return (
    <>
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="fixed inset-0 z-[9400] cursor-default bg-black/20 backdrop-blur-[2px]"
      />

      <div
        className={cn(
          "fixed left-1/2 top-[12vh] z-[9500] w-[min(620px,calc(100vw-160px))] -translate-x-1/2",
          "overflow-hidden rounded-[14px] border-[3px] border-black bg-white",
          "shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]",
          "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.9)]",
        )}
      >
        <div className="flex items-center gap-3 border-b-[2.5px] border-black px-4 py-3.5 dark:border-[#EDE7DD]">
          <Search className="h-5 w-5 shrink-0 text-black dark:text-[#EDE7DD]" strokeWidth={2.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlighted((c) => (c + 1) % Math.max(results.length, 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlighted((c) => (c - 1 + results.length) % Math.max(results.length, 1));
              }
              if (e.key === "Enter" && results[highlighted]) {
                e.preventDefault();
                choose(results[highlighted]);
              }
            }}
            placeholder="Search notes, channels, people…"
            aria-label="Search"
            className={cn(
              "min-w-0 flex-1 bg-transparent text-[17px] font-medium outline-none",
              "text-black placeholder:text-black/30 dark:text-[#EDE7DD] dark:placeholder:text-[#EDE7DD]/30",
            )}
          />
          <kbd className="shrink-0 rounded-[4px] border-[1.5px] border-black/25 px-1.5 py-0.5 text-[10px] font-bold text-black/45 dark:border-[#EDE7DD]/25 dark:text-[#EDE7DD]/45">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5 os-scroll">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12.5px] text-black/40 dark:text-[#EDE7DD]/40">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((item, index) => {
              const showSection = item.section !== lastSection;
              lastSection = item.section;
              const Icon = item.kind === "search" ? Plus : (KIND_ICON[item.kind] ?? Search);
              const active = index === highlighted;

              return (
                <div key={item.id}>
                  {showSection && (
                    <p className="px-3 pb-1 pt-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-black/35 dark:text-[#EDE7DD]/35">
                      {item.section}
                    </p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => choose(item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left transition-colors duration-100",
                      active ? "bg-[#FBBF24] text-black" : "text-black dark:text-[#EDE7DD]",
                    )}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border-[2px] border-black bg-white dark:border-[#EDE7DD] dark:bg-[#2a2621]">
                      <Icon className="h-3.5 w-3.5 text-black dark:text-[#EDE7DD]" strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{item.title}</span>
                    {item.hint && (
                      <span
                        className={cn(
                          "shrink-0 text-[11px]",
                          active ? "text-black/55" : "text-black/40 dark:text-[#EDE7DD]/40",
                        )}
                      >
                        {item.hint}
                      </span>
                    )}
                    {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-black/50" strokeWidth={2.5} />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
