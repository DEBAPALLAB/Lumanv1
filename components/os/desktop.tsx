"use client";

import type { AuthorDirectory } from "@/components/messaging/message-list";
import { useOrgData } from "@/lib/os/use-org-data";
import { useDesktop, useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dock } from "./dock";
import { Flyout } from "./flyout";
import { MinimizedBlobs } from "./minimized-blobs";
import { ProfileBadge } from "./profile-badge";
import { Spotlight, type SpotlightItem } from "./spotlight";
import { WindowFrame } from "./window-frame";
import { type DesktopContext, renderWindow } from "./window-registry";

/**
 * The desktop: wallpaper, dock, flyout, spotlight, and every open window.
 *
 * Owns exactly three things — the wallpaper, the global shortcuts, and the
 * stacking context windows live in. It also resolves the organisation once and
 * hands it to every window, which is what keeps opening five windows from
 * costing five copies of the same three requests.
 */
export function Desktop() {
  const desktop = useDesktop();
  const actions = useDesktopActions();
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [directory, setDirectory] = useState<AuthorDirectory>({});

  const {
    orgId,
    orgSlug,
    userId,
    identity,
    workspaces,
    folders,
    channels,
    boards,
    rooms,
    notesByWorkspace,
    loadNotes,
    refreshBoards,
    refreshRooms,
    loading,
    error,
  } = useOrgData();

  // The member directory backs both author names in chat and mention
  // autocomplete. Fetched once for the desktop rather than per chat window.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    (async () => {
      const res = await fetch(`/api/organization/members?orgId=${orgId}`);
      if (!res.ok) return;
      const members = (await res.json()) as { user_id: string; full_name?: string; email?: string }[];
      if (cancelled) return;

      const next: AuthorDirectory = {};
      for (const member of members) {
        next[member.user_id] = { name: member.full_name ?? "", email: member.email ?? "" };
      }
      setDirectory(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Global shortcuts. Cmd/Ctrl+K opens search from anywhere, which is the one
  // binding people already expect; Cmd+D shows the desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlightOpen((open) => !open);
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        actions.minimizeAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  // The caller's own display name, for their chip in a voice room.
  const displayName = useMemo(() => {
    const me = userId ? directory[userId] : undefined;
    if (me?.name && me.name !== "Unknown") return me.name;
    return me?.email?.split("@")[0] ?? "You";
  }, [directory, userId]);

  const ctx: DesktopContext = useMemo(
    () => ({ orgId, orgSlug, userId, directory, workspaces, loadNotes, displayName }),
    [orgId, orgSlug, userId, directory, workspaces, loadNotes, displayName],
  );

  /**
   * Opens a container's board, creating it on first open.
   *
   * There is one board per organisation and one per workspace, so this is
   * always "open that board" rather than "make a new one" — the POST is a
   * get-or-create and the database refuses a second row either way.
   */
  const openBoard = useCallback(
    async (scope: "organization" | "workspace", workspaceId?: string) => {
      if (!orgId) return;
      const res = await fetch("/api/whiteboards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, organizationId: orgId, workspaceId }),
      });
      if (!res.ok) return;

      const board = (await res.json()) as { id: string };
      await refreshBoards();

      const label =
        scope === "organization"
          ? "Organization board"
          : `${workspaces.find((w) => w.id === workspaceId)?.owner_name ?? "Workspace"} board`;

      actions.open({
        kind: "whiteboard",
        title: label,
        payload: { boardId: board.id, boardName: label },
        dedupeKey: `whiteboard:${board.id}`,
      });
    },
    [orgId, refreshBoards, workspaces, actions],
  );

  /** Opens or joins the call for a container. The POST is idempotent, so this
   *  is the same action whether or not a call is already running. */
  const startCall = useCallback(
    async (scope: "organization" | "workspace", workspaceId?: string) => {
      if (!orgId) return;
      const res = await fetch("/api/voice/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, organizationId: orgId, workspaceId }),
      });
      if (!res.ok) return;

      const room = (await res.json()) as { id: string };
      await refreshRooms();

      const label =
        scope === "organization"
          ? "Organization call"
          : `${workspaces.find((w) => w.id === workspaceId)?.owner_name ?? "Workspace"} call`;

      actions.open({
        kind: "voice",
        title: label,
        payload: { roomId: room.id, scopeLabel: label },
        dedupeKey: `voice:${room.id}`,
      });
    },
    [orgId, refreshRooms, workspaces, actions],
  );

  // The voice window asks to be closed when its hang-up button is pressed —
  // it cannot close itself without reaching into the store from inside a
  // renderer, which would couple the two.
  useEffect(() => {
    const onClose = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id) actions.close(id);
    };
    window.addEventListener("luman:close-window", onClose);
    return () => window.removeEventListener("luman:close-window", onClose);
  }, [actions]);

  // Spotlight searches whatever the desktop already knows: every workspace,
  // every channel, and the notes of any workspace that has been opened. Notes
  // from unvisited workspaces are not in memory yet, which is why the flyout
  // remains the complete index and this is the fast path.
  const spotlightItems: SpotlightItem[] = useMemo(() => {
    const items: SpotlightItem[] = [];

    for (const note of Object.values(notesByWorkspace).flat()) {
      const workspace = workspaces.find((w) => w.id === note.workspace_id);
      items.push({
        id: `note:${note.id}`,
        title: note.title || "Untitled",
        hint: workspace?.owner_name,
        section: "Notes",
        kind: "note",
        payload: { noteId: note.id, workspaceId: note.workspace_id, workspaceName: workspace?.owner_name },
      });
    }

    for (const channel of channels) {
      items.push({
        id: `chat:${channel.id}`,
        title: `# ${channel.name}`,
        section: "Channels",
        kind: "chat",
        payload: { channelId: channel.id, channelName: channel.name },
      });
    }

    for (const workspace of workspaces) {
      items.push({
        id: `workspace:${workspace.id}`,
        title: workspace.owner_name,
        section: "Workspaces",
        kind: "workspace",
        payload: { workspaceId: workspace.id },
      });
    }

    // Boards are addressed by container, so the palette lists the containers
    // that already have one rather than board names people never chose.
    for (const board of boards) {
      const workspace = workspaces.find((w) => w.id === board.workspace_id);
      const label =
        board.scope === "organization" ? "Organization board" : `${workspace?.owner_name ?? "Workspace"} board`;
      items.push({
        id: `whiteboard:${board.id}`,
        title: label,
        section: "Whiteboards",
        kind: "whiteboard",
        payload: { boardId: board.id, boardName: label },
      });
    }

    items.push({ id: "tasks:mine", title: "My tasks", section: "Apps", kind: "tasks" });
    items.push({ id: "calendar:org", title: "Calendar", section: "Apps", kind: "calendar" });

    return items;
  }, [notesByWorkspace, workspaces, channels, boards]);

  const visible = desktop.windows.filter((w) => !w.minimized);

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#FDFBF7] px-6 dark:bg-zinc-950">
        <p className="text-[14px] font-bold text-black dark:text-stone-100">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#FDFBF7] dark:bg-zinc-950">
      {desktop.theme.grid && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 opacity-75 dark:opacity-[0.07]",
            "bg-[linear-gradient(to_right,#e5e2db_1px,transparent_1px),linear-gradient(to_bottom,#e5e2db_1px,transparent_1px)]",
            "bg-[size:40px_40px]",
            "dark:bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)]",
          )}
        />
      )}

      {desktop.windows.length === 0 && !loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[15px] font-bold tracking-[-0.02em] text-black/45 dark:text-stone-100/40">
              Your desktop is empty
            </p>
            <p className="mt-1.5 text-[12.5px] text-black/35 dark:text-stone-100/30">
              Open a workspace from the dock, or press{" "}
              <kbd className="rounded-[4px] border-[1.5px] border-black/25 px-1.5 py-0.5 font-mono text-[11px] font-semibold dark:border-stone-100/25">
                ⌘K
              </kbd>{" "}
              to search.
            </p>
          </div>
        </div>
      )}

      {visible.map((win) => (
        <WindowFrame key={win.id} window={win} focused={desktop.focusedId === win.id}>
          {renderWindow(win, ctx)}
        </WindowFrame>
      ))}

      <MinimizedBlobs />

      <ProfileBadge identity={identity} />

      <Dock onSpotlight={() => setSpotlightOpen(true)} />

      <Flyout
        workspaces={workspaces}
        folders={folders}
        channels={channels}
        boards={boards}
        rooms={rooms}
        loadNotes={loadNotes}
        onOpenBoard={(scope, workspaceId) => void openBoard(scope, workspaceId)}
        onStartCall={(scope, workspaceId) => void startCall(scope, workspaceId)}
        loading={loading}
      />

      <Spotlight open={spotlightOpen} items={spotlightItems} onClose={() => setSpotlightOpen(false)} />
    </div>
  );
}
