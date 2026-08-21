"use client";

import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type AnnotationKind = "highlight" | "draw" | "note";

export type Annotation = {
  id: string;
  file_id: string;
  page: number;
  kind: AnnotationKind;
  color: string;
  geometry: HighlightGeometry | DrawGeometry | NoteGeometry;
  body: string | null;
  created_by: string | null;
  author_name: string;
  created_at: string;
};

export type HighlightGeometry = { rects: { x: number; y: number; w: number; h: number }[] };
export type DrawGeometry = { points: [number, number][] };
export type NoteGeometry = { x: number; y: number };

export type AnnotationTool = "none" | "highlight" | "draw" | "note";

/**
 * The annotation surface for one page.
 *
 * Sits over the page canvas and renders every mark in normalised page space,
 * so a highlight stays on the same words at any zoom level or window size —
 * the geometry is stored 0..1 and multiplied by the rendered page size here.
 *
 * Pointer events pass through to the text layer when no tool is active, so
 * selecting text to copy still works; only an armed tool captures them.
 */
export function PdfAnnotationLayer({
  page,
  tool,
  color,
  annotations,
  userId,
  onCreate,
  onDelete,
}: {
  page: number;
  tool: AnnotationTool;
  color: string;
  annotations: Annotation[];
  userId: string | null;
  onCreate: (input: {
    page: number;
    kind: AnnotationKind;
    color: string;
    geometry: Annotation["geometry"];
    body?: string;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  /** In-flight freehand stroke, in normalised page space. */
  const [stroke, setStroke] = useState<[number, number][] | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<{ x: number; y: number } | null>(null);

  /** Screen point -> normalised page point. */
  const toPage = (clientX: number, clientY: number): [number, number] => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height];
  };

  // Highlighting works off the browser's own text selection rather than a drag
  // rectangle: the text layer already knows where glyphs are, so this snaps to
  // words the way a highlighter should instead of covering whatever the
  // pointer swept over.
  useEffect(() => {
    if (tool !== "highlight") return;

    const onUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const surface = surfaceRef.current;
      const pageRect = surface?.getBoundingClientRect();
      if (!surface || !pageRect) return;

      const range = selection.getRangeAt(0);
      // Ignore a selection that started on another page.
      if (!surface.parentElement?.contains(range.commonAncestorContainer)) return;

      const rects = Array.from(range.getClientRects())
        .filter((r) => r.width > 1 && r.height > 1)
        .map((r) => ({
          x: (r.left - pageRect.left) / pageRect.width,
          y: (r.top - pageRect.top) / pageRect.height,
          w: r.width / pageRect.width,
          h: r.height / pageRect.height,
        }));

      if (rects.length === 0) return;

      onCreate({ page, kind: "highlight", color, geometry: { rects } });
      selection.removeAllRanges();
    };

    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [tool, color, page, onCreate]);

  const active = tool !== "none";

  return (
    <div
      ref={surfaceRef}
      className={cn(
        "absolute inset-0",
        // Only an armed tool intercepts pointer events; otherwise the text
        // layer beneath stays selectable.
        active ? "pointer-events-auto" : "pointer-events-none",
        tool === "draw" && "cursor-crosshair",
        tool === "note" && "cursor-copy",
        tool === "highlight" && "cursor-text",
      )}
      onPointerDown={(e) => {
        if (tool === "draw") {
          e.currentTarget.setPointerCapture(e.pointerId);
          setStroke([toPage(e.clientX, e.clientY)]);
        }
        if (tool === "note") {
          const [x, y] = toPage(e.clientX, e.clientY);
          setDraftNote({ x, y });
        }
      }}
      onPointerMove={(e) => {
        if (tool !== "draw" || !stroke) return;
        setStroke((prev) => (prev ? [...prev, toPage(e.clientX, e.clientY)] : prev));
      }}
      onPointerUp={() => {
        if (tool !== "draw" || !stroke) return;
        // A tap with no movement is not a stroke.
        if (stroke.length > 1) {
          onCreate({ page, kind: "draw", color, geometry: { points: stroke } });
        }
        setStroke(null);
      }}
    >
      {/* Highlights sit under strokes and pins so a circled highlight reads
          correctly rather than the highlight covering the circle. */}
      {annotations
        .filter((a) => a.kind === "highlight")
        .map((a) => (
          <div key={a.id} className="group/mark">
            {(a.geometry as HighlightGeometry).rects?.map((r, i) => (
              <div
                key={`${a.id}-${i}`}
                className="absolute rounded-[2px] mix-blend-multiply dark:mix-blend-screen"
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                  background: a.color,
                  opacity: 0.42,
                }}
              />
            ))}
            {a.created_by === userId && (
              <DeleteChip
                x={((a.geometry as HighlightGeometry).rects?.[0]?.x ?? 0) * 100}
                y={((a.geometry as HighlightGeometry).rects?.[0]?.y ?? 0) * 100}
                onClick={() => onDelete(a.id)}
              />
            )}
          </div>
        ))}

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <title>Annotations</title>
        {annotations
          .filter((a) => a.kind === "draw")
          .map((a) => (
            <polyline
              key={a.id}
              points={(a.geometry as DrawGeometry).points?.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke={a.color}
              // Stroke width is in the 0..1 viewBox space, and
              // non-scaling-stroke keeps it a constant on-screen thickness
              // rather than growing with zoom.
              strokeWidth={0.004}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        {stroke && stroke.length > 1 && (
          <polyline
            points={stroke.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={0.004}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      {annotations
        .filter((a) => a.kind === "note")
        .map((a) => {
          const g = a.geometry as NoteGeometry;
          return (
            <NotePin
              key={a.id}
              annotation={a}
              x={g.x}
              y={g.y}
              open={openNote === a.id}
              canDelete={a.created_by === userId}
              onToggle={() => setOpenNote(openNote === a.id ? null : a.id)}
              onDelete={() => {
                onDelete(a.id);
                setOpenNote(null);
              }}
            />
          );
        })}

      {draftNote && (
        <NoteComposer
          x={draftNote.x}
          y={draftNote.y}
          color={color}
          onCancel={() => setDraftNote(null)}
          onCommit={(text) => {
            onCreate({
              page,
              kind: "note",
              color,
              geometry: { x: draftNote.x, y: draftNote.y },
              body: text,
            });
            setDraftNote(null);
          }}
        />
      )}
    </div>
  );
}

/** Hover-reveal delete for a highlight, anchored to its first rect. */
function DeleteChip({ x, y, onClick }: { x: number; y: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Delete highlight"
      className={cn(
        "absolute z-10 flex h-5 w-5 items-center justify-center rounded-[5px] border-[1.5px] border-black",
        "bg-white text-black/60 opacity-0 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]",
        "transition-opacity duration-150 hover:text-red-500 group-hover/mark:opacity-100",
      )}
      style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-115%, -15%)" }}
    >
      <Trash2 className="h-2.5 w-2.5" strokeWidth={2.5} />
    </button>
  );
}

/** A pinned sticky note: a small marker that expands to its text on click. */
function NotePin({
  annotation,
  x,
  y,
  open,
  canDelete,
  onToggle,
  onDelete,
}: {
  annotation: Annotation;
  x: number;
  y: number;
  open: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute z-20" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Note by ${annotation.author_name || "someone"}`}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full border-[2px] border-black",
          "text-[9px] font-black text-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]",
          "transition-transform duration-150 hover:scale-110",
        )}
        style={{ background: annotation.color, transform: "translate(-50%, -50%)" }}
      >
        {(annotation.author_name || "?").charAt(0).toUpperCase()}
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-2 top-2 w-52 rounded-[9px] border-[2px] border-black bg-white p-2.5",
            "shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
            "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.9)]",
          )}
        >
          <p className="whitespace-pre-wrap break-words text-[11.5px] leading-snug text-black dark:text-[#EDE7DD]">
            {annotation.body}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-[9.5px] font-semibold text-black/40 dark:text-[#EDE7DD]/40">
              {annotation.author_name || "Unknown"}
            </span>
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                aria-label="Delete note"
                className="shrink-0 text-black/35 transition-colors hover:text-red-500 dark:text-[#EDE7DD]/35"
              >
                <Trash2 className="h-3 w-3" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The compose box shown after clicking with the note tool armed. */
function NoteComposer({
  x,
  y,
  color,
  onCommit,
  onCancel,
}: {
  x: number;
  y: number;
  color: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="pointer-events-auto absolute z-30" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      <div
        className={cn(
          "w-56 rounded-[9px] border-[2px] border-black bg-white p-2",
          "shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
          "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.9)]",
        )}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-black" style={{ background: color }} />
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-black/40 dark:text-[#EDE7DD]/40">
            New note
          </span>
        </div>
        <textarea
          ref={ref}
          value={value}
          maxLength={2000}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Enter commits, Shift+Enter for a newline — the note is usually
            // one line, so requiring a button click for the common case would
            // be the wrong default.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (value.trim()) onCommit(value.trim());
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          onBlur={() => {
            if (value.trim()) onCommit(value.trim());
            else onCancel();
          }}
          rows={3}
          placeholder="Write a note…"
          aria-label="Note text"
          className={cn(
            "w-full resize-none rounded-[6px] bg-black/[0.04] p-1.5 text-[11.5px] leading-snug outline-none",
            "placeholder:text-black/30 dark:bg-[#EDE7DD]/[0.07] dark:text-[#EDE7DD] dark:placeholder:text-[#EDE7DD]/30",
          )}
        />
      </div>
    </div>
  );
}
