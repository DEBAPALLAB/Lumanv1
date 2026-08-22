"use client";

import type { AuthorDirectory } from "@/components/messaging/message-list";
import type { Identity, Note, Workspace } from "@/lib/os/use-org-data";
import { type WindowState, useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import { FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { CalendarWindow } from "./windows/calendar-window";
import { ChatWindow } from "./windows/chat-window";
import { FilesWindow } from "./windows/files-window";
import { type MediaKind, MediaWindow } from "./windows/media-window";
import { NoteWindow } from "./windows/note-window";
import { SettingsWindow } from "./windows/settings-window";
import { TasksWindow } from "./windows/tasks-window";
import { VoiceWindow } from "./windows/voice-window";
import { WhiteboardWindow } from "./windows/whiteboard-window";
import { WorkspaceWindow } from "./windows/workspace-window";

/**
 * Everything a window might need from the desktop it lives on.
 *
 * Passed down rather than re-fetched per window: the org, the member directory
 * and the workspace list are the same for every window on screen, and having
 * each one resolve them independently is exactly what made the v1 pages hit
 * /api/auth/session eight times per navigation.
 */
export type DesktopContext = {
  orgId: string | null;
  orgSlug: string | null;
  userId: string | null;
  directory: AuthorDirectory;
  workspaces: Workspace[];
  loadNotes: (workspaceId: string) => Promise<Note[]>;
  createWorkspace: (ownerName: string, opts?: { color?: string; folderId?: string }) => Promise<Workspace>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  createNote: (workspaceId: string, title: string) => Promise<Note>;
  deleteNote: (workspaceId: string, noteId: string) => Promise<void>;
  /** The caller's own name, shown on their chip in a voice room. */
  displayName: string;
  identity: Identity;
};

/**
 * Maps a window kind to what renders inside it.
 *
 * The only place that knows about concrete window content, so the desktop, the
 * dock and the frame stay generic. Adding a kind means a branch here and an
 * icon in dock.tsx — nothing else changes.
 */
export function renderWindow(win: WindowState, ctx: DesktopContext) {
  const payload = win.payload ?? {};

  switch (win.kind) {
    case "note":
      return (
        <NoteWindow
          noteId={String(payload.noteId)}
          workspaceId={String(payload.workspaceId ?? "")}
          workspaceName={payload.workspaceName ? String(payload.workspaceName) : undefined}
          windowId={win.id}
          deleteNote={ctx.deleteNote}
        />
      );

    case "chat":
      return (
        <ChatWindow
          channelId={String(payload.channelId)}
          channelName={String(payload.channelName ?? win.title.replace(/^#\s*/, ""))}
          orgId={ctx.orgId}
          userId={ctx.userId}
          directory={ctx.directory}
        />
      );

    case "workspace": {
      const id = String(payload.workspaceId);
      return (
        <WorkspaceWindow
          workspaceId={id}
          workspace={ctx.workspaces.find((w) => w.id === id)}
          windowId={win.id}
          loadNotes={ctx.loadNotes}
          createNote={ctx.createNote}
          deleteNote={ctx.deleteNote}
          deleteWorkspace={ctx.deleteWorkspace}
        />
      );
    }

    case "whiteboard":
      return <WhiteboardWindow boardId={String(payload.boardId)} userId={ctx.userId} displayName={ctx.displayName} />;

    case "voice":
      return (
        <VoiceWindow
          roomId={String(payload.roomId)}
          scopeLabel={String(payload.scopeLabel ?? win.title)}
          userId={ctx.userId}
          displayName={ctx.displayName}
        />
      );

    case "tasks":
      return (
        <TasksWindow
          workspaces={ctx.workspaces}
          directory={ctx.directory}
          defaultWorkspaceId={payload.workspaceId ? String(payload.workspaceId) : undefined}
        />
      );

    case "calendar":
      return <CalendarWindow workspaces={ctx.workspaces} />;

    case "files":
      return <FilesWindow orgId={ctx.orgId} />;

    case "settings":
      return <SettingsWindow identity={ctx.identity} orgId={ctx.orgId} orgSlug={ctx.orgSlug} />;

    case "media":
      return (
        <MediaWindow
          url={String(payload.url)}
          name={String(payload.name ?? win.title)}
          kind={payload.kind as MediaKind}
          fileId={payload.fileId ? String(payload.fileId) : null}
          userId={ctx.userId}
          displayName={ctx.displayName}
        />
      );

    default:
      return (
        <div className="flex h-full items-center justify-center p-6">
          <p className="text-[12.5px] text-black/40 dark:text-[#EDE7DD]/40">{win.title}</p>
        </div>
      );
  }
}

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-black/30 dark:text-[#EDE7DD]/30" />
    </div>
  );
}
