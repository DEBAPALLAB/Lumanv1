"use client";
 
import { createSupabaseClient } from "@/lib/supabase/client";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Plus,
  Trash2,
  Home,
  Calendar,
  CheckSquare,
  MessageSquare,
  Settings,
  Search,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
 
type WorkspaceFolder = {
  id: string;
  name: string;
  color: string;
};
 
type Workspace = {
  id: string;
  owner_name: string;
  folder_id: string | null;
  color: string;
  owner_id: string;
  created_by: string;
  role?: string | null;
};
 
type Note = {
  id: string;
  title: string;
  created_at: string;
};
 
interface WorkspaceSidebarProps {
  isWorkspacesExpanded: boolean;
  onToggleWorkspaces: () => void;
  isNotePage?: boolean;
  isNotesCollapsedOnNotePage?: boolean;
}

export function WorkspaceSidebar({
  isWorkspacesExpanded,
  onToggleWorkspaces,
  isNotePage = false,
  isNotesCollapsedOnNotePage = false,
}: WorkspaceSidebarProps) {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = typeof params?.workspaceId === "string" ? params.workspaceId : undefined;
  const noteId = typeof params?.noteId === "string" ? params.noteId : undefined;
  const orgSlug =
    searchParams.get("org") || (typeof window !== "undefined" ? sessionStorage.getItem("selected_org_slug") : null);
  const isWorkspaceView = Boolean(workspaceId) && pathname?.startsWith("/workspace/");
 
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [user, setUser] = useState<any>(null);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [membershipRole, setMembershipRole] = useState<string>("intern");
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
 
  const [activeTab, setActiveTab] = useState<"workspaces" | "notes">(
    workspaceId ? "notes" : "workspaces"
  );
 
  useEffect(() => {
    if (workspaceId) {
      setActiveTab("notes");
    } else {
      setActiveTab("workspaces");
    }
  }, [workspaceId]);
 
  const [activeNoteStats, setActiveNoteStats] = useState<{
    headings: { text: string; level: number }[];
    wordCount: number;
    charCount: number;
    noteId: string;
  } | null>(null);
 
  useEffect(() => {
    setActiveNoteStats(null);
  }, [noteId]);
 
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.noteId === noteId) {
        setActiveNoteStats(customEvent.detail);
      }
    };
    window.addEventListener("luman-note-editor-update", handleUpdate);
    return () => {
      window.removeEventListener("luman-note-editor-update", handleUpdate);
    };
  }, [noteId]);
 
  async function fetchData() {
    try {
      const supabase = createSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        console.error("Sidebar: No authenticated user found", userError);
        return;
      }
      setUser(userData.user);
 
      const latestOrgSlug =
        searchParams.get("org") || (typeof window !== "undefined" ? sessionStorage.getItem("selected_org_slug") : null);

      let orgId = null;
      if (latestOrgSlug) {
        const { data: org } = await supabase.from("organizations").select("id").eq("slug", latestOrgSlug).single();
        orgId = org?.id;
      } else {
        const { data: membership } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", userData.user.id)
          .limit(1)
          .single();
        orgId = membership?.organization_id;
      }
 
      if (!orgId) return;
      setCurrentOrgId(orgId);
 
      // Fetch user role
      const { data: membershipData } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("organization_id", orgId)
        .single();
      if (membershipData) {
        setMembershipRole(membershipData.role);
      }
 
      // Fetch Folders
      const { data: foldersData } = await supabase
        .from("workspace_folders")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true });
      if (foldersData) setFolders(foldersData);
 
      // Fetch Workspaces
      const { data: workspacesData } = await supabase
        .from("workspaces")
        .select("*")
        .or(`organization_id.eq.${orgId},and(organization_id.is.null,owner_id.eq.${userData.user.id})`)
        .order("created_at", { ascending: true });
      if (workspacesData) setWorkspaces(workspacesData);
 
      // Fetch notes list to calculate counts
      const { data: notesList } = await supabase
        .from("notes")
        .select("id, workspace_id");
      if (notesList) {
        const counts: Record<string, number> = {};
        for (const note of notesList) {
          counts[note.workspace_id] = (counts[note.workspace_id] || 0) + 1;
        }
        setNoteCounts(counts);
      }
    } catch (err) {
      console.error("Sidebar fetch error:", err);
    } finally {
      setLoading(false);
    }
  }
 
  useEffect(() => {
    fetchData();
 
    // Set up Realtime Subscription
    const supabase = createSupabaseClient();
    const channel = supabase
      .channel("sidebar-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_folders" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, () => fetchData())
      .subscribe();
 
    const handleRefresh = () => {
      fetchData();
    };
    window.addEventListener("luman-workspaces-refresh", handleRefresh);
 
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("luman-workspaces-refresh", handleRefresh);
    };
  }, [orgSlug]);
 
  useEffect(() => {
    if (!isWorkspaceView || !workspaceId) {
      setNotes([]);
      setNotesLoading(false);
      return;
    }
 
    let active = true;
 
    async function fetchNotes() {
      try {
        setNotesLoading(true);
        const res = await fetch(`/api/notes?workspaceId=${workspaceId}`);
        const data = await res.json();
 
        if (active) {
          setNotes(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Sidebar notes fetch error:", err);
        if (active) setNotes([]);
      } finally {
        if (active) setNotesLoading(false);
      }
    }
 
    fetchNotes();
 
    return () => {
      active = false;
    };
  }, [isWorkspaceView, workspaceId]);
 
  const toggleFolder = (folderId: string) => {
    setOpenFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };
 
  const handleCreateWorkspace = async () => {
    const name = prompt("Enter workspace owner name:");
    if (!name || !currentOrgId || !user) return;
 
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerName: name,
          role: "intern",
          ownerId: currentOrgId,
        }),
      });
 
      if (!res.ok) {
        const errData = await res.json();
        alert(errData.error || "Failed to create workspace");
      } else {
        fetchData();
        window.dispatchEvent(new CustomEvent("luman-workspaces-refresh"));
      }
    } catch (err) {
      console.error("Error creating workspace:", err);
    }
  };
 
  // Pastel color mapping for workspace dots
  const getColorClass = (color?: string) => {
    switch (color) {
      case "red":
        return "bg-red-200";
      case "blue":
        return "bg-blue-200";
      case "green":
        return "bg-green-200";
      case "yellow":
        return "bg-yellow-200";
      case "purple":
        return "bg-purple-200";
      case "pink":
        return "bg-pink-200";
      case "orange":
        return "bg-orange-200";
      case "teal":
        return "bg-teal-200";
      case "indigo":
        return "bg-indigo-200";
      case "cyan":
        return "bg-cyan-200";
      default:
        return "bg-stone-300";
    }
  };
 
  const getWorkspaceCardStyle = (color?: string, isActive?: boolean) => {
    if (isActive) {
      return "bg-[#FBBF24] text-black border-black dark:border-stone-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]";
    }
 
    let hoverStyles = "";
    switch (color) {
      case "red":
        hoverStyles = "hover:bg-red-50 dark:hover:bg-red-950/20 hover:border-red-500 hover:shadow-[3px_3px_0px_0px_rgba(239,68,68,1)]";
        break;
      case "blue":
        hoverStyles = "hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:border-blue-500 hover:shadow-[3px_3px_0px_0px_rgba(59,130,246,1)]";
        break;
      case "green":
        hoverStyles = "hover:bg-green-50 dark:hover:bg-green-950/20 hover:border-green-500 hover:shadow-[3px_3px_0px_0px_rgba(16,185,129,1)]";
        break;
      case "yellow":
        hoverStyles = "hover:bg-yellow-50 dark:hover:bg-yellow-950/20 hover:border-yellow-500 hover:shadow-[3px_3px_0px_0px_rgba(245,158,11,1)]";
        break;
      case "purple":
        hoverStyles = "hover:bg-purple-50 dark:hover:bg-purple-950/20 hover:border-purple-500 hover:shadow-[3px_3px_0px_0px_rgba(139,92,246,1)]";
        break;
      case "pink":
        hoverStyles = "hover:bg-pink-50 dark:hover:bg-pink-950/20 hover:border-pink-500 hover:shadow-[3px_3px_0px_0px_rgba(236,72,153,1)]";
        break;
      case "orange":
        hoverStyles = "hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:border-orange-500 hover:shadow-[249,115,22,1)]";
        break;
      case "teal":
        hoverStyles = "hover:bg-teal-50 dark:hover:bg-teal-950/20 hover:border-teal-500 hover:shadow-[20,184,166,1)]";
        break;
      default:
        hoverStyles = "hover:bg-stone-50 dark:hover:bg-zinc-800 hover:border-stone-400 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]";
    }
    return `bg-white dark:bg-zinc-900 text-stone-800 dark:text-stone-100 border-black dark:border-stone-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] ${hoverStyles}`;
  };
 
  // Pastel text colors for folder names
  const getFolderTextColor = (color?: string) => {
    switch (color) {
      case "red":
        return "text-red-600";
      case "blue":
        return "text-blue-600";
      case "green":
        return "text-green-600";
      case "yellow":
        return "text-yellow-700";
      case "purple":
        return "text-purple-600";
      case "pink":
        return "text-pink-600";
      case "orange":
        return "text-orange-600";
      case "teal":
        return "text-teal-600";
      case "indigo":
        return "text-indigo-600";
      case "cyan":
        return "text-cyan-600";
      default:
        return "";
    }
  };
 
  const currentWorkspace = workspaceId ? workspaces.find((w) => w.id === workspaceId) : null;
  const dashboardHref = orgSlug ? `/dashboard?org=${orgSlug}` : "/dashboard";
  const settingsHref = orgSlug ? `/settings?org=${orgSlug}` : "/settings";
  const tasksHref = orgSlug ? `/dashboard/tasks?org=${orgSlug}` : "/dashboard/tasks";
  const calendarHref = orgSlug ? `/calendar?org=${orgSlug}` : "/calendar";
  const chatHref = orgSlug ? `/messaging?org=${orgSlug}` : "/messaging";
  const adminHref = orgSlug ? `/dashboard/admin?org=${orgSlug}` : "/dashboard/admin";

  const isDashboardActive = pathname === "/dashboard" || pathname === "/" || (pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/tasks") && !pathname.startsWith("/dashboard/admin"));
  const isTasksActive = pathname?.startsWith("/dashboard/tasks");
  const isCalendarActive = pathname?.startsWith("/calendar");
  const isChatActive = pathname?.startsWith("/messaging");
  const isSettingsActive = pathname?.startsWith("/settings");
  const isAdminActive = pathname?.startsWith("/dashboard/admin");
  const isFounderOrAdmin = membershipRole === "founder" || membershipRole === "admin";
 
  const filteredWorkspaces = workspaces.filter((w) => {
    const matchesSearch = w.owner_name.toLowerCase().includes(workspaceSearchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // Owner/creator can always access
    if (w.owner_id === user?.id || w.created_by === user?.id) {
      return true;
    }
    // Visibility checks
    if (w.role === "founder") {
      return membershipRole === "founder";
    }
    if (w.role === "admin") {
      return membershipRole === "founder" || membershipRole === "admin";
    }
    // 'intern' workspaces are visible to all members
    return true;
  });
 
  const filteredFolders = folders.map(folder => {
    const folderWorkspaces = filteredWorkspaces.filter(w => w.folder_id === folder.id);
    return { folder, folderWorkspaces };
  }).filter(({ folder, folderWorkspaces }) => {
    const nameMatches = folder.name.toLowerCase().includes(workspaceSearchQuery.toLowerCase());
    return nameMatches || folderWorkspaces.length > 0;
  });
 
  const unfolderedWorkspaces = filteredWorkspaces.filter((w) => !w.folder_id);
 
  const filteredNotes = notes.filter((note) =>
    note.title.toLowerCase().includes(noteSearchQuery.toLowerCase())
  );
 
  const showColumn2 = isWorkspacesExpanded;
 
  return (
    <aside className="w-full h-full min-h-0 border-none bg-transparent flex overflow-hidden relative font-sans">
      {/* Technical dot-grid overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1.5px,transparent_1.5px)] [background-size:24px_24px] opacity-60 pointer-events-none z-0" />
 
      {/* Column 1 — Icon Rail (narrowest column) */}
      <div className="w-[84px] h-full flex flex-col items-center border-r-[3px] border-black dark:border-stone-100 bg-[#FDFBF7] dark:bg-zinc-950 shrink-0 relative z-10 py-6">
        <div className="flex flex-col gap-6 items-center w-full">


          {/* Dashboard Button */}
          <div className="relative group">
            <Link
              href={dashboardHref}
              className={cn(
                "flex items-center justify-center h-11 w-11 border-[3px] border-black dark:border-stone-100 rounded-full shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2.5px_2.5px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[1.5px] hover:translate-y-[1.5px] transition-all",
                isDashboardActive ? "bg-[#FBBF24] text-black" : "bg-white dark:bg-zinc-900 text-black dark:text-stone-100"
              )}
            >
              <Home className="h-5 w-5" />
            </Link>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 hidden group-hover:block z-50 bg-black text-[#FBBF24] border-2 border-black dark:border-stone-100 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-md whitespace-nowrap shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]">
              DASHBOARD
            </div>
          </div>
 
          {/* Workspaces Toggle Button (Only active/visible if we're not strictly inside a simplified view) */}
          <div className="relative group">
            <button
              type="button"
              onClick={onToggleWorkspaces}
              className={cn(
                "flex items-center justify-center h-11 w-11 border-[3px] border-black dark:border-stone-100 rounded-full shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2.5px_2.5px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[1.5px] hover:translate-y-[1.5px] transition-all",
                isWorkspacesExpanded ? "bg-[#FBBF24] text-black" : "bg-white dark:bg-zinc-900 text-black dark:text-stone-100"
              )}
            >
              <Layers className="h-5 w-5" />
            </button>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 hidden group-hover:block z-50 bg-black text-[#FBBF24] border-2 border-black dark:border-stone-100 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-md whitespace-nowrap shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]">
              WORKSPACES
            </div>
          </div>
 
          {/* My Tasks Button */}
          <div className="relative group">
            <Link
              href={tasksHref}
              className={cn(
                "flex items-center justify-center h-11 w-11 border-[3px] border-black dark:border-stone-100 rounded-full shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2.5px_2.5px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[1.5px] hover:translate-y-[1.5px] transition-all",
                isTasksActive ? "bg-[#FBBF24] text-black" : "bg-white dark:bg-zinc-900 text-black dark:text-stone-100"
              )}
            >
              <CheckSquare className="h-5 w-5" />
            </Link>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 hidden group-hover:block z-50 bg-black text-[#FBBF24] border-2 border-black dark:border-stone-100 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-md whitespace-nowrap shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]">
              MY TASKS
            </div>
          </div>
 
          {/* Calendar/Events Button */}
          <div className="relative group">
            <Link
              href={calendarHref}
              className={cn(
                "flex items-center justify-center h-11 w-11 border-[3px] border-black dark:border-stone-100 rounded-full shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2.5px_2.5px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[1.5px] hover:translate-y-[1.5px] transition-all",
                isCalendarActive ? "bg-[#FBBF24] text-black" : "bg-white dark:bg-zinc-900 text-black dark:text-stone-100"
              )}
            >
              <Calendar className="h-5 w-5" />
            </Link>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 hidden group-hover:block z-50 bg-black text-[#FBBF24] border-2 border-black dark:border-stone-100 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-md whitespace-nowrap shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]">
              ALL EVENTS
            </div>
          </div>
 
          {/* Team Chat Button */}
          <div className="relative group">
            <Link
              href={chatHref}
              prefetch
              className={cn(
                "flex items-center justify-center h-11 w-11 border-[3px] border-black dark:border-stone-100 rounded-full shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2.5px_2.5px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[1.5px] hover:translate-y-[1.5px] transition-all",
                isChatActive ? "bg-[#FBBF24] text-black" : "bg-white dark:bg-zinc-900 text-black dark:text-stone-100"
              )}
            >
              <MessageSquare className="h-5 w-5" />
            </Link>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 hidden group-hover:block z-50 bg-black text-[#FBBF24] border-2 border-black dark:border-stone-100 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-md whitespace-nowrap shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]">
              TEAM CHAT
            </div>
          </div>

          {/* Admin & Invite Button (For Founders & Admins) */}
          {isFounderOrAdmin && (
            <div className="relative group">
              <Link
                href={adminHref}
                className={cn(
                  "flex items-center justify-center h-11 w-11 border-[3px] border-black dark:border-stone-100 rounded-full shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2.5px_2.5px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[1.5px] hover:translate-y-[1.5px] transition-all",
                  isAdminActive ? "bg-[#FBBF24] text-black" : "bg-white dark:bg-zinc-900 text-black dark:text-stone-100"
                )}
              >
                <Shield className="h-5 w-5" />
              </Link>
              <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 hidden group-hover:block z-50 bg-black text-[#FBBF24] border-2 border-black dark:border-stone-100 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-md whitespace-nowrap shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]">
                ADMIN & INVITES
              </div>
            </div>
          )}

          {/* Settings Button */}
          <div className="relative group">
            <Link
              href={settingsHref}
              className={cn(
                "flex items-center justify-center h-11 w-11 border-[3px] border-black dark:border-stone-100 rounded-full shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2.5px_2.5px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[1.5px] hover:translate-y-[1.5px] transition-all",
                isSettingsActive ? "bg-[#FBBF24] text-black" : "bg-white dark:bg-zinc-900 text-black dark:text-stone-100"
              )}
            >
              <Settings className="h-5 w-5 transition-none animate-none" style={{ transition: "none", transform: "none" }} />
            </Link>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 hidden group-hover:block z-50 bg-black text-[#FBBF24] border-2 border-black dark:border-stone-100 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-md whitespace-nowrap shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]">
              SETTINGS
            </div>
          </div>
        </div>
 
        {/* User avatar pinned to the bottom */}
        {user && (
          <div className="relative group mt-auto flex justify-center">
            <div className="w-10 h-10 rounded-full bg-black dark:bg-stone-100 text-[#FBBF24] dark:text-black font-black flex items-center justify-center border-[3px] border-black dark:border-stone-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] select-none">
              {user.email?.[0].toUpperCase() || "U"}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-[2px] border-black dark:border-stone-100 animate-pulse" />
            </div>
            <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 hidden group-hover:block z-50 bg-black text-[#FBBF24] border-2 border-black dark:border-stone-100 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-md whitespace-nowrap shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]">
              {user.email}
            </div>
          </div>
        )}
      </div>
      {/* Column 2 — Dynamic Content Column (Workspaces or Notes) */}
      {showColumn2 && (
        <div className="w-[260px] h-full flex flex-col border-r-[3px] border-black dark:border-stone-100 bg-[#FDFBF7] dark:bg-zinc-950 shrink-0 relative z-10 overflow-hidden">
          
          {/* Toggle Header (Workspaces vs Notes) */}
          <div className="p-4 border-b-[3px] border-black dark:border-stone-100 bg-transparent shrink-0 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 border-[3px] border-black dark:border-stone-100 rounded-full overflow-hidden bg-white dark:bg-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
                <button
                  type="button"
                  onClick={() => setActiveTab("workspaces")}
                  className={cn(
                    "flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider text-center border-r-[3px] border-black dark:border-stone-100 transition-all",
                    activeTab === "workspaces" ? "bg-[#FBBF24] text-black font-black" : "bg-white dark:bg-zinc-900 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-zinc-800 font-bold"
                  )}
                >
                  Workspaces
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (workspaceId) {
                      setActiveTab("notes");
                    } else {
                      alert("Please select a workspace from the list first!");
                    }
                  }}
                  className={cn(
                    "flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider text-center transition-all",
                    activeTab === "notes" ? "bg-[#FBBF24] text-black font-black" : "bg-white dark:bg-zinc-900 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-zinc-800 font-bold",
                    !workspaceId && "opacity-55 cursor-not-allowed"
                  )}
                >
                  Notes
                </button>
              </div>


            </div>
          </div>

          {/* ACTIVE CONTENT AREA */}
          {activeTab === "workspaces" ? (
            <>
              {/* Search workspaces input */}
              <div className="p-4 border-b-[3px] border-black/10 bg-transparent shrink-0">
                <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border-[3px] border-black dark:border-stone-100 rounded-full px-3 py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
                  <Search className="h-4 w-4 shrink-0 text-stone-500" />
                  <input
                    type="text"
                    value={workspaceSearchQuery}
                    onChange={(e) => setWorkspaceSearchQuery(e.target.value)}
                    placeholder="SEARCH WORKSPACES..."
                    className="w-full bg-transparent text-[10px] font-black uppercase placeholder:text-stone-400 focus:outline-none text-stone-900 dark:text-stone-100"
                  />
                </div>
              </div>

              {/* Header Workspace Badge */}
              <div className="flex items-center justify-between px-4 py-2 border-b-[3px] border-black/10 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400 flex items-center gap-1.5 select-none">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 border border-black animate-pulse" />
                  WORKSPACES
                </span>
                <span className="px-2.5 py-0.5 border-2 border-black rounded-full bg-[#FBBF24] text-[9px] font-black uppercase tracking-wider shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] select-none">
                  {workspaces.length} ACTIVE
                </span>
              </div>

              {/* Scrollable Workspace List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-none">
                {loading ? (
                  <div className="text-xs opacity-50 font-black px-4 tracking-widest animate-pulse">LOADING...</div>
                ) : (
                  <>
                    {/* Folder list */}
                    {filteredFolders.map(({ folder, folderWorkspaces }) => {
                      const isOpen = openFolders[folder.id];
                      return (
                        <div
                          key={folder.id}
                          className="border-2 border-black dark:border-stone-100 rounded-[18px] bg-white dark:bg-zinc-900 p-2 text-stone-900 dark:text-stone-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)] transition-all space-y-1 relative"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <button
                              type="button"
                              onClick={() => toggleFolder(folder.id)}
                              className="flex-1 flex items-center gap-2 px-2 py-1.5 text-[10px] font-black uppercase rounded-lg hover:bg-stone-50 dark:hover:bg-zinc-800 transition-all text-left truncate"
                            >
                              <div className={cn("h-4.5 w-4.5 rounded-full border border-black dark:border-stone-100 flex items-center justify-center shrink-0 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] dark:shadow-[1px_1px_0px_0px_rgba(255,255,255,1)]", getColorClass(folder.color))}>
                                {isOpen ? (
                                  <ChevronDown className="h-3 w-3 text-black dark:text-stone-100" />
                                ) : (
                                  <ChevronRight className="h-3 w-3 text-black dark:text-stone-100" />
                                )}
                              </div>
                              <span className={`${getFolderTextColor(folder.color)} font-black tracking-wide truncate flex-1`}>
                                {folder.name}
                              </span>
                              <span className="text-[9px] font-mono bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 px-1.5 py-0.5 rounded text-stone-900 dark:text-stone-100 shrink-0">
                                {folderWorkspaces.length}
                              </span>
                            </button>
                            
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm("Delete this folder?")) return;
                                const supabase = createSupabaseClient();
                                const { error } = await supabase.from("workspace_folders").delete().eq("id", folder.id);
                                if (error) {
                                  console.error("Error deleting folder:", error);
                                  alert("Failed to delete folder. It might not be empty.");
                                }
                              }}
                              className="p-1.5 text-stone-400 dark:text-stone-505 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors shrink-0"
                              title="Delete Folder"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {isOpen && (
                            <div className="pl-1 pr-1 pb-1 space-y-1.5 border-t border-dashed border-stone-100 dark:border-zinc-800 pt-2 mt-1">
                              {folderWorkspaces.length === 0 ? (
                                <div className="px-3 py-2 text-[10px] font-bold text-center uppercase text-stone-400 dark:text-stone-500 bg-stone-50 dark:bg-zinc-800 rounded-lg border border-stone-200 dark:border-zinc-700 border-dashed">
                                  Empty folder
                                </div>
                              ) : (
                                folderWorkspaces.map((w) => {
                                  const isActive = workspaceId === w.id;
                                  const canDelete = membershipRole === "founder" || user?.id === w.owner_id || user?.id === w.created_by;
                                  return (
                                    <div key={w.id} className="flex items-center gap-1.5">
                                      <Link
                                        href={`/workspace/${w.id}${orgSlug ? `?org=${orgSlug}` : ""}`}
                                        className={cn(
                                          "flex-1 flex items-center gap-2 px-3 py-2 text-[10px] font-black uppercase rounded-[12px] border-[3px] transition-all hover:-translate-y-0.5 min-w-0 truncate",
                                          getWorkspaceCardStyle(w.color, isActive)
                                        )}
                                      >
                                        <div className={`h-2.5 w-2.5 rounded-full border border-black shrink-0 ${getColorClass(w.color)}`} />
                                        <span className="truncate flex-1 font-sans">{w.owner_name}</span>
                                        <span className="text-[9px] font-mono bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 px-1 py-0.5 rounded text-stone-900 dark:text-stone-100 shrink-0">
                                          {noteCounts[w.id] || 0}
                                        </span>
                                      </Link>
                                      {canDelete && (
                                        <button
                                          type="button"
                                          onClick={async (e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (!confirm("Delete this workspace? This action cannot be undone.")) return;
                                            const res = await fetch(`/api/workspaces?id=${w.id}`, { method: "DELETE" });
                                            if (!res.ok) {
                                              const errData = await res.json();
                                              alert(errData.error || "Failed to delete workspace");
                                            } else {
                                              fetchData();
                                              window.dispatchEvent(new CustomEvent("luman-workspaces-refresh"));
                                            }
                                          }}
                                          className="p-1 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/10 transition-colors shrink-0"
                                          title="Delete Workspace"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Unfoldered Workspace List */}
                    {unfolderedWorkspaces.length > 0 && (
                      <div className="space-y-2">
                        {unfolderedWorkspaces.map((w) => {
                          const isActive = workspaceId === w.id;
                          const canDelete = membershipRole === "founder" || user?.id === w.owner_id || user?.id === w.created_by;
                          return (
                            <div key={w.id} className="flex items-center gap-1.5">
                              <Link
                                href={`/workspace/${w.id}${orgSlug ? `?org=${orgSlug}` : ""}`}
                                className={cn(
                                  "flex-1 flex items-center gap-2.5 px-4 py-2.5 text-[10px] font-black uppercase rounded-[14px] border-[3px] transition-all hover:-translate-y-0.5 min-w-0 truncate",
                                  getWorkspaceCardStyle(w.color, isActive)
                                )}
                              >
                                <div className={`h-2.5 w-2.5 rounded-full border border-black shrink-0 ${getColorClass(w.color)} shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]`} />
                                <span className="flex-1 truncate font-sans">{w.owner_name}</span>
                                <span className="text-[9px] font-mono bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 px-1.5 py-0.5 rounded text-stone-900 dark:text-stone-100 shrink-0">
                                  {noteCounts[w.id] || 0}
                                </span>
                              </Link>
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!confirm("Delete this workspace? This action cannot be undone.")) return;
                                    const res = await fetch(`/api/workspaces?id=${w.id}`, { method: "DELETE" });
                                    if (!res.ok) {
                                      const errData = await res.json();
                                      alert(errData.error || "Failed to delete workspace");
                                    } else {
                                      fetchData();
                                      window.dispatchEvent(new CustomEvent("luman-workspaces-refresh"));
                                    }
                                  }}
                                  className="p-1 text-stone-400 dark:text-stone-505 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/10 transition-colors shrink-0"
                                  title="Delete Workspace"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {filteredFolders.length === 0 && unfolderedWorkspaces.length === 0 && (
                      <div className="px-4 text-[10px] font-black uppercase opacity-50 tracking-widest text-center py-4 border-2 border-dashed border-stone-200 rounded-[18px]">
                        No workspaces
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Create workspace button pinned at the bottom */}
              <div className="p-4 border-t-[3px] border-black dark:border-stone-100 bg-transparent shrink-0">
                <button
                  type="button"
                  onClick={handleCreateWorkspace}
                  className="w-full py-2.5 text-xs font-black uppercase border-[3px] border-black dark:border-stone-100 rounded-full bg-[#FBBF24] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                >
                  + New Workspace
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Search notes input */}
              <div className="p-4 border-b-[3px] border-black/10 bg-transparent shrink-0">
                <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border-2 border-black dark:border-stone-100 rounded-full px-2.5 py-1.5 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                  <Search className="h-3.5 w-3.5 shrink-0 text-stone-500" />
                  <input
                    type="text"
                    value={noteSearchQuery}
                    onChange={(e) => setNoteSearchQuery(e.target.value)}
                    placeholder="SEARCH NOTES..."
                    className="w-full bg-transparent text-[9px] font-black uppercase placeholder:text-stone-400 focus:outline-none text-stone-900 dark:text-stone-100"
                  />
                </div>
              </div>

              {/* Workspace Badge / Count for Notes list */}
              <div className="flex items-center justify-between px-4 py-2 border-b-[3px] border-black/10 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-900 dark:text-stone-100 truncate max-w-[170px] select-none font-sans">
                  {currentWorkspace?.owner_name || "Workspace"}
                </span>
                <Link
                  href={`/workspace/${workspaceId}/new${orgSlug ? `?org=${orgSlug}` : ""}`}
                  className="inline-flex items-center justify-center h-7 w-7 border-[3px] border-black rounded-full hover-brutal bg-[#FBBF24] text-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all"
                  title="Create new note"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Scrollable list of Notes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-none flex flex-col justify-between">
                <div className="space-y-2">
                  {notesLoading ? (
                    <div className="px-2 text-xs font-bold uppercase opacity-60">Loading notes...</div>
                  ) : filteredNotes.length === 0 ? (
                    <div className="px-3 py-4 text-[10px] font-bold text-center uppercase opacity-60 border-2 border-dashed border-stone-200 rounded-xl bg-muted/10">
                      No notes yet
                    </div>
                  ) : (
                    filteredNotes.map((note) => {
                      const isActive = noteId === note.id;
                      return (
                        <div key={note.id} className="flex items-center gap-1.5 group/noteitem">
                          <Link
                            href={`/workspace/${workspaceId}/note/${note.id}${orgSlug ? `?org=${orgSlug}` : ""}`}
                            className={cn(
                              "flex-1 flex items-center gap-2.5 px-4 py-3 text-[10px] font-black uppercase rounded-[12px] border-[3px] transition-all hover:-translate-y-0.5 min-w-0 truncate",
                              isActive
                                ? "bg-[#FBBF24] text-black border-black dark:border-stone-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] font-black"
                                : "bg-white dark:bg-zinc-900 hover:bg-stone-50 dark:hover:bg-zinc-800 border-black dark:border-stone-100 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,1)] text-stone-800 dark:text-stone-100 font-bold"
                            )}
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate flex-1 font-sans">{note.title}</span>
                          </Link>

                          <button
                            type="button"
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!confirm(`Delete note "${note.title || "Untitled"}"? This action cannot be undone.`)) return;
                              const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
                              if (res.ok) {
                                setNotes((prev) => prev.filter((n) => n.id !== note.id));
                                if (noteId === note.id) {
                                  window.location.href = `/workspace/${workspaceId}${orgSlug ? `?org=${orgSlug}` : ""}`;
                                }
                              } else {
                                alert("Failed to delete note");
                              }
                            }}
                            className="p-1 text-stone-400 dark:text-stone-500 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors opacity-0 group-hover/noteitem:opacity-100 focus-visible:opacity-100 shrink-0"
                            title="Delete note"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Table of Contents inside Column when inside a note */}
                {isNotePage && noteId && activeNoteStats && (
                  <div className="mt-6 border-t-[3px] border-black dark:border-zinc-800 pt-4 space-y-4 shrink-0">
                    <div className="space-y-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-505 select-none font-sans">
                        Table of Contents
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 scrollbar-none">
                        {activeNoteStats.headings && activeNoteStats.headings.length > 0 ? (
                          activeNoteStats.headings.map((h, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                window.dispatchEvent(
                                  new CustomEvent("luman-scroll-to-heading", { detail: { index: i } })
                                );
                              }}
                              style={{ paddingLeft: `${(h.level - 1) * 6}px` }}
                              className={cn(
                                "w-full text-left flex items-start gap-1 text-[9px] font-black uppercase truncate transition-all hover:translate-x-[1.5px] cursor-pointer",
                                h.level === 1
                                  ? "text-stone-900 dark:text-stone-100"
                                  : h.level === 2
                                  ? "text-stone-600 dark:text-stone-400"
                                  : "text-stone-450 dark:text-stone-505"
                              )}
                            >
                              <span className="text-[#FBBF24] shrink-0">•</span>
                              <span className="truncate hover:underline">{h.text}</span>
                            </button>
                          ))
                        ) : (
                          <div className="text-[8px] font-bold text-center uppercase text-stone-400 py-2 border border-dashed border-stone-200 dark:border-zinc-800 rounded-lg">
                            No headers found
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* "+ New Note" Action at the bottom of notes activeTab */}
              {workspaceId && (
                <div className="p-4 border-t-[3px] border-black dark:border-stone-100 bg-transparent shrink-0">
                  <Link
                    href={`/workspace/${workspaceId}/new${orgSlug ? `?org=${orgSlug}` : ""}`}
                    className="w-full inline-flex items-center justify-center py-2.5 text-xs font-black uppercase border-[3px] border-black dark:border-stone-100 rounded-full bg-[#FBBF24] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all font-sans"
                  >
                    + New Note
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
