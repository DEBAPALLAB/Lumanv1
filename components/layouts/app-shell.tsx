"use client";

import { WorkspaceSidebar } from "@/components/dashboard/workspace-sidebar";
import { FloatingDock } from "@/components/ui/floating-dock";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isWorkspacesExpanded, setIsWorkspacesExpanded] = useState(true);
  const params = useParams();
  const workspaceId = typeof params?.workspaceId === "string" ? params.workspaceId : undefined;
  const noteId = typeof params?.noteId === "string" ? params.noteId : undefined;
  const isNotePage = Boolean(workspaceId && noteId);

  // Load workspaces expanded state from localStorage on client side
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("workspaces_expanded");
      if (stored === "false") {
        setIsWorkspacesExpanded(false);
      }
    }
  }, []);

  const handleToggleWorkspaces = () => {
    const nextState = !isWorkspacesExpanded;
    setIsWorkspacesExpanded(nextState);
    if (typeof window !== "undefined") {
      localStorage.setItem("workspaces_expanded", String(nextState));
    }
  };

  const sidebarWidthClass = !isWorkspacesExpanded
    ? "w-[84px]"
    : "w-full max-w-[344px] lg:w-[344px]";

  return (
    <div className="h-screen flex flex-col relative overflow-hidden bg-[#FDFBF7] dark:bg-zinc-950">
      {/* Floating Breadcrumb Dock (Replaces the top Navbar) */}
      <FloatingDock />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setSidebarOpen(false);
            }}
          />
        )}

        {/* Sidebar Container */}
        <div
          className={cn(
            "fixed lg:static inset-y-0 left-0 z-50 transform lg:transform-none transition-all duration-300 ease-out overflow-hidden shrink-0 bg-[#FDFBF7] dark:bg-zinc-950 border-r-[3px] border-black dark:border-stone-100",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
            sidebarWidthClass
          )}
        >
          <WorkspaceSidebar
            isWorkspacesExpanded={isWorkspacesExpanded}
            onToggleWorkspaces={handleToggleWorkspaces}
            isNotePage={isNotePage}
            isNotesCollapsedOnNotePage={!isWorkspacesExpanded}
          />
        </div>

        {/* Main Content Area */}
        <main
          className={cn(
            "flex-1 bg-background w-full",
            isNotePage ? "h-full overflow-hidden flex flex-col" : "overflow-y-auto"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
