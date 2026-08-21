"use client";

import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Highlighter,
  Loader2,
  Minus,
  MousePointer2,
  Pen,
  Plus,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Annotation, type AnnotationTool, PdfAnnotationLayer } from "./pdf-annotation-layer";

/**
 * A PDF viewer with controls this app owns.
 *
 * An <iframe> pointed at a PDF gets the browser's built-in viewer, which
 * brings its own toolbar, its own colours and its own print/download buttons —
 * none of which can be styled or removed, and all of which look wrong inside a
 * window whose chrome this app drew. Rendering with pdf.js costs a dependency
 * and this file, and buys a viewer that matches everything around it.
 *
 * Pages render to canvas at device pixel ratio, with a transparent text layer
 * on top so selection and search work against real glyph positions rather than
 * an image of them.
 */

/**
 * The resolved document. Note this has no `destroy()` — teardown happens on
 * the loading task that produced it, which is what owns the worker.
 */
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  cleanup: () => Promise<unknown>;
};

/** What getDocument() returns: the task, not the document. */
type PdfLoadingTask = {
  promise: Promise<PdfDoc>;
  destroy: () => Promise<void>;
};

type PdfPage = {
  getViewport: (opts: { scale: number }) => PdfViewport;
  /**
   * pdf.js 6 takes the canvas itself and derives the context, rather than the
   * pre-scaled context earlier versions wanted. `scale` below is folded into
   * the viewport for the same reason.
   */
  render: (opts: { canvas: HTMLCanvasElement; viewport: PdfViewport }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
  /** Items carry the page's text runs; the full shape is pdf.js-internal. */
  getTextContent: () => Promise<{ items: { str?: string }[] }>;
  cleanup: () => void;
};

type PdfViewport = { width: number; height: number };

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const DEFAULT_ZOOM_INDEX = 2;

/** Annotation colours. Highlight uses them at low opacity; pen and pins at full. */
const ANNOTATION_COLORS = ["#FBBF24", "#8FB8AC", "#E8B4B8", "#7FA5C4", "#C3A6D8"];

export function PdfViewer({
  url,
  name,
  fileId,
  userId,
  displayName,
}: {
  url: string;
  name: string;
  /** Null when the PDF is not an uploaded org file — annotations are disabled. */
  fileId: string | null;
  userId: string | null;
  displayName: string;
}) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ page: number; index: number }[]>([]);
  const [activeMatch, setActiveMatch] = useState(0);
  const [searching, setSearching] = useState(false);

  const [tool, setTool] = useState<AnnotationTool>("none");
  const [color, setColor] = useState(ANNOTATION_COLORS[0]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [peers, setPeers] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  /** Page text, cached after the first search so re-queries do not re-extract. */
  const textCache = useRef<Map<number, string>>(new Map());
  // biome-ignore lint/suspicious/noExplicitAny: Supabase channel type is internal
  const channel = useRef<any>(null);

  const scale = ZOOM_STEPS[zoomIndex];

  // Load the document. The worker is served from public/ (see
  // scripts/copy-pdf-worker.js) rather than resolved through the bundler,
  // which behaves differently between Turbopack dev and the production build.
  useEffect(() => {
    let cancelled = false;
    // The task, not the document — destroying this is what releases the
    // worker, and the resolved document has no destroy() of its own.
    let task: PdfLoadingTask | null = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        task = pdfjs.getDocument({ url }) as unknown as PdfLoadingTask;
        const result = await task.promise;
        if (cancelled) return;
        setDoc(result);
      } catch (err) {
        // A cancelled load rejects too; only a live component should report it.
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open this PDF.");
        }
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);

  // Existing annotations. Loaded once per file; live changes arrive over
  // broadcast below rather than by refetching.
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;

    (async () => {
      const res = await fetch(`/api/org-files/${fileId}/annotations`);
      if (!res.ok || cancelled) return;
      setAnnotations((await res.json()) as Annotation[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  /**
   * Live annotations.
   *
   * Same transport split the whiteboard uses (see whiteboard-window.tsx):
   * broadcast carries the mark the moment it is made so collaborators see it
   * without a round trip to the database, while the row written by the API is
   * the durable copy a late joiner loads. Presence gives the reader count.
   */
  useEffect(() => {
    if (!fileId) return;

    const supabase = createSupabaseClient();
    const ch = supabase.channel(`pdf:${fileId}`, { config: { presence: { key: userId ?? "anon" } } });

    ch.on("broadcast", { event: "annotation" }, ({ payload }) => {
      const incoming = payload as Annotation;
      // Skip our own echo — the optimistic insert already added it.
      if (incoming.created_by === userId) return;
      setAnnotations((prev) => (prev.some((a) => a.id === incoming.id) ? prev : [...prev, incoming]));
    })
      .on("broadcast", { event: "annotation-delete" }, ({ payload }) => {
        const { id } = payload as { id: string };
        setAnnotations((prev) => prev.filter((a) => a.id !== id));
      })
      .on("presence", { event: "sync" }, () => {
        setPeers(Object.keys(ch.presenceState()).length || 1);
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") ch.track({ at: Date.now() });
      });

    channel.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channel.current = null;
    };
  }, [fileId, userId]);

  /**
   * Creates an annotation: shown immediately, broadcast, then persisted.
   *
   * Optimistic with a temporary id that is swapped for the real one when the
   * insert returns — waiting on a round trip before a highlight appears would
   * make marking up a document feel broken even while it works.
   */
  const createAnnotation = useCallback(
    async (input: {
      page: number;
      kind: Annotation["kind"];
      color: string;
      geometry: Annotation["geometry"];
      body?: string;
    }) => {
      if (!fileId) return;

      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: Annotation = {
        id: tempId,
        file_id: fileId,
        page: input.page,
        kind: input.kind,
        color: input.color,
        geometry: input.geometry,
        body: input.body ?? null,
        created_by: userId,
        author_name: displayName,
        created_at: new Date().toISOString(),
      };
      setAnnotations((prev) => [...prev, optimistic]);

      try {
        const res = await fetch(`/api/org-files/${fileId}/annotations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...input, authorName: displayName }),
        });
        if (!res.ok) throw new Error("Failed to save annotation");

        const saved = (await res.json()) as Annotation;
        setAnnotations((prev) => prev.map((a) => (a.id === tempId ? saved : a)));
        channel.current?.send({ type: "broadcast", event: "annotation", payload: saved });
      } catch {
        // Roll back rather than leaving a mark that exists for nobody else.
        setAnnotations((prev) => prev.filter((a) => a.id !== tempId));
      }
    },
    [fileId, userId, displayName],
  );

  const deleteAnnotation = useCallback(
    async (id: string) => {
      if (!fileId) return;
      const previous = annotations;
      setAnnotations((prev) => prev.filter((a) => a.id !== id));

      try {
        const res = await fetch(`/api/org-files/${fileId}/annotations/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete annotation");
        channel.current?.send({ type: "broadcast", event: "annotation-delete", payload: { id } });
      } catch {
        setAnnotations(previous);
      }
    },
    [fileId, annotations],
  );

  // Which page is in view, for the page indicator. Observing the pages rather
  // than computing from scrollTop keeps this correct at every zoom level
  // without tracking each page's height.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !doc) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const page = Number((visible.target as HTMLElement).dataset.page);
        if (page) {
          setCurrentPage(page);
          setPageInput(String(page));
        }
      },
      { root, threshold: [0.1, 0.5, 0.9] },
    );

    for (const el of pageRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [doc]);

  const scrollToPage = useCallback((page: number) => {
    const el = pageRefs.current.get(page);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /**
   * Full-text search across every page.
   *
   * Extracts text page by page and caches it: the second search of a document
   * is instant, and a long PDF is only ever parsed for text once.
   */
  const runSearch = useCallback(
    async (q: string) => {
      if (!doc || !q.trim()) {
        setMatches([]);
        return;
      }
      setSearching(true);
      const needle = q.trim().toLowerCase();
      const found: { page: number; index: number }[] = [];

      try {
        for (let p = 1; p <= doc.numPages; p++) {
          let text = textCache.current.get(p);
          if (text === undefined) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();
            text = content.items.map((i) => i.str ?? "").join(" ");
            textCache.current.set(p, text);
          }

          const haystack = text.toLowerCase();
          let from = 0;
          for (;;) {
            const at = haystack.indexOf(needle, from);
            if (at === -1) break;
            found.push({ page: p, index: at });
            from = at + needle.length;
          }
        }

        setMatches(found);
        setActiveMatch(0);
        if (found.length > 0) scrollToPage(found[0].page);
      } finally {
        setSearching(false);
      }
    },
    [doc, scrollToPage],
  );

  const goToMatch = useCallback(
    (direction: 1 | -1) => {
      if (matches.length === 0) return;
      const next = (activeMatch + direction + matches.length) % matches.length;
      setActiveMatch(next);
      scrollToPage(matches[next].page);
    },
    [matches, activeMatch, scrollToPage],
  );

  // Ctrl/Cmd+F opens search inside the window, rather than the browser's own
  // find bar which cannot see into the canvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setMatches([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const pages = useMemo(() => (doc ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : []), [doc]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[13px] font-semibold text-black/55 dark:text-[#EDE7DD]/55">{error}</p>
        <a
          href={url}
          download={name}
          className="rounded-[7px] border-[2px] border-black bg-[#FBBF24] px-3 py-1.5 text-[12px] font-bold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-[#EDE7DD]"
        >
          Download instead
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#F4F2EE] dark:bg-[#1a1815]">
      <Toolbar
        name={name}
        url={url}
        doc={doc}
        currentPage={currentPage}
        pageInput={pageInput}
        setPageInput={setPageInput}
        onJump={(p) => {
          if (doc && p >= 1 && p <= doc.numPages) scrollToPage(p);
        }}
        zoomIndex={zoomIndex}
        setZoomIndex={setZoomIndex}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        annotationsEnabled={fileId !== null}
        tool={tool}
        setTool={setTool}
        color={color}
        setColor={setColor}
        peers={peers}
      />

      {searchOpen && (
        <SearchBar
          query={query}
          setQuery={setQuery}
          onSubmit={() => void runSearch(query)}
          matches={matches.length}
          activeMatch={activeMatch}
          searching={searching}
          onNext={() => goToMatch(1)}
          onPrev={() => goToMatch(-1)}
          onClose={() => {
            setSearchOpen(false);
            setMatches([]);
            setQuery("");
          }}
        />
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto os-scroll">
        {!doc ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-black/30 dark:text-[#EDE7DD]/30" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 p-4">
            {pages.map((n) => (
              <PageCanvas
                key={n}
                doc={doc}
                pageNumber={n}
                scale={scale}
                registerRef={(el) => {
                  if (el) pageRefs.current.set(n, el);
                  else pageRefs.current.delete(n);
                }}
                annotationsEnabled={fileId !== null}
                annotations={annotations.filter((a) => a.page === n)}
                tool={tool}
                color={color}
                userId={userId}
                onCreate={createAnnotation}
                onDelete={deleteAnnotation}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Toolbar({
  name,
  url,
  doc,
  currentPage,
  pageInput,
  setPageInput,
  onJump,
  zoomIndex,
  setZoomIndex,
  searchOpen,
  setSearchOpen,
  annotationsEnabled,
  tool,
  setTool,
  color,
  setColor,
  peers,
}: {
  name: string;
  url: string;
  doc: PdfDoc | null;
  currentPage: number;
  pageInput: string;
  setPageInput: (v: string) => void;
  onJump: (page: number) => void;
  zoomIndex: number;
  setZoomIndex: (updater: (prev: number) => number) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  annotationsEnabled: boolean;
  tool: AnnotationTool;
  setTool: (tool: AnnotationTool) => void;
  color: string;
  setColor: (color: string) => void;
  peers: number;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1.5 border-b-[2px] border-black/10 px-3 py-2",
        "bg-white dark:border-[#EDE7DD]/10 dark:bg-[#211e1a]",
      )}
    >
      <ToolButton
        icon={Minus}
        label="Zoom out"
        onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
        disabled={zoomIndex === 0}
      />
      <span className="min-w-[42px] text-center text-[11px] font-bold tabular-nums text-black/55 dark:text-[#EDE7DD]/55">
        {Math.round(ZOOM_STEPS[zoomIndex] * 100)}%
      </span>
      <ToolButton
        icon={Plus}
        label="Zoom in"
        onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
        disabled={zoomIndex === ZOOM_STEPS.length - 1}
      />

      <div className="mx-1 h-4 w-px bg-black/10 dark:bg-[#EDE7DD]/15" />

      <input
        value={pageInput}
        onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") onJump(Number(pageInput));
        }}
        onBlur={() => setPageInput(String(currentPage))}
        aria-label="Page number"
        className={cn(
          "w-9 rounded-[6px] bg-black/[0.05] px-1.5 py-1 text-center text-[11px] font-bold tabular-nums",
          "outline-none ring-1 ring-inset ring-transparent focus:ring-black/50",
          "dark:bg-[#EDE7DD]/[0.08] dark:text-[#EDE7DD] dark:focus:ring-[#EDE7DD]/50",
        )}
      />
      <span className="text-[11px] font-semibold tabular-nums text-black/35 dark:text-[#EDE7DD]/35">
        / {doc?.numPages ?? "–"}
      </span>

      {annotationsEnabled && (
        <>
          <div className="mx-1 h-4 w-px bg-black/10 dark:bg-[#EDE7DD]/15" />

          <ToolButton icon={MousePointer2} label="Select" onClick={() => setTool("none")} active={tool === "none"} />
          <ToolButton
            icon={Highlighter}
            label="Highlight text"
            onClick={() => setTool(tool === "highlight" ? "none" : "highlight")}
            active={tool === "highlight"}
          />
          <ToolButton
            icon={Pen}
            label="Draw"
            onClick={() => setTool(tool === "draw" ? "none" : "draw")}
            active={tool === "draw"}
          />
          <ToolButton
            icon={StickyNote}
            label="Add note"
            onClick={() => setTool(tool === "note" ? "none" : "note")}
            active={tool === "note"}
          />

          {/* The palette only appears with a tool armed — it has nothing to
              act on otherwise, and five swatches of permanent chrome would
              crowd a toolbar this size. */}
          {tool !== "none" && (
            <div className="ml-1 flex items-center gap-1">
              {ANNOTATION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  className={cn(
                    "h-4 w-4 rounded-full border-[2px] transition-transform duration-150 hover:scale-110",
                    color === c ? "border-black dark:border-[#EDE7DD]" : "border-black/20 dark:border-[#EDE7DD]/20",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex-1" />

      {/* Only worth showing when somebody else is actually here. */}
      {annotationsEnabled && peers > 1 && (
        <span
          className="mr-1 flex items-center gap-1 text-[10.5px] font-bold text-black/40 dark:text-[#EDE7DD]/40"
          title={`${peers} people viewing`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#8FB8AC]" />
          {peers}
        </span>
      )}

      <ToolButton icon={Search} label="Search  ⌘F" onClick={() => setSearchOpen(!searchOpen)} active={searchOpen} />
      <a
        href={url}
        download={name}
        aria-label="Download"
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-[6px] text-black/45",
          "transition-colors hover:bg-black/[0.06] hover:text-black",
          "dark:text-[#EDE7DD]/45 dark:hover:bg-[#EDE7DD]/10 dark:hover:text-[#EDE7DD]",
        )}
      >
        <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
      </a>
    </div>
  );
}

function SearchBar({
  query,
  setQuery,
  onSubmit,
  matches,
  activeMatch,
  searching,
  onNext,
  onPrev,
  onClose,
}: {
  query: string;
  setQuery: (v: string) => void;
  onSubmit: () => void;
  matches: number;
  activeMatch: number;
  searching: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-b-[2px] border-black/10 px-3 py-1.5",
        "bg-[#FBBF24]/10 dark:border-[#EDE7DD]/10 dark:bg-[#FBBF24]/[0.07]",
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-black/35 dark:text-[#EDE7DD]/35" strokeWidth={2.5} />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (matches > 0) onNext();
            else onSubmit();
          }
        }}
        placeholder="Find in document"
        aria-label="Find in document"
        className="min-w-0 flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:text-black/30 dark:text-[#EDE7DD] dark:placeholder:text-[#EDE7DD]/30"
      />

      {searching ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-black/35 dark:text-[#EDE7DD]/35" />
      ) : (
        query.trim() !== "" && (
          <span className="shrink-0 text-[10.5px] font-bold tabular-nums text-black/45 dark:text-[#EDE7DD]/45">
            {matches === 0 ? "No results" : `${activeMatch + 1} / ${matches}`}
          </span>
        )
      )}

      <ToolButton icon={ChevronUp} label="Previous match" onClick={onPrev} disabled={matches === 0} />
      <ToolButton icon={ChevronDown} label="Next match" onClick={onNext} disabled={matches === 0} />
      <ToolButton icon={X} label="Close search" onClick={onClose} />
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] transition-colors",
        disabled
          ? "cursor-not-allowed text-black/20 dark:text-[#EDE7DD]/20"
          : active
            ? "bg-[#FBBF24] text-black"
            : cn(
                "text-black/45 hover:bg-black/[0.06] hover:text-black",
                "dark:text-[#EDE7DD]/45 dark:hover:bg-[#EDE7DD]/10 dark:hover:text-[#EDE7DD]",
              ),
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
    </button>
  );
}

/**
 * One page, rendered to canvas.
 *
 * Canvas is sized to devicePixelRatio and scaled back down in CSS, so text is
 * sharp on a retina display instead of being upscaled from CSS pixels. The
 * render task is cancelled on unmount and on zoom change — pdf.js throws if a
 * second render starts on a canvas while the first is still running.
 */
function PageCanvas({
  doc,
  pageNumber,
  scale,
  registerRef,
  annotationsEnabled,
  annotations,
  tool,
  color,
  userId,
  onCreate,
  onDelete,
}: {
  doc: PdfDoc;
  pageNumber: number;
  scale: number;
  registerRef: (el: HTMLDivElement | null) => void;
  annotationsEnabled: boolean;
  annotations: Annotation[];
  tool: AnnotationTool;
  color: string;
  userId: string | null;
  onCreate: (input: {
    page: number;
    kind: Annotation["kind"];
    color: string;
    geometry: Annotation["geometry"];
    body?: string;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      // The CSS size the page should occupy, and a second viewport at
      // devicePixelRatio for the backing store — rendering at the higher
      // scale and displaying at the lower is what keeps text sharp on a
      // retina screen rather than upscaled and soft.
      const cssViewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const renderViewport = page.getViewport({ scale: scale * ratio });

      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      setSize({ width: cssViewport.width, height: cssViewport.height });

      const render = page.render({ canvas, viewport: renderViewport });
      task = render;
      try {
        await render.promise;
      } catch {
        // Cancelled by a zoom change or unmount — expected, not an error.
        return;
      }

      // The text layer is a transparent copy of the page's glyphs positioned
      // over the canvas. It is what makes text selectable — and therefore what
      // makes highlighting snap to words instead of to a dragged rectangle.
      const container = textLayerRef.current;
      if (!container || cancelled) return;
      container.replaceChildren();

      try {
        const pdfjs = await import("pdfjs-dist");
        const textLayer = new pdfjs.TextLayer({
          textContentSource: (await page.getTextContent()) as never,
          container,
          viewport: cssViewport as never,
        });
        await textLayer.render();
      } catch {
        // Selection is a bonus on top of a page that already rendered; a text
        // layer failure should not blank the page.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, scale]);

  return (
    <div
      ref={registerRef}
      data-page={pageNumber}
      className="relative shadow-[0_1px_6px_rgba(0,0,0,0.14)]"
      style={size ? { width: size.width, height: size.height } : undefined}
    >
      <canvas
        ref={canvasRef}
        className="block bg-white"
        style={size ? { width: size.width, height: size.height } : undefined}
      />

      {/* Transparent glyphs over the canvas. pdf.js positions the spans
          absolutely and reads --scale-factor to size them, so that variable
          has to track the current zoom. */}
      <div
        ref={textLayerRef}
        className="pdf-text-layer absolute inset-0 overflow-hidden"
        style={{ ["--scale-factor" as string]: String(scale) }}
      />

      {annotationsEnabled && size && (
        <PdfAnnotationLayer
          page={pageNumber}
          tool={tool}
          color={color}
          annotations={annotations}
          userId={userId}
          onCreate={onCreate}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
