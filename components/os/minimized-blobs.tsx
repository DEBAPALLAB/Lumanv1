"use client";

import { BLOB_SIZE, type WindowState, blobSlot, useDesktop, useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { KIND_ICON } from "./dock";

/** Per-kind tint, so three minimised chats are still distinguishable. */
const KIND_TINT: Record<string, string> = {
  note: "bg-[#8FB8AC]",
  chat: "bg-[#C3A6D8]",
  tasks: "bg-[#E0A458]",
  calendar: "bg-[#7FA5C4]",
  workspace: "bg-[#E8B4B8]",
};

/**
 * Minimised windows, as draggable blobs on the desktop.
 *
 * They live on the desktop rather than inside the dock because a minimised
 * window is still *yours to arrange* — the dock is fixed furniture, and burying
 * eight minimised notes in a fixed rail turns them into a list you scan rather
 * than objects you place.
 *
 * Default placement is the bottom-right corner, stacking upward — clear of the
 * dock, which owns the left edge. Dragging one pins it: from then on it keeps
 * the spot you put it in and stops shuffling when its neighbours come and go.
 */
export function MinimizedBlobs() {
  const desktop = useDesktop();
  const [, forceReflow] = useState(0);

  // Slots are measured against the viewport, so the column has to be recomputed
  // when the viewport changes — otherwise resizing the browser leaves the stack
  // hanging in the middle of the desktop or pushed off the right edge.
  useEffect(() => {
    const onResize = () => forceReflow((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const minimized = desktop.windows.filter((w) => w.minimized);

  // Only unpinned blobs take part in the automatic stack, and their slot is
  // their index *among the unpinned* — otherwise pinning one would leave a
  // gap in the column behind it.
  let autoIndex = 0;

  return (
    <>
      {minimized.map((win) => {
        const slot = win.blob ?? blobSlot(autoIndex++);
        return <Blob key={win.id} window={win} position={slot} />;
      })}
    </>
  );
}

function Blob({ window: win, position }: { window: WindowState; position: { x: number; y: number } }) {
  const actions = useDesktopActions();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    /** A press that never really moved is a click, not a drag. */
    moved: boolean;
  } | null>(null);

  const Icon = KIND_ICON[win.kind] ?? KIND_ICON.note;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      drag.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: position.x,
        originY: position.y,
        moved: false,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [position.x, position.y],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;

      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      // A few pixels of slop before it counts as a drag, so a slightly shaky
      // click still restores the window instead of nudging the blob.
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;

      const el = ref.current;
      if (!el) return;

      // Kept fully on screen — a blob dragged off the edge would be lost, and
      // unlike a window it has no dock entry to recover it from.
      const x = Math.max(6, Math.min(d.originX + dx, globalThis.innerWidth - BLOB_SIZE - 6));
      const y = Math.max(6, Math.min(d.originY + dy, globalThis.innerHeight - BLOB_SIZE - 6));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };

    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;

      if (!d.moved) {
        // A click, not a drag: restore the window.
        actions.minimize(win.id);
        return;
      }

      const el = ref.current;
      if (!el) return;
      actions.moveBlob(win.id, {
        x: Number.parseFloat(el.style.left) || position.x,
        y: Number.parseFloat(el.style.top) || position.y,
      });
    };

    globalThis.addEventListener("pointermove", onMove);
    globalThis.addEventListener("pointerup", onUp);
    globalThis.addEventListener("pointercancel", onUp);
    return () => {
      globalThis.removeEventListener("pointermove", onMove);
      globalThis.removeEventListener("pointerup", onUp);
      globalThis.removeEventListener("pointercancel", onUp);
    };
  }, [actions, win.id, position.x, position.y]);

  return (
    <div
      ref={ref}
      style={{ left: position.x, top: position.y, width: BLOB_SIZE, height: BLOB_SIZE, zIndex: 8500 }}
      className="group absolute"
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        aria-label={`Restore ${win.title}`}
        className={cn(
          "flex h-full w-full cursor-grab items-center justify-center rounded-[14px] border-[2px] border-black",
          "shadow-[0_3px_10px_-2px_rgba(0,0,0,0.25)] transition-transform duration-150",
          "hover:scale-105 active:cursor-grabbing active:scale-95",
          "dark:border-[#EDE7DD]",
          KIND_TINT[win.kind] ?? "bg-white dark:bg-[#2a2621]",
        )}
      >
        <Icon className="h-[19px] w-[19px] text-black" strokeWidth={2.4} />
      </button>

      {/* Label on hover. The blob is small and several may be stacked, so the
          title is what tells two minimised notes apart.
          Opens to the *left*: the stack lives against the right edge, so a
          label growing rightward would run off the screen. */}
      <span
        className={cn(
          "pointer-events-none absolute right-full top-1/2 z-50 mr-2.5 max-w-[220px] -translate-y-1/2 translate-x-[4px]",
          "truncate whitespace-nowrap rounded-[6px] bg-black px-2.5 py-1 text-[10.5px] font-semibold text-white",
          "opacity-0 transition-[opacity,transform] duration-150",
          "group-hover:translate-x-0 group-hover:opacity-100",
          "dark:bg-[#EDE7DD] dark:text-black",
        )}
      >
        {win.title}
      </span>
    </div>
  );
}
