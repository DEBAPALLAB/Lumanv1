"use client";

import type { Board, Channel, Folder, Note, VoiceRoom, Workspace } from "@/lib/os/use-org-data";
import { useDesktop, useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  Hash,
  Layers,
  type LucideIcon,
  PenTool,
  Phone,
  Plus,
  Radio,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The dock flyout: a small panel that opens beside the dock rather than as a
 * window on the desktop.
 *
 * This is the navigation half of the old sidebar. It exists because opening a
 * *browser* and opening a *document* are different acts: you pick a workspace
 * in order to reach a note, and the picker should get out of the way once you
 * have. A full window for "Workspaces" would sit in the pill tray forever
 * competing with the documents you actually opened.
 *
 * Two levels, matching the v1 workflow exactly:
 *   workspaces:  folders + workspaces  ->  a workspace's notes  -> opens a note
 *   chats:       org channels + per-workspace channels          -> opens a channel
 */
export function Flyout({
  workspaces,
  folders,
  channels,
  boards,
  rooms,
  loadNotes,
  createWorkspace,
  createNote,
  onOpenBoard,
  onStartCall,
  loading,
}: {
  workspaces: Workspace[];
  folders: Folder[];
  channels: Channel[];
  boards: Board[];
  rooms: VoiceRoom[];
  loadNotes: (workspaceId: string) => Promise<Note[]>;
  createWorkspace: (ownerName: string) => Promise<Workspace>;
  createNote: (workspaceId: string, title: string) => Promise<Note>;
  onOpenBoard: (scope: "organization" | "workspace", workspaceId?: string) => void;
  onStartCall: (scope: "organization" | "workspace", workspaceId?: string) => void;
  loading: boolean;
}) {
  const desktop = useDesktop();
  const actions = useDesktopActions();

  /** Which workspace the panel has drilled into, if any. */
  const [drilled, setDrilled] = useState<Workspace | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creatingWorkspaceBusy, setCreatingWorkspaceBusy] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [creatingNoteBusy, setCreatingNoteBusy] = useState(false);

  const kind = desktop.flyout;

  // Reset the drill-down whenever the panel closes or switches kind, so
  // reopening it never resumes inside a workspace the user has left behind.
  useEffect(() => {
    setDrilled(null);
    setNotes(null);
    setQuery("");
    setCreatingWorkspace(false);
    setCreatingNote(false);
  }, [kind]);

  // Leaving a workspace's notes level cancels an in-progress "new note" —
  // it belongs to the workspace being drilled into, not the panel overall.
  useEffect(() => {
    setCreatingNote(false);
  }, [drilled]);

  async function handleCreateWorkspace(ownerName: string) {
    setCreatingWorkspaceBusy(true);
    try {
      await createWorkspace(ownerName);
      setCreatingWorkspace(false);
    } catch {
      // Left open so the user can retry with the same typed name.
    } finally {
      setCreatingWorkspaceBusy(false);
    }
  }

  async function handleCreateNote(title: string) {
    if (!drilled) return;
    setCreatingNoteBusy(true);
    try {
      const note = await createNote(drilled.id, title);
      setNotes((prev) => [note, ...(prev ?? [])]);
      setCreatingNote(false);
    } catch {
      // Left open so the user can retry with the same typed title.
    } finally {
      setCreatingNoteBusy(false);
    }
  }

  useEffect(() => {
    if (!drilled) return;
    let cancelled = false;
    setNotesLoading(true);

    loadNotes(drilled.id).then((result) => {
      if (cancelled) return;
      setNotes(result);
      setNotesLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [drilled, loadNotes]);

  // Escape backs out one level, then closes — the same shape as a browser's
  // back button rather than always dismissing the whole panel.
  useEffect(() => {
    if (!kind) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (drilled) setDrilled(null);
      else actions.closeFlyout();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kind, drilled, actions]);

  const filteredWorkspaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((w) => w.owner_name.toLowerCase().includes(q));
  }, [workspaces, query]);

  const filteredChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((c) => c.name.toLowerCase().includes(q));
  }, [channels, query]);

  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => (n.title || "Untitled").toLowerCase().includes(q));
  }, [notes, query]);

  if (!kind) return null;

  const title = drilled
    ? drilled.owner_name
    : kind === "workspaces"
      ? "Workspaces"
      : kind === "chats"
        ? "Channels"
        : kind === "boards"
          ? "Whiteboards"
          : "Voice calls";

  return (
    <>
      {/* Click-away. Transparent rather than dimmed: a flyout is a lightweight
          picker, and dimming the desktop behind it would overstate it. */}
      <button
        type="button"
        aria-label="Close panel"
        onClick={() => actions.closeFlyout()}
        className="fixed inset-0 z-[8800] cursor-default"
      />

      <aside
        aria-label={title}
        className={cn(
          // Height follows the content and only caps out on long lists, so a
          // panel with five workspaces is a small panel rather than a column
          // that runs to the bottom of the screen while the dock sits centred.
          // top offset mirrors the dock's own — see the comment there.
          "fixed left-[88px] top-[calc(50%_+_var(--titlebar-h)/2)] z-[8900] flex max-h-[min(560px,78vh)] w-[278px] -translate-y-1/2 flex-col",
          "overflow-hidden rounded-[13px] border-[2.5px] border-black bg-white",
          "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
          "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.9)]",
          // Not animate-pop-in: that animates `transform: scale(...)` on this
          // same element, which would replace the -translate-y-1/2 above for
          // the animation's duration and drop the vertical centring — see the
          // comment on chat-pop-in-centered-y in globals.css.
          "animate-pop-in-centered-y",
        )}
      >
        <header className="flex h-10 shrink-0 items-center gap-2 border-b-[2px] border-black/12 px-3 dark:border-[#EDE7DD]/12">
          {drilled && (
            <button
              type="button"
              onClick={() => setDrilled(null)}
              aria-label="Back to workspaces"
              className={cn(
                "-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px]",
                "text-black/50 transition-colors hover:bg-black/[0.06] hover:text-black",
                "dark:text-[#EDE7DD]/50 dark:hover:bg-[#EDE7DD]/10 dark:hover:text-[#EDE7DD]",
              )}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.75} />
            </button>
          )}
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-[-0.02em] text-black dark:text-[#EDE7DD]">
            {title}
          </h2>
          {!drilled && (
            <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-black/30 dark:text-[#EDE7DD]/30">
              {kind === "workspaces"
                ? workspaces.length
                : kind === "chats"
                  ? channels.length
                  : kind === "boards"
                    ? boards.length
                    : rooms.length}
            </span>
          )}
        </header>

        <div className="shrink-0 px-2.5 pb-1 pt-2">
          <div
            className={cn(
              "flex items-center gap-2 rounded-[8px] bg-black/[0.045] px-2.5 py-[7px]",
              "ring-1 ring-inset ring-transparent transition-[background-color,box-shadow]",
              "focus-within:bg-transparent focus-within:ring-black/60",
              "dark:bg-[#EDE7DD]/[0.07] dark:focus-within:ring-[#EDE7DD]/60",
            )}
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-black/35 dark:text-[#EDE7DD]/35" strokeWidth={2.5} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                drilled
                  ? "Filter notes"
                  : kind === "workspaces"
                    ? "Filter workspaces"
                    : kind === "chats"
                      ? "Filter channels"
                      : kind === "boards"
                        ? "Filter boards"
                        : "Filter calls"
              }
              aria-label="Filter"
              className="min-w-0 flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:text-black/30 dark:text-[#EDE7DD] dark:placeholder:text-[#EDE7DD]/30"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 pt-1 os-scroll">
          {loading ? (
            <SkeletonRows />
          ) : drilled ? (
            <NotesLevel
              workspace={drilled}
              notes={filteredNotes}
              loading={notesLoading}
              creating={creatingNote}
              creatingBusy={creatingNoteBusy}
              onStartCreate={() => setCreatingNote(true)}
              onCommitCreate={handleCreateNote}
              onCancelCreate={() => setCreatingNote(false)}
              onOpenNote={(note) =>
                actions.open({
                  kind: "note",
                  title: note.title || "Untitled",
                  payload: { noteId: note.id, workspaceId: drilled.id, workspaceName: drilled.owner_name },
                  dedupeKey: `note:${note.id}`,
                })
              }
              onOpenWorkspace={() =>
                actions.open({
                  kind: "workspace",
                  title: drilled.owner_name,
                  payload: { workspaceId: drilled.id },
                  dedupeKey: `workspace:${drilled.id}`,
                })
              }
            />
          ) : kind === "workspaces" ? (
            <WorkspacesLevel
              folders={folders}
              workspaces={filteredWorkspaces}
              onDrill={setDrilled}
              creating={creatingWorkspace}
              creatingBusy={creatingWorkspaceBusy}
              onStartCreate={() => setCreatingWorkspace(true)}
              onCommitCreate={handleCreateWorkspace}
              onCancelCreate={() => setCreatingWorkspace(false)}
            />
          ) : kind === "boards" ? (
            <BoardsLevel boards={boards} workspaces={workspaces} onOpenBoard={onOpenBoard} />
          ) : kind === "calls" ? (
            <CallsLevel rooms={rooms} workspaces={workspaces} onStartCall={onStartCall} />
          ) : (
            <ChannelsLevel
              channels={filteredChannels}
              workspaces={workspaces}
              onOpenChannel={(channel) =>
                actions.open({
                  kind: "chat",
                  title: `# ${channel.name}`,
                  payload: { channelId: channel.id, channelName: channel.name },
                  dedupeKey: `chat:${channel.id}`,
                })
              }
            />
          )}
        </div>
      </aside>
    </>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 p-1" aria-hidden="true">
      {["w-[80%]", "w-[64%]", "w-[72%]", "w-[55%]"].map((w, i) => (
        <div
          key={w}
          className={cn("h-7 rounded-[6px] bg-black/[0.07] animate-skeleton dark:bg-[#EDE7DD]/[0.07]", w)}
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

/** UX cap for names typed in the flyout — 80 chars matches the DB CHECK on
 * board and channel names; workspace and note titles have no DB-side limit,
 * but the same cap keeps this one field's behaviour uniform regardless of
 * what it's naming. */
const NAME_MAX = 80;

/**
 * Inline "new <thing>" field, generic over what it's naming.
 *
 * Commits on Enter or blur, dismisses on Escape — as cheap to use as a prompt()
 * while being stylable and able to show its own validation.
 */
function InlineNameField({
  icon: Icon = PenTool,
  placeholder = "Board name",
  onCommit,
  onCancel,
  busy,
}: {
  icon?: LucideIcon;
  placeholder?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    const name = value.trim();
    if (!name) {
      onCancel();
      return;
    }
    onCommit(name.slice(0, NAME_MAX));
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-black/[0.05] dark:bg-[#EDE7DD]/[0.08]">
        <Icon className="h-3.5 w-3.5 text-black/35 dark:text-[#EDE7DD]/35" strokeWidth={2.5} />
      </span>
      <input
        ref={inputRef}
        value={value}
        disabled={busy}
        maxLength={NAME_MAX}
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
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "min-w-0 flex-1 rounded-[6px] bg-black/[0.045] px-2 py-1 text-[12px] font-medium outline-none",
          "text-black placeholder:text-black/30 ring-1 ring-inset ring-transparent focus:ring-black/50",
          "dark:bg-[#EDE7DD]/[0.07] dark:text-[#EDE7DD] dark:placeholder:text-[#EDE7DD]/30 dark:focus:ring-[#EDE7DD]/50",
        )}
      />
    </div>
  );
}

const ROW = cn(
  "group flex w-full items-center gap-2.5 rounded-[8px] px-2 py-2 text-left",
  "transition-colors duration-150 hover:bg-black/[0.055] dark:hover:bg-[#EDE7DD]/[0.08]",
);

/** The row that turns into an InlineNameField once clicked. */
function NewRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(ROW, "mb-1")}>
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-[#FBBF24] ring-1 ring-inset ring-black/15">
        <Plus className="h-3.5 w-3.5 text-black" strokeWidth={3} />
      </span>
      <span className="text-[12.5px] font-bold text-black dark:text-[#EDE7DD]">{label}</span>
    </button>
  );
}

/**
 * Palette for workspaces whose stored colour is missing or white.
 *
 * A white swatch on a white panel reads as an empty checkbox rather than as a
 * colour, so anything too light to see falls back to a deterministic tint from
 * this set — the same id always gets the same colour.
 */
const SWATCH_FALLBACK = ["#E8B4B8", "#8FB8AC", "#C3A6D8", "#E0A458", "#7FA5C4", "#B8C48F"];

function swatchFor(id: string, stored: string | null | undefined) {
  const value = (stored ?? "").trim().toLowerCase();
  const tooLight = !value || value === "#fff" || value === "#ffffff" || value === "white" || value === "transparent";
  if (!tooLight) return value;

  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return SWATCH_FALLBACK[hash % SWATCH_FALLBACK.length];
}

/** Level 1 for workspaces: folders as headings, workspaces as rows. */
function WorkspacesLevel({
  folders,
  workspaces,
  onDrill,
  creating,
  creatingBusy,
  onStartCreate,
  onCommitCreate,
  onCancelCreate,
}: {
  folders: Folder[];
  workspaces: Workspace[];
  onDrill: (workspace: Workspace) => void;
  creating: boolean;
  creatingBusy: boolean;
  onStartCreate: () => void;
  onCommitCreate: (name: string) => void;
  onCancelCreate: () => void;
}) {
  const unfiled = workspaces.filter((w) => !w.folder_id);

  return (
    <div className="space-y-0.5">
      {creating ? (
        <InlineNameField
          icon={Layers}
          placeholder="Workspace name"
          onCommit={onCommitCreate}
          onCancel={onCancelCreate}
          busy={creatingBusy}
        />
      ) : (
        <NewRow label="New workspace" onClick={onStartCreate} />
      )}

      {workspaces.length === 0 && <Empty label="No workspaces yet" />}

      {folders.map((folder) => {
        const inFolder = workspaces.filter((w) => w.folder_id === folder.id);
        if (inFolder.length === 0) return null;
        return (
          <div key={folder.id}>
            <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-[0.1em] text-black/32 dark:text-[#EDE7DD]/32">
              <FolderIcon className="h-3 w-3" strokeWidth={2.5} />
              {folder.name}
            </p>
            {inFolder.map((w) => (
              <WorkspaceRow key={w.id} workspace={w} onDrill={onDrill} />
            ))}
          </div>
        );
      })}

      {unfiled.length > 0 && (
        <div>
          {folders.length > 0 && (
            <p className="px-2.5 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-[0.1em] text-black/32 dark:text-[#EDE7DD]/32">
              Unfiled
            </p>
          )}
          {unfiled.map((w) => (
            <WorkspaceRow key={w.id} workspace={w} onDrill={onDrill} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceRow({ workspace, onDrill }: { workspace: Workspace; onDrill: (w: Workspace) => void }) {
  const colour = swatchFor(workspace.id, workspace.color);

  return (
    <button type="button" onClick={() => onDrill(workspace)} className={ROW}>
      {/* A filled rounded square rather than a bordered box: the border made
          light workspace colours read as an unchecked checkbox. */}
      <span
        className="h-[22px] w-[22px] shrink-0 rounded-[6px] ring-1 ring-inset ring-black/15 dark:ring-[#EDE7DD]/15"
        style={{ background: colour }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-black dark:text-[#EDE7DD]">
        {workspace.owner_name}
      </span>
      <ChevronRight
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-black/20 transition-transform duration-150",
          "group-hover:translate-x-0.5 group-hover:text-black/55",
          "dark:text-[#EDE7DD]/20 dark:group-hover:text-[#EDE7DD]/55",
        )}
        strokeWidth={2.5}
      />
    </button>
  );
}

/** Level 2: one workspace's notes. */
function NotesLevel({
  workspace,
  notes,
  loading,
  creating,
  creatingBusy,
  onStartCreate,
  onCommitCreate,
  onCancelCreate,
  onOpenNote,
  onOpenWorkspace,
}: {
  workspace: Workspace;
  notes: Note[];
  loading: boolean;
  creating: boolean;
  creatingBusy: boolean;
  onStartCreate: () => void;
  onCommitCreate: (title: string) => void;
  onCancelCreate: () => void;
  onOpenNote: (note: Note) => void;
  onOpenWorkspace: () => void;
}) {
  return (
    <div className="space-y-0.5">
      {/* Opening the workspace itself stays available — drilling in to reach a
          note should not hide the workspace overview. */}
      <button type="button" onClick={onOpenWorkspace} className={cn(ROW, "mb-1")}>
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-[#FBBF24] ring-1 ring-inset ring-black/15">
          <Layers className="h-3.5 w-3.5 text-black" strokeWidth={2.5} />
        </span>
        <span className="text-[12.5px] font-bold text-black dark:text-[#EDE7DD]">Open workspace</span>
      </button>

      {creating ? (
        <InlineNameField
          icon={FileText}
          placeholder="Note title"
          onCommit={onCommitCreate}
          onCancel={onCancelCreate}
          busy={creatingBusy}
        />
      ) : (
        <NewRow label="New note" onClick={onStartCreate} />
      )}

      <div className="mx-2 mb-1 h-px bg-black/10 dark:bg-[#EDE7DD]/10" />

      {loading ? (
        <SkeletonRows />
      ) : notes.length === 0 ? (
        <Empty label="No notes here yet" />
      ) : (
        notes.map((note) => (
          <button key={note.id} type="button" onClick={() => onOpenNote(note)} className={ROW}>
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-black/[0.05] dark:bg-[#EDE7DD]/[0.08]">
              <FileText className="h-3.5 w-3.5 text-black/45 dark:text-[#EDE7DD]/45" strokeWidth={2.5} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-black dark:text-[#EDE7DD]">
              {note.title || "Untitled"}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

/** Chats: org channels first, then channels grouped by their workspace. */
function ChannelsLevel({
  channels,
  workspaces,
  onOpenChannel,
}: {
  channels: Channel[];
  workspaces: Workspace[];
  onOpenChannel: (channel: Channel) => void;
}) {
  const org = channels.filter((c) => c.scope === "organization");
  const byWorkspace = workspaces
    .map((w) => ({ workspace: w, list: channels.filter((c) => c.workspace_id === w.id) }))
    .filter((group) => group.list.length > 0);

  if (channels.length === 0) return <Empty label="No channels yet" />;

  const row = (channel: Channel) => (
    <button key={channel.id} type="button" onClick={() => onOpenChannel(channel)} className={ROW}>
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-black/[0.05] dark:bg-[#EDE7DD]/[0.08]">
        <Hash className="h-3.5 w-3.5 text-black/45 dark:text-[#EDE7DD]/45" strokeWidth={2.75} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-black dark:text-[#EDE7DD]">
        {channel.name}
      </span>
    </button>
  );

  return (
    <div className="space-y-0.5">
      {org.length > 0 && (
        <>
          <p className="px-2.5 pb-1 pt-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-black/32 dark:text-[#EDE7DD]/32">
            Organization
          </p>
          {org.map(row)}
        </>
      )}

      {byWorkspace.map((group) => (
        <div key={group.workspace.id}>
          <p className="px-2.5 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-[0.1em] text-black/32 dark:text-[#EDE7DD]/32">
            {group.workspace.owner_name}
          </p>
          {group.list.map(row)}
        </div>
      ))}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="px-2 py-6 text-center text-[11.5px] italic text-black/30 dark:text-[#EDE7DD]/30">{label}</p>;
}

/**
 * Whiteboards.
 *
 * A picker of *containers*, not of boards: there is exactly one organisation
 * board and one board per workspace, so the choice is "which board" in the
 * sense of "whose", never "which of several". That is why there is no create
 * action here — opening a container's board makes it if it does not exist yet.
 */
function BoardsLevel({
  boards,
  workspaces,
  onOpenBoard,
}: {
  boards: Board[];
  workspaces: Workspace[];
  onOpenBoard: (scope: "organization" | "workspace", workspaceId?: string) => void;
}) {
  const orgBoard = boards.find((b) => b.scope === "organization");

  const row = (label: string, hasContent: boolean, onClick: () => void, key: string) => (
    <button key={key} type="button" onClick={onClick} className={ROW}>
      <span
        className={cn(
          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px]",
          hasContent ? "bg-[#FBBF24]" : "bg-black/[0.05] dark:bg-[#EDE7DD]/[0.08]",
        )}
      >
        <PenTool
          className={cn("h-3.5 w-3.5", hasContent ? "text-black" : "text-black/45 dark:text-[#EDE7DD]/45")}
          strokeWidth={2.5}
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-black dark:text-[#EDE7DD]">{label}</span>
    </button>
  );

  return (
    <div className="space-y-0.5">
      <p className="px-2.5 pb-1 pt-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-black/32 dark:text-[#EDE7DD]/32">
        Organization
      </p>
      {row("Organization board", Boolean(orgBoard), () => onOpenBoard("organization"), "org-board")}

      {workspaces.length > 0 && (
        <p className="px-2.5 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-[0.1em] text-black/32 dark:text-[#EDE7DD]/32">
          Workspaces
        </p>
      )}
      {workspaces.map((workspace) => {
        const existing = boards.find((b) => b.workspace_id === workspace.id);
        return row(workspace.owner_name, Boolean(existing), () => onOpenBoard("workspace", workspace.id), workspace.id);
      })}
    </div>
  );
}

/**
 * Voice calls.
 *
 * Shows a live indicator for any room already running and a "start" row for
 * every container that has none — the two are visually distinct because
 * joining an existing call and starting a new one feel different, even though
 * the API call behind them is the same idempotent POST.
 */
function CallsLevel({
  rooms,
  workspaces,
  onStartCall,
}: {
  rooms: VoiceRoom[];
  workspaces: Workspace[];
  onStartCall: (scope: "organization" | "workspace", workspaceId?: string) => void;
}) {
  const orgRoom = rooms.find((r) => r.scope === "organization");

  const row = (label: string, live: boolean, onClick: () => void, key: string) => (
    <button key={key} type="button" onClick={onClick} className={ROW}>
      <span
        className={cn(
          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px]",
          live ? "bg-[#8FB8AC]" : "bg-black/[0.05] dark:bg-[#EDE7DD]/[0.08]",
        )}
      >
        {live ? (
          <Radio className="h-3.5 w-3.5 text-black" strokeWidth={2.5} />
        ) : (
          <Phone className="h-3.5 w-3.5 text-black/45 dark:text-[#EDE7DD]/45" strokeWidth={2.5} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-black dark:text-[#EDE7DD]">{label}</span>
      {live && (
        <span className="flex shrink-0 items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#5E8378]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8FB8AC]" />
          Live
        </span>
      )}
    </button>
  );

  return (
    <div className="space-y-0.5">
      <p className="px-2.5 pb-1 pt-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-black/32 dark:text-[#EDE7DD]/32">
        Organization
      </p>
      {row(
        orgRoom ? "Join organization call" : "Start organization call",
        Boolean(orgRoom),
        () => onStartCall("organization"),
        "org-call",
      )}

      {workspaces.length > 0 && (
        <p className="px-2.5 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-[0.1em] text-black/32 dark:text-[#EDE7DD]/32">
          Workspaces
        </p>
      )}
      {workspaces.map((workspace) => {
        const live = rooms.find((r) => r.workspace_id === workspace.id);
        return row(workspace.owner_name, Boolean(live), () => onStartCall("workspace", workspace.id), workspace.id);
      })}
    </div>
  );
}
