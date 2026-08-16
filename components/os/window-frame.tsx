"use client";

import { type WindowState, useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

/** Smallest a window can be dragged down to before it stops being usable. */
const MIN_WIDTH = 260;
const MIN_HEIGHT = 160;

/**
 * Every edge and corner resizes, not just the bottom-right.
 *
 * The north and west directions move the window's origin as well as its size —
 * dragging the top edge upward has to grow the height *and* raise `y`, or the
 * window appears to slide instead of stretch.
 */
type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * One draggable, resizable, focusable window.
 *
 * Pointer events rather than mouse events, so a pen or touch drag works the
 * same as a mouse. The move handler is attached to `window` for the duration of
 * the drag rather than to the title bar: releasing outside the window — or
 * moving faster than React re-renders — must not drop the drag.
 *
 * Position is written straight to `style.transform` during the gesture and
 * committed to the store only on release. Routing every pointer move through
 * the store would re-render every window on the desktop sixty times a second.
 */
export function WindowFrame({
  window: win,
  focused,
  children,
}: {
  window: WindowState;
  focused: boolean;
  children: React.ReactNode;
}) {
  const actions = useDesktopActions();
  const frameRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originW: number;
    originH: number;
    mode: "move" | ResizeEdge;
  } | null>(null);

  const beginDrag = useCallback(
    (e: React.PointerEvent, mode: "move" | ResizeEdge) => {
      // A maximised window is pinned; dragging its title bar should do nothing
      // rather than tear it out of the maximised rect at an arbitrary offset.
      if (mode === "move" && win.maximized) return;

      e.preventDefault();
      actions.focus(win.id);

      dragState.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: win.rect.x,
        originY: win.rect.y,
        originW: win.rect.width,
        originH: win.rect.height,
        mode,
      };

      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [actions, win.id, win.maximized, win.rect],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragState.current;
      if (!drag || e.pointerId !== drag.pointerId) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const el = frameRef.current;
      if (!el) return;

      if (drag.mode === "move") {
        // Clamped so a window can never be dragged fully off-screen, which
        // would leave it unreachable except through the dock.
        const x = Math.max(8, Math.min(drag.originX + dx, globalThis.innerWidth - 120));
        const y = Math.max(8, Math.min(drag.originY + dy, globalThis.innerHeight - 60));
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        return;
      }

      const mode = drag.mode;

      // East / south grow away from the origin, so only the size changes.
      if (mode.includes("e")) {
        el.style.width = `${Math.max(MIN_WIDTH, drag.originW + dx)}px`;
      }
      if (mode.includes("s")) {
        el.style.height = `${Math.max(MIN_HEIGHT, drag.originH + dy)}px`;
      }

      // West / north grow *towards* the origin: the edge being dragged stays
      // under the pointer while the opposite edge stays put, which means the
      // origin moves by however much the size actually changed. Clamping the
      // size first and deriving the origin from it is what stops the window
      // creeping sideways once it hits the minimum.
      if (mode.includes("w")) {
        const width = Math.max(MIN_WIDTH, drag.originW - dx);
        el.style.width = `${width}px`;
        el.style.left = `${drag.originX + (drag.originW - width)}px`;
      }
      if (mode.includes("n")) {
        const height = Math.max(MIN_HEIGHT, drag.originH - dy);
        el.style.height = `${height}px`;
        el.style.top = `${drag.originY + (drag.originH - height)}px`;
      }
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragState.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragState.current = null;

      // Commit whatever the DOM currently shows, so the store and the painted
      // position agree exactly rather than by recomputation.
      const el = frameRef.current;
      if (!el) return;
      actions.move(win.id, {
        x: Number.parseFloat(el.style.left) || win.rect.x,
        y: Number.parseFloat(el.style.top) || win.rect.y,
        width: Number.parseFloat(el.style.width) || win.rect.width,
        height: Number.parseFloat(el.style.height) || win.rect.height,
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
  }, [actions, win.id, win.rect]);

  if (win.minimized) return null;

  return (
    // A <section>, not role="dialog": these windows are non-modal and several
    // are open at once, so they are labelled regions of the desktop rather
    // than dialogs stacked over it.
    <section
      ref={frameRef}
      aria-label={win.title}
      onPointerDown={() => actions.focus(win.id)}
      style={{
        left: win.rect.x,
        top: win.rect.y,
        width: win.rect.width,
        height: win.rect.height,
        zIndex: win.z,
      }}
      className={cn(
        // No overflow-hidden here: it would clip the resize handles that sit
        // just outside the border. The title bar and content clip themselves.
        "absolute flex flex-col rounded-[10px] border-[2px] border-black bg-white",
        "dark:border-[#EDE7DD] dark:bg-[#211e1a]",
        // A soft, tinted drop shadow rather than the hard offset block the
        // dock buttons use. That treatment reads as deliberate at 40px; on a
        // 700px window it becomes a slab of solid black down two edges.
        // Depth still encodes focus — the focused window simply sits higher.
        focused
          ? "shadow-[0_10px_28px_-6px_rgba(0,0,0,0.28),0_3px_10px_-3px_rgba(0,0,0,0.18)]"
          : "shadow-[0_4px_14px_-4px_rgba(0,0,0,0.16)]",
        win.maximized && "transition-[left,top,width,height] duration-200",
      )}
    >
      {/* Title bar. The whole strip is the drag handle, minus the buttons. */}
      <header
        onPointerDown={(e) => beginDrag(e, "move")}
        onDoubleClick={() => actions.maximize(win.id)}
        className={cn(
          // Rounds with the frame, since the frame itself no longer clips.
          "flex h-9 shrink-0 select-none items-center gap-2 rounded-t-[8px] border-b-[2px] px-2.5",
          "border-black dark:border-[#EDE7DD]",
          win.maximized ? "cursor-default" : "cursor-grab active:cursor-grabbing",
          focused ? "bg-[#FBBF24]" : "bg-black/[0.04] dark:bg-[#EDE7DD]/[0.06]",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[12px] font-bold tracking-[-0.01em]",
            focused ? "text-black" : "text-black/55 dark:text-[#EDE7DD]/55",
          )}
        >
          {win.title}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {[
            { icon: Minus, label: "Minimize", run: () => actions.minimize(win.id) },
            {
              icon: win.maximized ? Minimize2 : Maximize2,
              label: win.maximized ? "Restore" : "Maximize",
              run: () => actions.maximize(win.id),
            },
            { icon: X, label: "Close", run: () => actions.close(win.id), danger: true },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              aria-label={btn.label}
              // Stops the title-bar drag from starting on a button press.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={btn.run}
              className={cn(
                "flex h-[18px] w-[18px] items-center justify-center rounded-[4px]",
                "transition-colors duration-150",
                // No border and no fill at rest — three outlined boxes in the
                // title bar competed with the window's own frame.
                btn.danger
                  ? "text-black/55 hover:bg-red-500 hover:text-white"
                  : "text-black/55 hover:bg-black/15 hover:text-black dark:hover:bg-[#EDE7DD]/20",
                focused ? "text-black/60" : "text-black/40 dark:text-[#EDE7DD]/40",
              )}
            >
              <btn.icon className="h-3 w-3" strokeWidth={2.75} />
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto rounded-b-[8px] os-scroll">{children}</div>

      {/* Resize handles: all four edges and all four corners.
          They sit *outside* the frame's rounded clip via negative insets, so
          the grab zone is a comfortable 8px band rather than a 1px border the
          pointer has to hunt for. Corners are layered after edges so they win
          the overlap. Hidden while maximised, where resizing is meaningless. */}
      {!win.maximized &&
        (
          [
            ["n", "-top-1 left-3 right-3 h-2 cursor-ns-resize"],
            ["s", "-bottom-1 left-3 right-3 h-2 cursor-ns-resize"],
            ["w", "-left-1 top-3 bottom-3 w-2 cursor-ew-resize"],
            ["e", "-right-1 top-3 bottom-3 w-2 cursor-ew-resize"],
            ["nw", "-top-1 -left-1 h-4 w-4 cursor-nwse-resize"],
            ["ne", "-top-1 -right-1 h-4 w-4 cursor-nesw-resize"],
            ["sw", "-bottom-1 -left-1 h-4 w-4 cursor-nesw-resize"],
            ["se", "-bottom-1 -right-1 h-4 w-4 cursor-nwse-resize"],
          ] as const
        ).map(([edge, position]) => (
          <div
            key={edge}
            onPointerDown={(e) => beginDrag(e, edge)}
            className={cn("absolute z-30", position)}
            aria-hidden="true"
          />
        ))}
    </section>
  );
}
