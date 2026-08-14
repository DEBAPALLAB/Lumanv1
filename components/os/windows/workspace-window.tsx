"use client";

import type { Note, Workspace } from "@/lib/os/use-org-data";
import { useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import { FileText, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/**
 * A workspace, open as a window.
 *
 * Notes are cards in a responsive grid rather than a flat list: at a window's
 * scale a list of titles wastes the horizontal space a window has, and a note
 * is a thing you recognise by more than its name — the date and the workspace
 * tint do real work in telling two "Untitled" notes apart.
 */
export function WorkspaceWindow({
  workspaceId,
  workspace,
  loadNotes,
}: {
  workspaceId: string;
  workspace?: Workspace;
  loadNotes: (workspaceId: string) => Promise<Note[]>;
}) {
  const actions = useDesktopActions();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadNotes(workspaceId).then((result) => {
      if (!cancelled) setNotes(result);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, loadNotes]);

  const filtered = useMemo(() => {
    if (!notes) return [];
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => (n.title || "Untitled").toLowerCase().includes(q));
  }, [notes, query]);

  if (!notes) return <GridSkeleton />;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3.5">
        <div
          className={cn(
            "flex flex-1 items-center gap-2 rounded-[8px] bg-black/[0.045] px-2.5 py-[7px]",
            "ring-1 ring-inset ring-transparent transition-[background-color,box-shadow]",
            "focus-within:bg-transparent focus-within:ring-black/60",
            "dark:bg-stone-100/[0.07] dark:focus-within:ring-stone-100/60",
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-black/35 dark:text-stone-100/35" strokeWidth={2.5} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
            className="min-w-0 flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:text-black/30 dark:text-stone-100 dark:placeholder:text-stone-100/30"
          />
        </div>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-black/30 dark:text-stone-100/30">
          {filtered.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 os-scroll">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-black/[0.05] dark:bg-stone-100/[0.08]">
              <FileText className="h-5 w-5 text-black/30 dark:text-stone-100/30" strokeWidth={2} />
            </div>
            <p className="mt-3 text-[13px] font-semibold text-black/50 dark:text-stone-100/50">
              {query ? "No notes match that" : "No notes here yet"}
            </p>
          </div>
        ) : (
          // auto-fill rather than a fixed column count: the same grid has to
          // work in a 320px window and a maximised one.
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {filtered.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() =>
                  actions.open({
                    kind: "note",
                    title: note.title || "Untitled",
                    payload: { noteId: note.id, workspaceId, workspaceName: workspace?.owner_name },
                    dedupeKey: `note:${note.id}`,
                  })
                }
                className={cn(
                  "group flex h-[92px] flex-col rounded-[10px] p-3 text-left",
                  "bg-black/[0.035] ring-1 ring-inset ring-black/[0.06]",
                  "transition-[background-color,transform] duration-150",
                  "hover:-translate-y-0.5 hover:bg-black/[0.06]",
                  "dark:bg-stone-100/[0.06] dark:ring-stone-100/[0.08] dark:hover:bg-stone-100/[0.1]",
                )}
              >
                <span
                  className="mb-2 h-1 w-6 shrink-0 rounded-full"
                  style={{ background: workspace?.color || "#8FB8AC" }}
                  aria-hidden="true"
                />
                <span className="line-clamp-2 flex-1 text-[12.5px] font-semibold leading-snug text-black dark:text-stone-100">
                  {note.title || "Untitled"}
                </span>
                <span className="mt-1.5 text-[10px] tabular-nums text-black/30 dark:text-stone-100/30">
                  {new Date(note.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-2 p-4 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="h-[92px] rounded-[10px] bg-black/[0.05] animate-skeleton dark:bg-stone-100/[0.07]"
          style={{ animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}
