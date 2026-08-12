"use client";

import { WorkspaceSidebar } from "@/components/dashboard/workspace-sidebar";
import { FloatingDock } from "@/components/ui/floating-dock";
import { cn } from "@/lib/utils";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Desktop-only replacement for AppShell.
 *
 * The web shell is h-screen/fixed-positioned against the viewport, which
 * breaks once a real titlebar (DesktopTitlebar) takes up layout space above
 * it — every fixed-to-viewport element needs re-deriving by hand. This shell
 * sizes the sidebar/content against its own flex-1 container (already
 * shrunk to fit below the titlebar by DesktopTitlebar). FloatingDock is
 * still fixed to the OS window (shared with web, unchanged), so it's offset
 * down by the titlebar's height here instead of being reimplemented.
 */
export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const [isWorkspacesExpanded, setIsWorkspacesExpanded] = useState(true);
  const params = useParams();
  const workspaceId = typeof params?.workspaceId === "string" ? params.workspaceId : undefined;
  const noteId = typeof params?.noteId === "string" ? params.noteId : undefined;
  const isNotePage = Boolean(workspaceId && noteId);

  useEffect(() => {
    const stored = localStorage.getItem("workspaces_expanded");
    if (stored === "false") setIsWorkspacesExpanded(false);
  }, []);

  const handleToggleWorkspaces = () => {
    const next = !isWorkspacesExpanded;
    setIsWorkspacesExpanded(next);
    localStorage.setItem("workspaces_expanded", String(next));
  };

  const sidebarWidthClass = !isWorkspacesExpanded ? "w-[84px]" : "w-[344px]";
  const sidebarWidthPx = isWorkspacesExpanded ? 344 : 84;

  return (
    <div className="flex h-full min-h-0 bg-background">
      {/* FloatingDock centers on left-1/2 of its fixed containing block (the
          whole window) by default. Re-centered here on the <main> pane alone
          — offset right by half the sidebar's width — so it doesn't skew
          left once a sidebar is in the picture. Inline style, not a
          Tailwind arbitrary class: the offset depends on runtime state
          (sidebar collapsed/expanded), which Tailwind's JIT can't see at
          build time from an interpolated class string. */}
      <FloatingDock
        className="top-[calc(2rem+1.5rem)] left-[var(--dock-left)]"
        style={{ "--dock-left": `calc(50% + ${sidebarWidthPx / 2}px)` } as React.CSSProperties}
      />

      <div
        className={cn(
          "flex h-full min-h-0 shrink-0 border-r border-border bg-background transition-[width] duration-300 ease-out",
          sidebarWidthClass,
        )}
      >
        <WorkspaceSidebar
          isWorkspacesExpanded={isWorkspacesExpanded}
          onToggleWorkspaces={handleToggleWorkspaces}
          isNotePage={isNotePage}
          isNotesCollapsedOnNotePage={!isWorkspacesExpanded}
        />
      </div>

      <main
        className={cn(
          "min-h-0 flex-1",
          isNotePage ? "flex flex-col overflow-hidden" : "overflow-y-auto scrollbar-thin",
        )}
      >
        {children}
      </main>
    </div>
  );
}
