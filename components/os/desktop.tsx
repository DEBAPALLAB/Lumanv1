"use client";

import type { AuthorDirectory } from "@/components/messaging/message-list";
import { useBaseLayout } from "@/lib/os/use-base-layout";
import { useOrgData } from "@/lib/os/use-org-data";
import { useDesktop, useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import type { Candidate } from "@/lib/voice/resolve";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dock } from "./dock";
import { Flyout } from "./flyout";
import { MinimizedBlobs } from "./minimized-blobs";
import { ProfileBadge } from "./profile-badge";
import { Spotlight, type SpotlightItem } from "./spotlight";
import { VoiceAgent, type VoiceAgentContext } from "./voice-agent";
import { VoiceHud } from "./voice-hud";
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
  const [agentOpen, setAgentOpen] = useState(false);
  const [directory, setDirectory] = useState<AuthorDirectory>({});
  const { setTheme } = useTheme();

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
    createWorkspace,
    deleteWorkspace,
    createNote,
    deleteNote,
    refreshBoards,
    refreshRooms,
    onRoomOpened,
    loading,
    error,
  } = useOrgData();

  // First-ever visit only: opens Tasks, Calendar, the org channel and the
  // user's first workspace so the desktop isn't a blank room. No-ops on
  // every visit after, including ones where the user closed everything.
  useBaseLayout({ userId, workspaces, channels, loading });

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
  // binding people already expect; Cmd+D shows the desktop; Cmd+J starts
  // talking to the agent. J because K and D are taken and it sits under the
  // same hand — the agent has to be one keystroke away or people click instead.
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
      if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAgentOpen((open) => !open);
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
    () => ({
      orgId,
      orgSlug,
      userId,
      directory,
      workspaces,
      loadNotes,
      createWorkspace,
      deleteWorkspace,
      createNote,
      deleteNote,
      displayName,
      identity,
    }),
    [
      orgId,
      orgSlug,
      userId,
      directory,
      workspaces,
      loadNotes,
      createWorkspace,
      deleteWorkspace,
      createNote,
      deleteNote,
      displayName,
      identity,
    ],
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

  const callLabel = useCallback(
    (scope: "organization" | "workspace", workspaceId?: string | null) =>
      scope === "organization"
        ? "Organization call"
        : `${workspaces.find((w) => w.id === workspaceId)?.owner_name ?? "Workspace"} call`,
    [workspaces],
  );

  /** Opens the voice window for an already-open room. */
  const openCallWindow = useCallback(
    (roomId: string, scope: "organization" | "workspace", workspaceId?: string | null) => {
      const label = callLabel(scope, workspaceId);
      actions.open({
        kind: "voice",
        title: label,
        payload: { roomId, scopeLabel: label },
        dedupeKey: `voice:${roomId}`,
      });
    },
    [actions, callLabel],
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
      openCallWindow(room.id, scope, workspaceId);
    },
    [orgId, refreshRooms, openCallWindow],
  );

  // Someone else starting a call anywhere in the org shows up here in real
  // time — the flyout's live indicator alone is easy to miss since it is not
  // open by default. Skipped for calls the current user just started, since
  // startCall above already opens the window for that case.
  useEffect(() => {
    onRoomOpened((room) => {
      if (room.started_by && room.started_by === userId) return;

      const label = callLabel(room.scope, room.workspace_id);
      toast(`${label} started`, {
        description: "Someone started a voice call.",
        action: {
          label: "Join",
          onClick: () => openCallWindow(room.id, room.scope, room.workspace_id),
        },
        duration: 15_000,
      });
    });
  }, [onRoomOpened, callLabel, openCallWindow, userId]);

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

  /**
   * Everything the voice agent can address, derived from the same index the
   * palette searches.
   *
   * Reusing spotlightItems rather than building a second list is deliberate:
   * two independently maintained indexes would drift, and then the agent would
   * be unable to open something the palette can find, for no reason a user
   * could ever guess. "Searchable" and "sayable" should mean the same thing.
   *
   * The `search` kind is dropped — it is a palette affordance, not an object.
   */
  const agentCandidates: Candidate[] = useMemo(
    () =>
      spotlightItems
        .filter((item) => item.kind !== "search" && item.kind !== "media")
        .map((item) => ({
          id: item.id,
          title: item.title,
          target: item.kind as Candidate["target"],
          payload: item.payload,
          hint: item.hint,
        })),
    [spotlightItems],
  );

  /**
   * The desktop as the model sees it.
   *
   * Titles and ids only — never note contents. The agent needs to know that a
   * note called "Q3 Roadmap" exists in order to open it; it has no reason to
   * know what is inside, and sending bodies would mean shipping the user's
   * writing to a model on every spoken command.
   */
  const agentSnapshot = useMemo(() => {
    const grouped: Record<string, { id: string; title: string; hint?: string }[]> = {};
    for (const candidate of agentCandidates) {
      if (!grouped[candidate.target]) grouped[candidate.target] = [];
      grouped[candidate.target].push({
        id: candidate.id,
        title: candidate.title,
        hint: candidate.hint,
      });
    }
    return grouped;
  }, [agentCandidates]);

  /**
   * Read through a ref rather than passed as a value.
   *
   * The agent asks for context at the moment it runs a plan, not at the moment
   * it rendered. A command spoken now must act on the windows that are open
   * now — capturing the list at render time would close a window that was
   * already gone, or miss one opened by the previous sentence in the same breath.
   */
  const agentContextRef = useRef<VoiceAgentContext>(null as unknown as VoiceAgentContext);
  agentContextRef.current = {
    candidates: agentCandidates,
    snapshot: agentSnapshot,
    openWindows: desktop.windows.map((w) => ({ id: w.id, kind: w.kind, title: w.title })),
    createNote,
    deleteNote,
    defaultWorkspaceId: workspaces[0]?.id ?? null,
    openSearch: () => setSpotlightOpen(true),
    setTheme,
  };

  const getAgentContext = useCallback(() => agentContextRef.current, []);

  const visible = desktop.windows.filter((w) => !w.minimized);

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#FDFBF7] px-6 dark:bg-[#171512]">
        <p className="text-[14px] font-bold text-black dark:text-[#EDE7DD]">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#FDFBF7] dark:bg-[#171512]">
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
            <p className="text-[15px] font-bold tracking-[-0.02em] text-black/45 dark:text-[#EDE7DD]/40">
              Your desktop is empty
            </p>
            <p className="mt-1.5 text-[12.5px] text-black/35 dark:text-[#EDE7DD]/30">
              Open a workspace from the dock, or press{" "}
              <kbd className="rounded-[4px] border-[1.5px] border-black/25 px-1.5 py-0.5 font-mono text-[11px] font-semibold dark:border-[#EDE7DD]/25">
                ⌘K
              </kbd>{" "}
              to search.
            </p>
            <p className="mt-2 text-[11.5px] text-black/30 dark:text-[#EDE7DD]/25">
              Hold{" "}
              <kbd className="rounded-[4px] border-[1.5px] border-black/25 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold dark:border-[#EDE7DD]/25">
                Ctrl + Space
              </kbd>{" "}
              to talk directly to the agent.
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

      <Dock
        onSpotlight={() => setSpotlightOpen(true)}
        onVoiceAgent={() => setAgentOpen((open) => !open)}
        agentActive={agentOpen}
      />

      <Flyout
        workspaces={workspaces}
        folders={folders}
        channels={channels}
        boards={boards}
        rooms={rooms}
        loadNotes={loadNotes}
        createWorkspace={createWorkspace}
        deleteWorkspace={deleteWorkspace}
        createNote={createNote}
        deleteNote={deleteNote}
        onOpenBoard={(scope, workspaceId) => void openBoard(scope, workspaceId)}
        onStartCall={(scope, workspaceId) => void startCall(scope, workspaceId)}
        loading={loading}
      />

      <Spotlight open={spotlightOpen} items={spotlightItems} onClose={() => setSpotlightOpen(false)} />

      <VoiceAgent open={agentOpen} onClose={() => setAgentOpen(false)} context={getAgentContext} />
      <VoiceHud context={getAgentContext} enabled={!agentOpen} />
    </div>
  );
}
