"use client";

import type { Scene, SceneElement } from "@/lib/db/whiteboards";
import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Circle, Eraser, Hand, Loader2, Locate, Minus, Pencil, Plus, Redo2, Square, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Tool = "pen" | "rect" | "ellipse" | "line" | "eraser" | "pan";

/** The pen palette. Deliberately small — a full picker is a modal for
 *  something that is nearly always one of these. */
const COLORS = ["#1c1917", "#E0A458", "#8FB8AC", "#7FA5C4", "#C3A6D8", "#E8B4B8"];
const WIDTHS = [2, 4, 8];

/** How long after the last stroke before the scene is persisted. */
const SAVE_DEBOUNCE_MS = 1200;

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

/** Spacing of the background dot grid, in world units. */
const GRID_SPACING = 40;

/** How often a moving cursor is broadcast. 20/sec is smooth without flooding. */
const CURSOR_THROTTLE_MS = 50;

/**
 * Hand-rolled rounded rect rather than the native CanvasRenderingContext2D
 * .roundRect(), which is missing on older Safari/WebKit builds still in use —
 * the name pill would silently not draw there without this.
 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let elementSeq = 0;
function nextId() {
  elementSeq += 1;
  return `${Date.now().toString(36)}-${elementSeq.toString(36)}`;
}

/** The visible window onto the infinite plane. */
type Viewport = { x: number; y: number; zoom: number };

type RemoteCursor = {
  x: number;
  y: number;
  /** Display name, for the label beside the pointer. */
  name: string;
  /** Stable per-person tint — NOT their current pen colour, which changes. */
  tint: string;
  at: number;
};

/**
 * Cursor tints. Distinct from the pen palette on purpose: a cursor is a person,
 * a stroke is ink, and reusing the pen colour would make someone who picked
 * black indistinguishable from someone else who did.
 */
const CURSOR_TINTS = ["#E0574F", "#2F80ED", "#7B4FE0", "#0F9D58", "#E08A2F", "#C13FA8"];

/** Deterministic tint per person, so everyone sees the same colour for them. */
function tintForUser(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CURSOR_TINTS[hash % CURSOR_TINTS.length];
}

/** Initials from a display name: two letters where there are two words. */
function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * An infinite shared whiteboard, open as a window.
 *
 * COORDINATES
 *   Everything in `scene` is in *world* space — an unbounded plane that has no
 *   relation to any particular window size. The viewport (pan + zoom) maps that
 *   plane onto the canvas at paint time. This is what makes the board both
 *   infinite and correct across devices: a stroke drawn at world (5000, -200)
 *   lands in the same place for everyone, whatever size their window is.
 *
 *   Storing screen coordinates, as the first version did, meant the same stroke
 *   appeared somewhere different on every screen.
 *
 * TRANSPORTS
 *   broadcast  finished elements and live cursors, so collaborators see strokes
 *              appear as they are made and can see where each other are.
 *   snapshot   the whole scene, written to the row on a debounce, so a reload
 *              or a late joiner gets everything.
 *
 * Rendered to <canvas> rather than SVG: a board with a few thousand strokes is
 * entirely normal, and that many DOM nodes would make every pointer move janky.
 */
