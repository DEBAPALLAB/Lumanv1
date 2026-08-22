"use client";

import { OsConfirmDialog } from "@/components/os/os-confirm-dialog";
import type { Note, Workspace } from "@/lib/os/use-org-data";
import { useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import { FileText, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/** No DB-side limit on notes.title; this just keeps the inline field sane. */
const TITLE_MAX = 200;

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
  windowId,
  loadNotes,
  createNote,
  deleteNote,
  deleteWorkspace,
}: {
  workspaceId: string;
  workspace?: Workspace;
  windowId?: string;
  loadNotes: (workspaceId: string) => Promise<Note[]>;
  createNote: (workspaceId: string, title: string) => Promise<Note>;
  deleteNote: (workspaceId: string, noteId: string) => Promise<void>;
  deleteWorkspace?: (workspaceId: string) => Promise<void>;
}) {
  const actions = useDesktopActions();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingDeleteWorkspace, setPendingDeleteWorkspace] = useState(false);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

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

  async function handleCreateNote(title: string) {
    setCreatingBusy(true);
    try {
      const note = await createNote(workspaceId, title);
      setNotes((prev) => [note, ...(prev ?? [])]);
      setCreating(false);
      actions.open({
        kind: "note",
        title: note.title || "Untitled",
        payload: { noteId: note.id, workspaceId, workspaceName: workspace?.owner_name },
        dedupeKey: `note:${note.id}`,
      });
    } catch {
      // Left open with the typed title intact so the user can retry.
    } finally {
      setCreatingBusy(false);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteNote(workspaceId, pendingDelete.id);
      setNotes((prev) => (prev ?? []).filter((n) => n.id !== pendingDelete.id));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleConfirmDeleteWorkspace() {
    if (!deleteWorkspace) return;
    setDeletingWorkspace(true);
    try {
      await deleteWorkspace(workspaceId);
      if (windowId) actions.close(windowId);
      setPendingDeleteWorkspace(false);
    } finally {
      setDeletingWorkspace(false);
    }
  }

  if (!notes) return <GridSkeleton />;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#211e1a]">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3.5">
        <div
          className={cn(
            "flex flex-1 items-center gap-2 rounded-[8px] bg-black/[0.045] px-2.5 py-[7px]",
            "ring-1 ring-inset ring-transparent transition-[background-color,box-shadow]",
            "focus-within:bg-transparent focus-within:ring-black/60",
            "dark:bg-[#EDE7DD]/[0.07] dark:focus-within:ring-[#EDE7DD]/60",
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-black/35 dark:text-[#EDE7DD]/35" strokeWidth={2.5} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
            className="min-w-0 flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:text-black/30 dark:text-[#EDE7DD] dark:placeholder:text-[#EDE7DD]/30"
          />
        </div>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-black/30 dark:text-[#EDE7DD]/30">
          {filtered.length}
        </span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="New note"
          title="New note"
          className={cn(
            "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border-[2px] border-black",
            "bg-[#FBBF24] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
            "transition-[transform,box-shadow] duration-150 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
            "dark:border-[#EDE7DD] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.9)]",
          )}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
        </button>

        {deleteWorkspace && (
          <button
            type="button"
            onClick={() => setPendingDeleteWorkspace(true)}
            aria-label="Delete workspace"
            title="Delete workspace"
            className={cn(
              "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border-[2px] border-black",
              "bg-white text-black/50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
              "transition-all duration-150 hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-red-50 hover:text-red-600 hover:shadow-none",
              "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:text-[#EDE7DD]/50 dark:hover:bg-red-950/30 dark:hover:text-red-400 dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.9)]",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {creating && (
        <div className="shrink-0 px-4 pb-2">
          <InlineNoteField onCommit={handleCreateNote} onCancel={() => setCreating(false)} busy={creatingBusy} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 os-scroll">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-black/[0.05] dark:bg-[#EDE7DD]/[0.08]">
              <FileText className="h-5 w-5 text-black/30 dark:text-[#EDE7DD]/30" strokeWidth={2} />
            </div>
            <p className="mt-3 text-[13px] font-semibold text-black/50 dark:text-[#EDE7DD]/50">
              {query ? "No notes match that" : "No notes here yet"}
            </p>
          </div>
        ) : (
          // auto-fill rather than a fixed column count: the same grid has to
          // work in a 320px window and a maximised one.
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {filtered.map((note) => (
              <div key={note.id} className="group/card relative">
                <button
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
                    "flex h-[92px] w-full flex-col rounded-[10px] p-3 text-left",
                    "bg-black/[0.035] ring-1 ring-inset ring-black/[0.06]",
                    "transition-[background-color,transform] duration-150",
                    "hover:-translate-y-0.5 hover:bg-black/[0.06]",
                    "dark:bg-[#EDE7DD]/[0.06] dark:ring-[#EDE7DD]/[0.08] dark:hover:bg-[#EDE7DD]/[0.1]",
                  )}
                >
                  <span
                    className="mb-2 h-1 w-6 shrink-0 rounded-full"
                    style={{ background: workspace?.color || "#8FB8AC" }}
                    aria-hidden="true"
                  />
                  <span className="line-clamp-2 flex-1 pr-5 text-[12.5px] font-semibold leading-snug text-black dark:text-[#EDE7DD]">
                    {note.title || "Untitled"}
                  </span>
                  <span className="mt-1.5 text-[10px] tabular-nums text-black/30 dark:text-[#EDE7DD]/30">
                    {new Date(note.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                </button>

                {/* Hover-reveal rather than always-on: a permanent trash icon
                    on every card would read as the primary action on a
                    surface whose primary action is opening the note. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(note);
                  }}
                  aria-label={`Delete ${note.title || "Untitled"}`}
                  className={cn(
                    "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-[6px]",
                    "text-black/30 opacity-0 transition-[opacity,background-color,color] duration-150",
                    "hover:bg-red-500/10 hover:text-red-500",
                    "group-hover/card:opacity-100 focus-visible:opacity-100",
                    "dark:text-[#EDE7DD]/30",
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <OsConfirmDialog
        open={pendingDelete !== null}
        title="Delete this note?"
        body={`"${pendingDelete?.title || "Untitled"}" will be gone for everyone in this workspace. This can't be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <OsConfirmDialog
        open={pendingDeleteWorkspace}
        title={workspace ? `Delete "${workspace.owner_name}"?` : "Delete workspace?"}
        body="This will permanently delete this workspace and all notes inside it. This action cannot be undone."
        confirmLabel={deletingWorkspace ? "Deleting…" : "Delete workspace"}
        onConfirm={handleConfirmDeleteWorkspace}
        onCancel={() => setPendingDeleteWorkspace(false)}
      />
    </div>
  );
}

/**
 * Inline "new note" field — same commit-on-Enter/blur, cancel-on-Escape shape
 * as the flyout's InlineNameField (components/os/flyout.tsx), so creating a
 * note feels like the same gesture as creating a board.
 */
function InlineNoteField({
  onCommit,
  onCancel,
  busy,
}: {
  onCommit: (title: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    const title = value.trim();
    if (!title) {
      onCancel();
      return;
    }
    onCommit(title.slice(0, TITLE_MAX));
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[8px] bg-black/[0.045] px-2.5 py-[7px]",
        "ring-1 ring-inset ring-black/50 dark:bg-[#EDE7DD]/[0.07] dark:ring-[#EDE7DD]/50",
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-black/35 dark:text-[#EDE7DD]/35" />
      ) : (
        <FileText className="h-3.5 w-3.5 shrink-0 text-black/35 dark:text-[#EDE7DD]/35" strokeWidth={2.5} />
      )}
      <input
        ref={inputRef}
        value={value}
        disabled={busy}
        maxLength={TITLE_MAX}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setValue("");
            onCancel();
          }
        }}
        placeholder="Note title"
        aria-label="New note title"
        className="min-w-0 flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:text-black/30 dark:text-[#EDE7DD] dark:placeholder:text-[#EDE7DD]/30"
      />
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-2 p-4 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="h-[92px] rounded-[10px] bg-black/[0.05] animate-skeleton dark:bg-[#EDE7DD]/[0.07]"
          style={{ animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}
