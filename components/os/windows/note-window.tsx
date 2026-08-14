"use client";

import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Same dynamic import the v1 note page uses: the editor is heavy and cannot
// server-render, and a desktop can have several note windows open at once, so
// loading it per-window on demand matters more here than it did on a page.
const TailwindAdvancedEditor = dynamic(() => import("@/components/editor/advanced-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-black/30 dark:text-stone-100/30" />
    </div>
  ),
});

/**
 * A note, open as a window.
 *
 * The v1 page reads its ids from the route via useParams. A window has no
 * route, so the ids arrive in the window's payload instead — that is the only
 * substantive difference between this and the page it replaces.
 */
export function NoteWindow({
  noteId,
  workspaceId,
  workspaceName,
}: {
  noteId: string;
  workspaceId: string;
  workspaceName?: string;
}) {
  const [title, setTitle] = useState("");
  // Tiptap's document shape — passed straight through to the editor, which
  // owns its own autosave from that point on.
  // biome-ignore lint/suspicious/noExplicitAny: Tiptap content is complex
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/notes/${noteId}`);
        if (!res.ok) {
          if (!cancelled) setError("Could not load this note.");
          return;
        }
        // biome-ignore lint/suspicious/noExplicitAny: note payload is loose
        const note = (await res.json()) as { title?: string; content?: any };
        if (cancelled) return;
        setTitle(note.title ?? "");
        setContent(note.content ?? null);
      } catch {
        if (!cancelled) setError("Could not load this note.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [noteId]);

  // Title saves on blur rather than per-keystroke: the editor body already
  // autosaves on its own schedule, and a PATCH per character would multiply
  // writes across every open note window.
  const saveTitle = async () => {
    setSaving(true);
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-black/30 dark:text-stone-100/30" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-[12.5px] font-semibold text-black/50 dark:text-stone-100/50">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
      {/* Document header. Scrolls away with the content rather than sitting in
          a fixed bar: inside a window the title bar above already says which
          note this is, so a second pinned header wastes the little height a
          window has. */}
      <div className="min-h-0 flex-1 overflow-y-auto os-scroll">
        {/* Generous, scale-aware gutters. A document needs air on both sides to
            be readable, and the window's own border is right there — text that
            runs up to it reads as cramped no matter how good the type is. */}
        <div className="mx-auto w-full max-w-[46rem] px-8 pb-20 pt-8 sm:px-12 lg:px-14">
          <div className="flex items-center gap-2">
            {workspaceName && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-black/35 dark:text-stone-100/35">
                {workspaceName}
              </span>
            )}
            {saving && <span className="text-[10px] font-medium text-black/25 dark:text-stone-100/25">Saving…</span>}
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            placeholder="Untitled"
            aria-label="Note title"
            className={cn(
              "mt-1.5 w-full bg-transparent text-[30px] font-bold leading-[1.15] tracking-[-0.03em] outline-none",
              "text-black placeholder:text-black/20 dark:text-stone-100 dark:placeholder:text-stone-100/20",
            )}
          />

          {/*
            The shared editor is styled for a full page: it wraps itself in a
            bordered, shadowed card with a 600px floor and 32px of internal
            padding. Inside a window that reads as a box drawn inside a box.
            These overrides strip that chrome back to a bare document — the
            component itself is left alone because v1's note page still renders
            it as a card and depends on that.
          */}
          <div className={cn("mt-5", "os-note-editor")}>
            <TailwindAdvancedEditor initialContent={content} noteId={noteId} workspaceId={workspaceId} />
          </div>
        </div>
      </div>
    </div>
  );
}