export function WhiteboardWindow({
  boardId,
  userId,
  displayName,
}: {
  boardId: string;
  userId: string | null;
  displayName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [peers, setPeers] = useState(0);
  // Mirrors viewport.current for the zoom readout only; the canvas itself never
  // re-renders React to pan.
  const [zoomLabel, setZoomLabel] = useState(100);

  // Scene, viewport and in-flight stroke all live in refs: they change on every
  // pointer move, and re-rendering React sixty times a second to repaint a
  // canvas would be pure waste. Redraws are driven manually.
  const scene = useRef<Scene>({ elements: [] });
  const viewport = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const undone = useRef<SceneElement[]>([]);
  const drawing = useRef<SceneElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursors = useRef<Map<string, RemoteCursor>>(new Map());
  /** Pointer position in screen space while the eraser tool is active. */
  const eraserPos = useRef<{ x: number; y: number } | null>(null);
  const lastCursorSent = useRef(0);
  // biome-ignore lint/suspicious/noExplicitAny: Supabase channel type is internal
  const channel = useRef<any>(null);

  /** Screen point -> world point. The inverse of the paint transform. */
  const toWorld = useCallback((sx: number, sy: number): [number, number] => {
    const { x, y, zoom } = viewport.current;
    return [(sx - x) / zoom, (sy - y) / zoom];
  }, []);

  /** Repaints everything: grid, elements, in-flight stroke, remote cursors. */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const { x: panX, y: panY, zoom } = viewport.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // --- background dot grid, drawn in screen space so dots stay 1px ---------
    // Only the dots actually inside the viewport are drawn, so panning to world
    // (900000, 900000) costs exactly as much as sitting at the origin.
    const step = GRID_SPACING * zoom;
    if (step > 6) {
      const startX = ((panX % step) + step) % step;
      const startY = ((panY % step) + step) % step;
      ctx.fillStyle = "rgba(0,0,0,0.13)";
      for (let sx = startX; sx < cssW; sx += step) {
        for (let sy = startY; sy < cssH; sy += step) {
          ctx.fillRect(sx, sy, 1, 1);
        }
      }
    }

    // --- elements, in world space -------------------------------------------
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    const all = drawing.current ? [...scene.current.elements, drawing.current] : scene.current.elements;

    for (const el of all) {
      ctx.strokeStyle = el.color;
      // Divided by zoom so a 4px pen stays 4px on screen at any magnification,
      // rather than becoming a hairline when zoomed out.
      ctx.lineWidth = el.width / zoom;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();

      if (el.type === "path" && el.points && el.points.length > 1) {
        ctx.moveTo(el.points[0][0], el.points[0][1]);
        // Quadratic midpoints rather than straight segments: a polyline of raw
        // pointer samples looks visibly faceted at any real stroke width.
        for (let i = 1; i < el.points.length - 1; i++) {
          const [px, py] = el.points[i];
          const [nx, ny] = el.points[i + 1];
          ctx.quadraticCurveTo(px, py, (px + nx) / 2, (py + ny) / 2);
        }
        const last = el.points[el.points.length - 1];
        ctx.lineTo(last[0], last[1]);
      } else if (el.type === "rect") {
        ctx.rect(el.x ?? 0, el.y ?? 0, el.w ?? 0, el.h ?? 0);
      } else if (el.type === "ellipse") {
        ctx.ellipse(
          (el.x ?? 0) + (el.w ?? 0) / 2,
          (el.y ?? 0) + (el.h ?? 0) / 2,
          Math.abs(el.w ?? 0) / 2,
          Math.abs(el.h ?? 0) / 2,
          0,
          0,
          Math.PI * 2,
        );
      } else if (el.type === "arrow") {
        ctx.moveTo(el.x ?? 0, el.y ?? 0);
        ctx.lineTo((el.x ?? 0) + (el.w ?? 0), (el.y ?? 0) + (el.h ?? 0));
      }

      ctx.stroke();
    }

    ctx.restore();

    // --- eraser ring --------------------------------------------------------
    // Drawn at its true size so the sweep radius is visible; without it, drag
    // erasing is guesswork about what is about to go.
    const ring = eraserPos.current;
    if (ring) {
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ERASER_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.05)";
      ctx.fill();
    }

    // --- remote cursors, in screen space ------------------------------------
    const now = Date.now();
    for (const [id, cursor] of cursors.current) {
      // A cursor that has not moved for three seconds is stale — the peer has
      // probably left the window rather than frozen their hand.
      if (now - cursor.at > 3000) {
        cursors.current.delete(id);
        continue;
      }
      const sx = cursor.x * zoom + panX;
      const sy = cursor.y * zoom + panY;

      // A small filled dot marks the exact point, a name pill sits beside it —
      // the dot alone answers "where", the label answers "who".
      ctx.fillStyle = cursor.tint;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const label = initialsFor(cursor.name);
      ctx.font = "600 10px system-ui, -apple-system, sans-serif";
      const textWidth = ctx.measureText(label).width;
      const padX = 6;
      const pillW = textWidth + padX * 2;
      const pillH = 17;
      const pillX = sx + 8;
      const pillY = sy - 8;

      roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fillStyle = cursor.tint;
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(label, pillX + padX, pillY + pillH / 2 + 0.5);
    }
  }, []);

  /** Sizes the backing store to the element's CSS box at device resolution. */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    redraw();
  }, [redraw]);

  useEffect(() => {
    resize();
    const observer = new ResizeObserver(resize);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [resize]);

  // Repaint on a loop only while peers are present, so stale cursors fade even
  // when nothing local is happening. A board on your own costs nothing.
  useEffect(() => {
    if (peers < 2) return;
    const timer = setInterval(redraw, 120);
    return () => clearInterval(timer);
  }, [peers, redraw]);

  // Initial scene.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/whiteboards/${boardId}`);
        if (!res.ok) return;
        const board = (await res.json()) as { scene?: Scene };
        if (cancelled) return;
        scene.current = board.scene?.elements ? board.scene : { elements: [] };
        redraw();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boardId, redraw]);

  // Live collaboration.
  useEffect(() => {
    const supabase = createSupabaseClient();
    const ch = supabase.channel(`whiteboard:${boardId}`, { config: { presence: { key: userId ?? "anon" } } });

    ch.on("broadcast", { event: "element" }, ({ payload }) => {
      const el = payload as SceneElement;
      // Skip our own echo — we already drew it locally.
      if (el.author === userId) return;
      scene.current.elements.push(el);
      redraw();
    })
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        const c = payload as { id: string; x: number; y: number; name: string; tint: string };
        if (c.id === userId) return;
        cursors.current.set(c.id, { x: c.x, y: c.y, name: c.name, tint: c.tint, at: Date.now() });
        redraw();
      })
      .on("broadcast", { event: "erase" }, ({ payload }) => {
        const { id } = payload as { id: string };
        scene.current.elements = scene.current.elements.filter((el) => el.id !== id);
        redraw();
      })
      .on("broadcast", { event: "clear" }, () => {
        scene.current = { elements: [] };
        redraw();
      })
      .on("presence", { event: "sync" }, () => {
        setPeers(Object.keys(ch.presenceState()).length);
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") ch.track({ at: Date.now() });
      });

    channel.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channel.current = null;
    };
  }, [boardId, userId, redraw]);

  /** Debounced snapshot to the row. */
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/whiteboards/${boardId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scene: scene.current }),
        });
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [boardId]);

  // Flush a pending save on close, so the last stroke is not lost to the
  // debounce. keepalive lets the request outlive the unmount.
  useEffect(() => {
    return () => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      fetch(`/api/whiteboards/${boardId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scene: scene.current }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [boardId]);

  /** Zoom about a screen anchor, keeping the world point under it fixed. */
  const zoomAt = useCallback(
    (factor: number, anchorX: number, anchorY: number) => {
      const v = viewport.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      if (next === v.zoom) return;

      // Solve for the pan that leaves the anchor's world point where it was.
      const [wx, wy] = toWorld(anchorX, anchorY);
      v.zoom = next;
      v.x = anchorX - wx * next;
      v.y = anchorY - wy * next;

      setZoomLabel(Math.round(next * 100));
      redraw();
    },
    [toWorld, redraw],
  );

  // Wheel: ctrl/cmd zooms, otherwise it pans — the convention every canvas
  // tool uses. Non-passive so preventDefault actually stops the page scrolling.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();

      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
        return;
      }

      viewport.current.x -= e.deltaX;
      viewport.current.y -= e.deltaY;
      redraw();
    };

    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [zoomAt, redraw]);

  const panning = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(null);
  /** True while the eraser is held down, so dragging keeps erasing. */
  const erasing = useRef(false);

  /**
   * Erases everything under a world point.
   *
   * Sweeps the whole element list rather than stopping at the first hit: while
   * dragging, the pointer can cross several strokes between two move events,
   * and leaving the others behind would make the eraser feel like it was
   * skipping. Returns whether anything went, so the caller only broadcasts and
   * saves when there is something to report.
   */
  const eraseAt = useCallback(
    (x: number, y: number) => {
      const zoom = viewport.current.zoom;
      const doomed = scene.current.elements.filter((el) => nearElement(el, x, y, zoom));
      if (doomed.length === 0) return false;

      const gone = new Set(doomed.map((el) => el.id));
      scene.current.elements = scene.current.elements.filter((el) => !gone.has(el.id));

      // Erased elements are pushed onto the undo stack in the order they were
      // removed, so undo brings them back one at a time the way it does for
      // drawing.
      for (const el of doomed) undone.current.push(el);

      for (const id of gone) {
        channel.current?.send({ type: "broadcast", event: "erase", payload: { id } });
      }

      redraw();
      return true;
    },
    [redraw],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (loading) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const rect = canvasRef.current?.getBoundingClientRect();
    const sx = e.clientX - (rect?.left ?? 0);
    const sy = e.clientY - (rect?.top ?? 0);

    // Middle mouse, space-drag or the pan tool all move the viewport. Middle
    // button is what people reach for without being told.
    if (tool === "pan" || e.button === 1) {
      panning.current = { id: e.pointerId, sx, sy, ox: viewport.current.x, oy: viewport.current.y };
      return;
    }

    const [x, y] = toWorld(sx, sy);

    if (tool === "eraser") {
      // Held down: onPointerMove keeps erasing along the drag. A single click
      // still works — it is just a drag of zero length.
      erasing.current = true;
      if (eraseAt(x, y)) scheduleSave();
      return;
    }

    drawing.current = {
      id: nextId(),
      type: tool === "pen" ? "path" : tool === "line" ? "arrow" : tool,
      color,
      width,
      author: userId ?? undefined,
      ...(tool === "pen" ? { points: [[x, y]] } : { x, y, w: 0, h: 0 }),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const sx = e.clientX - (rect?.left ?? 0);
    const sy = e.clientY - (rect?.top ?? 0);

    const pan = panning.current;
    if (pan && pan.id === e.pointerId) {
      viewport.current.x = pan.ox + (sx - pan.sx);
      viewport.current.y = pan.oy + (sy - pan.sy);
      redraw();
      return;
    }

    // The eraser ring follows the pointer whenever that tool is selected, not
    // only while the button is held — it is a preview of what would go.
    if (tool === "eraser") {
      eraserPos.current = { x: sx, y: sy };
      redraw();
    }

    const [x, y] = toWorld(sx, sy);

    // Broadcast our cursor so collaborators can see where we are working.
    // Throttled — a pointermove fires far more often than anyone needs.
    const now = Date.now();
    if (userId && now - lastCursorSent.current > CURSOR_THROTTLE_MS) {
      lastCursorSent.current = now;
      channel.current?.send({
        type: "broadcast",
        event: "cursor",
        payload: { id: userId, x, y, name: displayName, tint: tintForUser(userId) },
      });
    }

    // Drag-to-erase. Saving is deferred to pointer-up rather than debounced per
    // move, so wiping a busy area is one write instead of dozens.
    if (erasing.current) {
      eraseAt(x, y);
      return;
    }

    const el = drawing.current;
    if (!el) return;

    if (el.type === "path") {
      el.points?.push([x, y]);
    } else {
      el.w = x - (el.x ?? 0);
      el.h = y - (el.y ?? 0);
    }
    redraw();
  };

  const onPointerUp = () => {
    panning.current = null;

    // One save for the whole erase gesture, however many strokes it took out.
    if (erasing.current) {
      erasing.current = false;
      scheduleSave();
      return;
    }

    const el = drawing.current;
    drawing.current = null;
    if (!el) return;

    // Discard accidental taps — invisible, but still a row in the scene and a
    // broadcast. Thresholds are in world units so they mean the same at any
    // zoom level.
    const slop = 3 / viewport.current.zoom;
    const trivial =
      el.type === "path" ? (el.points?.length ?? 0) < 2 : Math.abs(el.w ?? 0) < slop && Math.abs(el.h ?? 0) < slop;
    if (trivial) {
      redraw();
      return;
    }

    scene.current.elements.push(el);
    undone.current = [];
    redraw();
    channel.current?.send({ type: "broadcast", event: "element", payload: el });
    scheduleSave();
  };

  const undo = () => {
    const el = scene.current.elements.pop();
    if (el) {
      undone.current.push(el);
      channel.current?.send({ type: "broadcast", event: "erase", payload: { id: el.id } });
    }
    redraw();
    scheduleSave();
  };

  const redo = () => {
    const el = undone.current.pop();
    if (el) {
      scene.current.elements.push(el);
      channel.current?.send({ type: "broadcast", event: "element", payload: el });
    }
    redraw();
    scheduleSave();
  };

  const clear = () => {
    scene.current = { elements: [] };
    undone.current = [];
    redraw();
    channel.current?.send({ type: "broadcast", event: "clear", payload: {} });
    scheduleSave();
  };

  /**
   * Frames everything on the board.
   *
   * The counterpart to an infinite canvas: without a way home, panning far
   * enough in any direction strands you in blank space with no landmark.
   */
  const fitToContent = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const bounds = sceneBounds(scene.current.elements);
    if (!bounds) {
      viewport.current = { x: 0, y: 0, zoom: 1 };
      setZoomLabel(100);
      redraw();
      return;
    }

    const rect = wrap.getBoundingClientRect();
    const pad = 60;
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min((rect.width - pad * 2) / (bounds.w || 1), (rect.height - pad * 2) / (bounds.h || 1))),
    );

    viewport.current = {
      zoom,
      x: rect.width / 2 - (bounds.x + bounds.w / 2) * zoom,
      y: rect.height / 2 - (bounds.y + bounds.h / 2) * zoom,
    };
    setZoomLabel(Math.round(zoom * 100));
    redraw();
  };

  const tools: { id: Tool; icon: typeof Pencil; label: string }[] = [
    { id: "pen", icon: Pencil, label: "Pen" },
    { id: "rect", icon: Square, label: "Rectangle" },
    { id: "ellipse", icon: Circle, label: "Ellipse" },
    { id: "line", icon: Minus, label: "Line" },
    { id: "eraser", icon: Eraser, label: "Eraser" },
    { id: "pan", icon: Hand, label: "Pan" },
  ];

  const iconButton = (active: boolean) =>
    cn(
      "flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors duration-150",
      active
        ? "bg-[#FBBF24] text-black"
        : "text-black/50 hover:bg-black/[0.06] hover:text-black dark:text-stone-100/50 dark:hover:bg-stone-100/10",
    );

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b-[1.5px] border-black/[0.08] px-2.5 py-2 dark:border-stone-100/[0.08]">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTool(t.id);
              if (t.id !== "eraser") {
                eraserPos.current = null;
                redraw();
              }
            }}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            className={iconButton(tool === t.id)}
          >
            <t.icon className="h-[15px] w-[15px]" strokeWidth={2.4} />
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-black/10 dark:bg-stone-100/10" />

        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Colour ${c}`}
            aria-pressed={color === c}
            className={cn(
              "h-5 w-5 rounded-full transition-transform duration-150 hover:scale-110",
              color === c && "ring-2 ring-black/50 ring-offset-1 dark:ring-stone-100/50",
            )}
            style={{ background: c }}
          />
        ))}

        <span className="mx-1 h-4 w-px bg-black/10 dark:bg-stone-100/10" />

        {WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWidth(w)}
            aria-label={`Width ${w}`}
            aria-pressed={width === w}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors duration-150",
              width === w ? "bg-black/[0.09] dark:bg-stone-100/15" : "hover:bg-black/[0.05] dark:hover:bg-stone-100/10",
            )}
          >
            <span className="rounded-full bg-black dark:bg-stone-100" style={{ height: w, width: w }} />
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          {peers > 1 && (
            <span className="mr-1 rounded-full bg-[#8FB8AC]/20 px-2 py-0.5 text-[10px] font-semibold text-[#5E8378]">
              {peers} here
            </span>
          )}
          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin text-black/30 dark:text-stone-100/30" />}

          <button type="button" onClick={undo} aria-label="Undo" className={iconButton(false)}>
            <Undo2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
          </button>
          <button type="button" onClick={redo} aria-label="Redo" className={iconButton(false)}>
            <Redo2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={clear}
            aria-label="Clear board"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-black/50 transition-colors duration-150 hover:bg-red-500 hover:text-white dark:text-stone-100/50"
          >
            <Trash2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-zinc-900/70">
            <Loader2 className="h-5 w-5 animate-spin text-black/30 dark:text-stone-100/30" />
          </div>
        )}

        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            eraserPos.current = null;
            onPointerUp();
            redraw();
          }}
          className={cn(
            "block touch-none",
            tool === "pan"
              ? "cursor-grab active:cursor-grabbing"
              : tool === "eraser"
                ? "cursor-cell"
                : "cursor-crosshair",
          )}
        />

        {/* Zoom controls, floating over the canvas. Bottom-right so they never
            sit under the toolbar or the first thing anyone draws. */}
        <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-[9px] border border-black/10 bg-white/95 p-0.5 shadow-sm backdrop-blur dark:border-stone-100/10 dark:bg-zinc-800/95">
          <button
            type="button"
            onClick={() => {
              const r = wrapRef.current?.getBoundingClientRect();
              zoomAt(1 / 1.2, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2);
            }}
            aria-label="Zoom out"
            className={iconButton(false)}
          >
            <Minus className="h-[14px] w-[14px]" strokeWidth={2.5} />
          </button>

          <button
            type="button"
            onClick={() => {
              viewport.current = { x: 0, y: 0, zoom: 1 };
              setZoomLabel(100);
              redraw();
            }}
            aria-label="Reset zoom"
            className="min-w-[44px] rounded-[6px] px-1 py-1 text-[10.5px] font-semibold tabular-nums text-black/55 transition-colors hover:bg-black/[0.06] dark:text-stone-100/55 dark:hover:bg-stone-100/10"
          >
            {zoomLabel}%
          </button>

          <button
            type="button"
            onClick={() => {
              const r = wrapRef.current?.getBoundingClientRect();
              zoomAt(1.2, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2);
            }}
            aria-label="Zoom in"
            className={iconButton(false)}
          >
            <Plus className="h-[14px] w-[14px]" strokeWidth={2.5} />
          </button>

          <span className="mx-0.5 h-4 w-px bg-black/10 dark:bg-stone-100/10" />

          <button type="button" onClick={fitToContent} aria-label="Fit to content" className={iconButton(false)}>
            <Locate className="h-[14px] w-[14px]" strokeWidth={2.4} />
          </button>
        </div>

        <p className="pointer-events-none absolute bottom-3 left-3 select-none text-[10px] text-black/25 dark:text-stone-100/25">
          Scroll to pan · Ctrl+scroll to zoom
        </p>
      </div>
    </div>
  );
}

