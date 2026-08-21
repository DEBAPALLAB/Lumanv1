"use client";

import type { AuthorDirectory } from "@/components/messaging/message-list";
import type { Note, Workspace } from "@/lib/os/use-org-data";
import { type WindowState, useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import { FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { CalendarWindow } from "./windows/calendar-window";
import { ChatWindow } from "./windows/chat-window";
import { NoteWindow } from "./windows/note-window";
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
  createNote: (workspaceId: string, title: string) => Promise<Note>;
  deleteNote: (workspaceId: string, noteId: string) => Promise<void>;
  /** The caller's own name, shown on their chip in a voice room. */
  displayName: string;
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
          loadNotes={ctx.loadNotes}
          createNote={ctx.createNote}
          deleteNote={ctx.deleteNote}
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
      return <TasksWindow />;

    case "calendar":
      return <CalendarWindow />;

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
