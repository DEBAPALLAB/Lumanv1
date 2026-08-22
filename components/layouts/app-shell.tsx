"use client";

import { WorkspaceSidebar } from "@/components/dashboard/workspace-sidebar";
import DesktopShell from "@/components/layouts/desktop-shell";
import { FloatingDock } from "@/components/ui/floating-dock";
import { GodModeTransition } from "@/components/transitions/god-mode-transition";
import { createContext, useContext, useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Lets any page rendered inside AppShell trigger the same God Mode dissolve
 * the sidebar button uses, rather than each page wiring its own transition
 * instance — two independent overlays firing at once would double the dust.
 */
const GodModeContext = createContext<() => void>(() => {});
export const useGodMode = () => useContext(GodModeContext);

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isWorkspacesExpanded, setIsWorkspacesExpanded] = useState(true);
  const [godMode, setGodMode] = useState(false);
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org") || (typeof window !== "undefined" ? sessionStorage.getItem("selected_org_slug") : null);
  const workspaceId = typeof params?.workspaceId === "string" ? params.workspaceId : undefined;
  const noteId = typeof params?.noteId === "string" ? params.noteId : undefined;
  const isNotePage = Boolean(workspaceId && noteId);

  // Dissolves whatever page is currently mounted, then swaps to the v2
  // desktop — triggered from the sidebar's God Mode button on any page, or
  // from the dashboard's own button, so it lives here rather than in one page.
  function enterGodMode() {
    if (godMode) return;
    setGodMode(true);
  }

  function handleGodModeComplete() {
    sessionStorage.setItem("luman_god_mode_entry", "1");
    router.push(`/dashboard2${orgSlug ? `?org=${orgSlug}` : ""}`);
  }

  // Load workspaces expanded state from localStorage on client side
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("workspaces_expanded");
      if (stored === "false") {
        setIsWorkspacesExpanded(false);
      }
    }
  }, []);

  useEffect(() => {
    setIsDesktop(Boolean(window.electronAPI?.isDesktop));
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

  // The desktop shell has its own sizing model built around the titlebar's
  // real layout space — kept as a fully separate component rather than
  // branching inline here, so the web shell below never has to account for
  // it.
  if (isDesktop) {
    return <DesktopShell>{children}</DesktopShell>;
  }

  return (
    <div className="h-screen flex flex-col relative overflow-hidden bg-[#FDFBF7] dark:bg-zinc-950">
      <GodModeTransition active={godMode} onComplete={handleGodModeComplete} />

      <div className={cn("contents", godMode && "god-mode-dissolving")}>
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
              isNotePage ? "h-full overflow-hidden flex flex-col" : "overflow-y-auto scrollbar-thin"
            )}
          >
            <GodModeContext.Provider value={enterGodMode}>{children}</GodModeContext.Provider>
          </main>
        </div>
      </div>
    </div>
  );
}