/** Bounding box of every element, in world space. Null when the board is empty. */
function sceneBounds(elements: SceneElement[]) {
  if (elements.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const include = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const el of elements) {
    if (el.type === "path" && el.points) {
      for (const [px, py] of el.points) include(px, py);
    } else {
      const x = el.x ?? 0;
      const y = el.y ?? 0;
      include(x, y);
      include(x + (el.w ?? 0), y + (el.h ?? 0));
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Eraser radius in screen pixels, converted to world units at hit-test time. */
const ERASER_RADIUS = 14;

/** Distance from a point to the segment ab. */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;

  // Degenerate segment — the two ends coincide, so it is just a point.
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);

  // Projection of p onto the line, clamped to the segment.
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Hit test for the eraser, in world units.
 *
 * The radius is a fixed number of *screen* pixels divided by zoom, so the
 * eraser feels the same size however far in or out you are. Tying it to each
 * element's own stroke width — as this did originally — made thin lines almost
 * impossible to catch while dragging.
 *
 * Paths are tested against their segments rather than only their sampled
 * points. A fast stroke can leave its samples 30px apart, and a point-only test
 * would let the eraser pass straight between two of them without erasing.
 */
function nearElement(el: SceneElement, x: number, y: number, zoom: number) {
  const slop = ERASER_RADIUS / zoom;

  if (el.type === "path" && el.points) {
    const pts = el.points;
    if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y) < slop;

    for (let i = 0; i < pts.length - 1; i++) {
      if (distanceToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < slop) {
        return true;
      }
    }
    return false;
  }

  const ex = el.x ?? 0;
  const ey = el.y ?? 0;
  const ew = el.w ?? 0;
  const eh = el.h ?? 0;

  return (
    x >= Math.min(ex, ex + ew) - slop &&
    x <= Math.max(ex, ex + ew) + slop &&
    y >= Math.min(ey, ey + eh) - slop &&
    y <= Math.max(ey, ey + eh) + slop
  );
}
