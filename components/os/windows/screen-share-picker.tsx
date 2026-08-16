"use client";

import { cn } from "@/lib/utils";
import type { DesktopCaptureSource } from "@/types/electron";
import { AppWindow, Monitor } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/**
 * Source chooser for the desktop build.
 *
 * Electron gives a renderer no picker of its own, so this stands in for the
 * one Chrome shows on the web. It covers the call window rather than opening
 * as a second desktop window: picking a screen is a step inside starting a
 * share, not a task you leave running beside it.
 *
 * Screens and windows are separated because they are different decisions —
 * "show them everything" versus "show them this one thing" — and a flat list
 * mixed together makes the safer choice harder to find.
 */
export function ScreenSharePicker({
  sources,
  onPick,
  onClose,
}: {
  sources: DesktopCaptureSource[];
  onPick: (sourceId: string) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);

  const screens = useMemo(() => sources.filter((s) => s.kind === "screen"), [sources]);
  const windows = useMemo(() => sources.filter((s) => s.kind === "window"), [sources]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const choose = (id: string) => {
    // Held so the tile can show it was the one picked while the stream
    // negotiates, which on a large display is a visible beat.
    setPending(id);
    onPick(id);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white/97 backdrop-blur-sm dark:bg-[#211e1a]/97">
      <header className="flex shrink-0 items-center gap-2 border-b-[1.5px] border-black/[0.08] px-4 py-2.5 dark:border-[#EDE7DD]/[0.08]">
        <h2 className="min-w-0 flex-1 text-[12.5px] font-bold tracking-[-0.01em] text-black dark:text-[#EDE7DD]">
          Choose what to share
        </h2>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "rounded-[6px] px-2 py-1 text-[11px] font-semibold",
            "text-black/50 transition-colors hover:bg-black/[0.06] hover:text-black",
            "dark:text-[#EDE7DD]/50 dark:hover:bg-[#EDE7DD]/10 dark:hover:text-[#EDE7DD]",
          )}
        >
          Cancel
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 os-scroll">
        {sources.length === 0 ? (
          <p className="py-10 text-center text-[11.5px] italic text-black/35 dark:text-[#EDE7DD]/35">
            Nothing available to share.
          </p>
        ) : (
          <>
            <Section title="Screens" icon={Monitor} sources={screens} pending={pending} onPick={choose} />
            <Section title="Windows" icon={AppWindow} sources={windows} pending={pending} onPick={choose} />
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  sources,
  pending,
  onPick,
}: {
  title: string;
  icon: typeof Monitor;
  sources: DesktopCaptureSource[];
  pending: string | null;
  onPick: (id: string) => void;
}) {
  if (sources.length === 0) return null;

  return (
    <section className="mb-4 last:mb-0">
      <h3 className="mb-2 flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-black/32 dark:text-[#EDE7DD]/32">
        <Icon className="h-3 w-3" strokeWidth={2.5} />
        {title}
      </h3>

      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
        {sources.map((source) => (
          <button
            key={source.id}
            type="button"
            onClick={() => onPick(source.id)}
            disabled={pending !== null}
            className={cn(
              "group flex flex-col overflow-hidden rounded-[10px] text-left",
              "ring-1 ring-inset ring-black/[0.09] transition-[transform,box-shadow,opacity] duration-150",
              "hover:-translate-y-0.5 hover:ring-black focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-black",
              "dark:ring-[#EDE7DD]/[0.12] dark:hover:ring-[#EDE7DD] dark:focus-visible:ring-[#EDE7DD]",
              pending === source.id && "ring-[2px] ring-[#FBBF24]",
              pending !== null && pending !== source.id && "opacity-40",
            )}
          >
            <span className="flex aspect-[16/10] items-center justify-center overflow-hidden bg-black/[0.06] dark:bg-black/40">
              {source.thumbnail ? (
                <img src={source.thumbnail} alt="" className="h-full w-full object-contain" />
              ) : (
                <Monitor className="h-6 w-6 text-black/25 dark:text-[#EDE7DD]/25" strokeWidth={2} />
              )}
            </span>

            <span className="flex items-center gap-1.5 px-2 py-1.5">
              {source.appIcon && <img src={source.appIcon} alt="" className="h-3.5 w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-black dark:text-[#EDE7DD]">
                {source.name}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
