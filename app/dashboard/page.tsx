"use client";

import AppShell from "@/components/layouts/app-shell";
import OnboardingModal from "@/components/editor/onboarding-modal";
import type { Organization } from "@/types/organization";
import { ArrowRight, Calendar, FileText, Grid3X3, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Workspace = {
  id: string;
  owner_name: string;
  role: string;
  created_at: string;
  folder_id?: string | null;
  color?: string;
  owner_id?: string;
  created_by?: string;
};

type DashboardEvent = {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  all_day: boolean;
  event_type: "event" | "reminder" | "task";
  workspace_id?: string;
  note_id?: string;
  workspaces?: { owner_name: string };
};

type Folder = {
  id: string;
  name: string;
  color: string;
};

type UserSession = {
  userId: string;
  role: "founder" | "admin" | "intern";
  ownerName: string;
  organizations: Organization[];
  invitation_code?: string;
};

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

export default function DashboardPage() {
  return (
    <Suspense fallback={<div />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org");

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewDensity, setViewDensity] = useState<2 | 3 | 4>(2);
  const [sortBy, setSortBy] = useState<"name" | "date">("name");
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [notes, setNotes] = useState<any[]>([]);

  async function checkSession() {
    const isDesktop = window.electronAPI?.isDesktop;

    try {
      const res = await fetch(`/api/auth/session${orgSlug ? `?org=${orgSlug}` : ""}`);
      if (!res.ok) {
        if (res.status === 403) {
          router.push(isDesktop ? "/desktop" : "/org-register");
          return;
        }
        router.push(isDesktop ? "/desktop" : `/login${orgSlug ? `?org=${orgSlug}` : ""}`);
        return;
      }

      const data = await res.json();
      setSession(data.user);
    } catch (err) {
      console.error("Session check failed:", err);
      router.push(isDesktop ? "/desktop" : `/login${orgSlug ? `?org=${orgSlug}` : ""}`);
    }
  }

  async function fetchWorkspaces(orgId: string) {
    try {
      const [wsRes, fRes] = await Promise.all([
        fetch(`/api/workspaces?orgId=${orgId}`),
        fetch(`/api/folders?orgId=${orgId}`),
      ]);

      let wsList: Workspace[] = [];

      if (wsRes.ok) {
        const data = await wsRes.json();
        wsList = Array.isArray(data) ? data : [];
        setWorkspaces(wsList);
        setShowOnboarding(wsList.length === 0);
      }

      if (fRes.ok) {
        const data = await fRes.json();
        setFolders(Array.isArray(data) ? data : []);
      }

      if (wsList.length > 0) {
        try {
          // One request for every workspace's notes. Fetching per workspace
          // meant N round trips, each re-paying auth and middleware cost, and
          // the burst grew with the number of workspaces on the dashboard.
          const ids = wsList.map((ws) => ws.id);
          const res = await fetch(`/api/notes?workspaceIds=${encodeURIComponent(ids.join(","))}`);
          const grouped = res.ok ? await res.json() : {};

          const allNotes = wsList.flatMap((ws) => {
            const notesList = grouped[ws.id];
            return (Array.isArray(notesList) ? notesList : []).map((n: Record<string, unknown>) => ({
              ...n,
              workspaceName: ws.owner_name,
              workspaceColor: ws.color,
            }));
          });
          setNotes(allNotes);
        } catch (err) {
          console.error("Failed to load workspace notes:", err);
        }
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!orgSlug) {
      const storedSlug = sessionStorage.getItem("selected_org_slug");
      if (storedSlug) {
        router.push(`/dashboard?org=${storedSlug}`);
        return;
      }
    }
    checkSession();
  }, [orgSlug, router]);

  useEffect(() => {
    if (!session) return;

    const currentOrg =
      session.organizations?.find((o: Organization) => o.slug === orgSlug) || session.organizations?.[0];

    if (currentOrg) {
      fetchWorkspaces(currentOrg.id);
      sessionStorage.setItem("selected_org_slug", currentOrg.slug);
      sessionStorage.setItem("selected_org_name", currentOrg.name);
    }
  }, [session, orgSlug]);

  useEffect(() => {
    if (!session) return;
    const currentOrg =
      session.organizations?.find((o: Organization) => o.slug === orgSlug) || session.organizations?.[0];

    const handleRefresh = () => {
      if (currentOrg) {
        fetchWorkspaces(currentOrg.id);
      }
    };

    window.addEventListener("luman-workspaces-refresh", handleRefresh);
    return () => {
      window.removeEventListener("luman-workspaces-refresh", handleRefresh);
    };
  }, [session, orgSlug]);

  useEffect(() => {
    return window.electronAPI?.onMenuAction((action) => {
      if (action === "new-workspace") handleCreateWorkspace();
    });
  }, [session, orgSlug]);

  useEffect(() => {
    let active = true;

    async function loadEvents() {
      try {
        const res = await fetch("/api/calendar/organization");
        if (!res.ok) return;

        const data = (await res.json()) as DashboardEvent[];
        if (active) {
          setEvents(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load dashboard events:", err);
        if (active) setEvents([]);
      }
    }

    loadEvents();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push(window.electronAPI?.isDesktop ? "/desktop" : "/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  async function handleCreateWorkspace(nameToCreate?: string) {
    const name = nameToCreate || prompt("Enter workspace owner name:");
    if (!name || !session) return;

    try {
      setCreating(true);

      const currentOrg =
        session.organizations?.find((o: Organization) => o.slug === orgSlug) || session.organizations?.[0];
      if (!currentOrg) {
        alert("No organization found");
        return;
      }

      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerName: name, role: "intern", ownerId: currentOrg.id }),
      });

      if (res.ok) {
        await fetchWorkspaces(currentOrg.id);
        setShowOnboarding(false);
        window.dispatchEvent(new CustomEvent("luman-workspaces-refresh"));
      } else {
        const errorData = await res.json();
        alert(`Failed to create workspace: ${errorData.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Error creating workspace:", err);
      alert("Error creating workspace");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteWorkspace(id: string) {
    if (!confirm("Are you sure you want to delete this workspace? This action cannot be undone.")) return;

    try {
      const res = await fetch(`/api/workspaces?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        if (session) {
          const currentOrg =
            session.organizations?.find((o: Organization) => o.slug === orgSlug) || session.organizations?.[0];
          if (currentOrg) {
            await fetchWorkspaces(currentOrg.id);
            window.dispatchEvent(new CustomEvent("luman-workspaces-refresh"));
          }
        }
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete workspace");
      }
    } catch (err) {
      console.error("Error deleting workspace:", err);
      alert("Error deleting workspace");
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const currentOrg = session.organizations?.find((o: Organization) => o.slug === orgSlug) || session.organizations?.[0];

  let filteredWorkspaces = workspaces;
  if (searchQuery) {
    filteredWorkspaces = filteredWorkspaces.filter((ws) =>
      ws.owner_name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }

  filteredWorkspaces = [...filteredWorkspaces].sort((a, b) => {
    if (sortBy === "name") {
      return a.owner_name.localeCompare(b.owner_name);
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  let filteredNotes = notes;
  if (searchQuery) {
    filteredNotes = notes.filter((note) =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }

  const folderMap = new Map(folders.map((folder) => [folder.id, folder.name]));
  const upcomingEvents = [...events]
    .filter((event) => new Date(event.start_time) >= new Date())
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 5);

  const quickActionCards = (
    <section className="grid gap-6 md:grid-cols-2">
      <Link
        href="/dashboard/tasks"
        className="group relative overflow-hidden border-[3px] border-black dark:border-stone-100 rounded-[24px] bg-[#FBBF24] p-8 flex flex-col justify-between gap-6 transition-all hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] text-black"
      >
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-black text-[#FBBF24] rounded-full">
            TASKS & BOARD
          </div>
          <h3 className="text-3xl font-black uppercase leading-none mt-2">My Tasks</h3>
          <p className="text-xs font-bold uppercase tracking-wider text-black/75">
            Organize, assign, and track all your workflow tasks in one place.
          </p>
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-sm font-black uppercase tracking-widest group-hover:underline">GO TO BOARD &rarr;</span>
          <div className="inline-flex h-12 w-12 items-center justify-center border-[3px] border-black dark:border-stone-100 bg-white dark:bg-zinc-900 text-black dark:text-stone-100 group-hover:translate-x-1 transition-transform shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
            <ArrowRight className="h-5 w-5" />
          </div>
        </div>
      </Link>

      <Link
        href="/calendar"
        className="group relative overflow-hidden border-[3px] border-black dark:border-stone-100 rounded-[24px] bg-[#A7F3D0] p-8 flex flex-col justify-between gap-6 transition-all hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] text-black"
      >
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 text-[10px] font-black uppercase tracking-widest bg-black text-[#A7F3D0] rounded-full">
            CALENDAR & SCHEDULE
          </div>
          <h3 className="text-3xl font-black uppercase leading-none mt-2">Upcoming Events</h3>
          <p className="text-xs font-bold uppercase tracking-wider text-black/75">
            {upcomingEvents.length} active schedule event{upcomingEvents.length === 1 ? "" : "s"} waiting for your
            attention.
          </p>
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-sm font-black uppercase tracking-widest group-hover:underline">
            VIEW CALENDAR &rarr;
          </span>
          <div className="inline-flex h-12 w-12 items-center justify-center border-[3px] border-black dark:border-stone-100 bg-white dark:bg-zinc-900 text-black dark:text-stone-100 group-hover:translate-x-1 transition-transform shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
            <Calendar className="h-5 w-5" />
          </div>
        </div>
      </Link>
    </section>
  );

  return (
    <AppShell>
      <div className="relative min-h-screen bg-[#FDFBF7] dark:bg-zinc-950 overflow-hidden pt-16 lg:pt-20">
        {/* Technical grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] opacity-70 pointer-events-none" />

        {/* Ambient Glows */}
        <div className="pointer-events-none absolute top-12 left-1/4 h-96 w-96 rounded-full bg-[#FBBF24]/10 blur-[120px] dark:opacity-20" />
        <div className="pointer-events-none absolute bottom-24 right-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px] dark:opacity-20" />

        <div className="relative mx-auto max-w-7xl px-8 pt-4 pb-12 md:pt-6 md:pb-16 space-y-12">
          {/* Header Banner */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3.5 py-1.5 text-xs font-black uppercase tracking-widest border-[3px] border-black dark:border-stone-100 bg-white dark:bg-zinc-900 text-black dark:text-stone-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)] rounded-full">
                    {session.role}
                  </span>
                  <span className="px-3.5 py-1.5 text-xs font-black uppercase tracking-widest border-[3px] border-black dark:border-stone-100 bg-black dark:bg-white text-white dark:text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)] rounded-full">
                    {session.ownerName}
                  </span>
                  {(session.role?.toLowerCase() === "founder" || session.role?.toLowerCase() === "admin") && currentOrg?.invitation_code && (
                    <span className="px-3.5 py-1.5 text-xs font-black uppercase tracking-widest border-[3px] border-black dark:border-stone-100 bg-[#A7F3D0] text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)] rounded-full">
                      INVITE: {currentOrg.invitation_code}
                    </span>
                  )}
                </div>
                <h1 className="text-4xl md:text-5xl font-black uppercase tracking-wide text-black dark:text-stone-100">Welcome to Luman</h1>
                <div className="text-xs font-black uppercase tracking-[0.25em] text-stone-500 dark:text-stone-400">
                  Manage your team, notes, and workspaces beautifully.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    const name = prompt("Folder Name:");
                    if (!name) return;
                    const color = prompt("Color (red, blue, green, etc):") || "stone";

                    const currentOrg =
                      session.organizations?.find((o: Organization) => o.slug === orgSlug) ||
                      session.organizations?.[0];
                    if (!currentOrg) return;

                    await fetch("/api/folders", {
                      method: "POST",
                      body: JSON.stringify({ name, orgId: currentOrg.id, color }),
                    });
                    fetchWorkspaces(currentOrg.id);
                  }}
                  className="px-6 py-3.5 text-sm font-black uppercase border-[3px] border-black dark:border-stone-100 rounded-full bg-white dark:bg-zinc-900 text-black dark:text-stone-100 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                >
                  New folder
                </button>
              </div>
            </div>


            {/* Redesigned Search & Sort bar */}
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-white dark:bg-zinc-900 border-[3px] border-black dark:border-stone-100 p-6 rounded-[24px] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] mt-8">
              <div className="flex-1 flex items-center gap-3 bg-stone-50 dark:bg-zinc-800 border-[3px] border-black dark:border-stone-100 rounded-full px-5 py-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
                <Search className="h-5 w-5 shrink-0 text-stone-500" />
                <input
                  id="workspace-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="FILTER BY WORKSPACE NAME..."
                  className="w-full bg-transparent text-sm font-bold uppercase placeholder:text-stone-400 focus:outline-none text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="flex items-center gap-4">
                <label htmlFor="workspace-sort" className="text-xs font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">
                  SORT BY
                </label>
                <select
                  id="workspace-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "name" | "date")}
                  className="border-[3px] border-black dark:border-stone-100 rounded-full px-5 py-3 text-xs font-black uppercase bg-white dark:bg-zinc-900 text-stone-900 dark:text-stone-100 cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800 focus:outline-none"
                >
                  <option value="name">NAME (A-Z)</option>
                  <option value="date">DATE CREATED</option>
                </select>
              </div>
            </div>

            {searchQuery && (
              <div className="text-xs font-black uppercase tracking-wider pl-2 text-stone-600 dark:text-stone-300">
                Showing {filteredWorkspaces.length} of {workspaces.length} workspaces and {filteredNotes.length} matching notes
              </div>
            )}
          </section>

          {searchQuery ? (
            <>
              {/* Search Results in thin tile manner */}
              <section className="space-y-6 pt-2">
                <div className="flex items-center justify-between gap-4 border-b-2 border-dashed border-stone-300 dark:border-zinc-800 pb-4">
                  <span className="text-xs font-black uppercase tracking-[0.35em] text-stone-500">SEARCH RESULTS</span>
                  <span className="text-xs font-black uppercase text-stone-500">
                    {filteredWorkspaces.length + filteredNotes.length} MATCH{filteredWorkspaces.length + filteredNotes.length === 1 ? "" : "ES"} FOUND
                  </span>
                </div>

                <div className="grid gap-8 md:grid-cols-2">
                  {/* Workspace Results Column */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase tracking-widest text-stone-700 dark:text-stone-300 flex items-center gap-2 border-b-2 border-stone-200 dark:border-zinc-800 pb-2">
                      <Grid3X3 className="h-4 w-4 text-[#FBBF24]" />
                      WORKSPACES ({filteredWorkspaces.length})
                    </h4>

                    {filteredWorkspaces.length === 0 ? (
                      <div className="border-[3px] border-black dark:border-stone-100 bg-stone-50/50 dark:bg-zinc-900/50 p-6 rounded-[16px] text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]">
                        <p className="text-xs font-bold uppercase text-stone-500">
                          No matching workspaces
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {filteredWorkspaces.map((ws) => {
                          const isRestricted =
                            (session.userId !== ws.owner_id && session.userId !== ws.created_by) &&
                            ((ws.role === "founder" && session.role !== "founder") ||
                             (ws.role === "admin" && session.role === "intern"));
                          const folderName = ws.folder_id ? folderMap.get(ws.folder_id) : null;

                          return (
                            <Link
                              key={ws.id}
                              href={isRestricted ? "#" : `/workspace/${ws.id}${orgSlug ? `?org=${orgSlug}` : ""}`}
                              onClick={(e) => {
                                if (isRestricted) {
                                  e.preventDefault();
                                  alert("You do not have permission to enter a founder-restricted workspace.");
                                }
                              }}
                              className="group flex items-center justify-between border-[3px] border-black dark:border-stone-100 bg-white dark:bg-zinc-900 text-black dark:text-stone-100 rounded-[16px] p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                            >
                              <div className="flex items-center gap-4 flex-wrap">
                                <div
                                  className={`h-4 w-4 rounded-full border-2 border-black shrink-0 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${getColorClass(
                                    ws.color,
                                  )}`}
                                />

                                <span className="text-base font-black uppercase text-stone-900 dark:text-stone-100 group-hover:text-[#FBBF24] transition-colors font-sans">
                                  {ws.owner_name}
                                </span>

                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border-2 border-black dark:border-stone-100 rounded-full ${
                                      ws.role === "founder" ? "bg-[#FED7AA] text-black" : "bg-black text-white"
                                    }`}
                                  >
                                    {ws.role}
                                  </span>
                                  {folderName && (
                                    <span className="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border-2 border-black dark:border-stone-100 rounded-full bg-stone-100 dark:bg-zinc-800 text-black dark:text-stone-100">
                                      {folderName}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                <span className="text-xs font-black uppercase tracking-wider inline-flex items-center gap-1 group-hover:underline text-black dark:text-stone-100">
                                  {isRestricted ? "RESTRICTED" : "OPEN"}
                                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                </span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Notes Results Column */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-black uppercase tracking-widest text-stone-700 dark:text-stone-300 flex items-center gap-2 border-b-2 border-stone-200 dark:border-zinc-800 pb-2">
                      <FileText className="h-4 w-4 text-[#FBBF24]" />
                      NOTES ({filteredNotes.length})
                    </h4>

                    {filteredNotes.length === 0 ? (
                      <div className="border-[3px] border-black dark:border-stone-100 bg-stone-50/50 dark:bg-zinc-900/50 p-6 rounded-[16px] text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]">
                        <p className="text-xs font-bold uppercase text-stone-500">
                          No matching notes
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {filteredNotes.map((note) => (
                          <Link
                            key={note.id}
                            href={`/workspace/${note.workspace_id}/note/${note.id}${orgSlug ? `?org=${orgSlug}` : ""}`}
                            className="group flex items-center justify-between border-[3px] border-black dark:border-stone-100 bg-white dark:bg-zinc-900 text-black dark:text-stone-100 rounded-[16px] p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                          >
                            <div className="flex items-center gap-4 flex-wrap">
                              <FileText className="h-4 w-4 shrink-0 text-[#FBBF24]" />

                              <span className="text-base font-black uppercase text-stone-900 dark:text-stone-100 group-hover:text-[#FBBF24] transition-colors font-sans">
                                {note.title}
                              </span>

                              <span
                                className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border-2 border-black dark:border-stone-100 rounded-full ${getColorClass(
                                  note.workspaceColor,
                                )} text-black`}
                              >
                                {note.workspaceName}
                              </span>

                              {note.tags && Array.isArray(note.tags) && note.tags.map((tag: string) => (
                                <span key={tag} className="px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border-2 border-black dark:border-stone-100 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-stone-300">
                                  #{tag}
                                </span>
                              ))}
                            </div>

                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black uppercase tracking-wider inline-flex items-center gap-1 group-hover:underline text-black dark:text-stone-100">
                                OPEN Note
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Quick Action Widget Cards below search results */}
              {quickActionCards}
            </>
          ) : (
            <>
              {/* Quick Action Widget Cards in default state */}
              {quickActionCards}

              {/* Workspaces Section */}
              <section className="space-y-6 pt-6">
                <div className="flex items-center justify-between gap-4 border-b-2 border-dashed border-stone-300 dark:border-zinc-800 pb-4">
                  <span className="text-xs font-black uppercase tracking-[0.35em] text-stone-500">
                    WORKSPACE LIBRARY
                  </span>
                  <span className="text-xs font-black uppercase text-stone-500">
                    {filteredWorkspaces.length} VISIBLE OF {workspaces.length}
                  </span>
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {["alpha", "beta", "gamma"].map((key) => (
                      <div
                        key={`workspace-skeleton-${key}`}
                        className="border-[3px] border-black dark:border-stone-100 bg-white dark:bg-zinc-900 rounded-[24px] p-8 space-y-6 animate-pulse shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)]"
                      >
                        <div className="h-4 w-28 bg-stone-200 dark:bg-zinc-800 rounded" />
                        <div className="h-10 w-4/5 bg-stone-200 dark:bg-zinc-800 rounded" />
                        <div className="h-4 w-full bg-stone-200 dark:bg-zinc-800 rounded" />
                        <div className="h-12 w-full bg-stone-200 dark:bg-zinc-800 rounded" />
                      </div>
                    ))}
                  </div>
                ) : filteredWorkspaces.length === 0 ? (
                  <div className="border-[3px] border-black dark:border-stone-100 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] bg-white dark:bg-zinc-900 p-10 md:p-14 rounded-[24px] relative overflow-hidden">
                    <div className="relative max-w-2xl space-y-6">
                      <span className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-black uppercase border-[3px] border-black dark:border-stone-100 bg-stone-100 dark:bg-zinc-800 text-black dark:text-stone-100 rounded-full">
                        <Grid3X3 className="h-4 w-4" />
                        EMPTY WORKSPACE LIBRARY
                      </span>
                      <h3 className="text-4xl md:text-5xl font-black uppercase leading-none text-black dark:text-stone-100">
                        {searchQuery.trim() ? "No matching workspaces" : "No workspaces yet"}
                      </h3>
                      <p className="max-w-xl text-sm font-bold uppercase leading-relaxed text-stone-500 dark:text-stone-400">
                        {searchQuery.trim()
                          ? "Try a different search term or clear the filter to see everything again."
                          : "Create your first workspace, then turn it into a habit by adding notes and folder structure."}
                      </p>
                      <div className="flex flex-wrap gap-4 pt-4">
                        <button
                          type="button"
                          onClick={() => handleCreateWorkspace()}
                          disabled={creating}
                          className="px-8 py-4 text-sm font-black uppercase border-[3px] border-black dark:border-stone-100 rounded-full bg-[#FBBF24] text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50"
                        >
                          {creating ? "Creating..." : "Create workspace"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const name = prompt("Folder Name:");
                            if (!name) return;
                            const color = prompt("Color (red, blue, green, etc):") || "stone";

                            const currentOrg =
                              session.organizations?.find((o: Organization) => o.slug === orgSlug) ||
                              session.organizations?.[0];
                            if (!currentOrg) return;

                            await fetch("/api/folders", {
                              method: "POST",
                              body: JSON.stringify({ name, orgId: currentOrg.id, color }),
                            });
                            fetchWorkspaces(currentOrg.id);
                          }}
                          className="px-8 py-4 text-sm font-black uppercase border-[3px] border-black dark:border-stone-100 rounded-full bg-white dark:bg-zinc-900 text-black dark:text-stone-100 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                        >
                          New folder
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredWorkspaces.map((ws) => {
                      const isRestricted =
                        (session.userId !== ws.owner_id && session.userId !== ws.created_by) &&
                        ((ws.role === "founder" && session.role !== "founder") ||
                         (ws.role === "admin" && session.role === "intern"));
                      const folderName = ws.folder_id ? folderMap.get(ws.folder_id) : null;

                      return (
                        <article
                          key={ws.id}
                          className="group relative overflow-hidden border-[3px] border-black dark:border-stone-100 bg-white dark:bg-zinc-900 rounded-[24px] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[10px_10px_0px_0px_rgba(255,255,255,1)] hover:-translate-y-1 transition-all flex flex-col justify-between min-h-[300px] p-6 md:p-8 text-black dark:text-stone-100"
                        >
                          <div className="space-y-6">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border-2 border-black dark:border-stone-100 rounded-full ${
                                      ws.role === "founder"
                                        ? "bg-[#FED7AA] text-black"
                                        : "bg-black dark:bg-white text-white dark:text-black"
                                    }`}
                                  >
                                    {ws.role}
                                  </span>
                                  {folderName && (
                                    <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border-2 border-black dark:border-stone-100 rounded-full bg-stone-100 dark:bg-zinc-800 text-black dark:text-stone-100">
                                      {folderName}
                                    </span>
                                  )}
                                </div>
                                <h3 className="text-2xl font-black uppercase leading-tight mt-2 text-stone-900 dark:text-stone-100 group-hover:text-[#FBBF24] transition-colors">
                                  {ws.owner_name}
                                </h3>
                              </div>

                              <div
                                className={`h-6 w-6 rounded-full border-2 border-black dark:border-stone-100 ${getColorClass(ws.color)} shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]`}
                              />
                            </div>

                            <div className="grid gap-3 grid-cols-3">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">Folder</label>
                                <select
                                  className="bg-stone-50 dark:bg-zinc-800 border-2 border-black dark:border-stone-100 rounded-xl text-[11px] font-black uppercase px-2.5 py-2.5 cursor-pointer focus:outline-none focus:bg-stone-100 dark:focus:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] text-black dark:text-stone-100"
                                  defaultValue={ws.folder_id || ""}
                                  disabled={session.role !== "founder" && session.userId !== ws.owner_id && session.userId !== ws.created_by}
                                  title={session.role !== "founder" && session.userId !== ws.owner_id && session.userId !== ws.created_by ? "Only the founder or creator can organize this workspace." : ""}
                                  onChange={async (e) => {
                                    const folderId = e.target.value || null;
                                    const res = await fetch(`/api/workspaces?id=${ws.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ folderId }),
                                    });
                                    if (res.ok && session && session.organizations?.[0]) {
                                      await fetchWorkspaces(session.organizations[0].id);
                                      window.dispatchEvent(new CustomEvent("luman-workspaces-refresh"));
                                    }
                                  }}
                                >
                                  <option value="">None</option>
                                  {folders.map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">Accent</label>
                                <select
                                  className="bg-stone-50 dark:bg-zinc-800 border-2 border-black dark:border-stone-100 rounded-xl text-[11px] font-black uppercase px-2.5 py-2.5 cursor-pointer focus:outline-none focus:bg-stone-100 dark:focus:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] text-black dark:text-stone-100"
                                  defaultValue={ws.color || "stone"}
                                  disabled={session.role !== "founder" && session.userId !== ws.owner_id && session.userId !== ws.created_by}
                                  title={session.role !== "founder" && session.userId !== ws.owner_id && session.userId !== ws.created_by ? "Only the founder or creator can organize this workspace." : ""}
                                  onChange={async (e) => {
                                    const color = e.target.value;
                                    const res = await fetch(`/api/workspaces?id=${ws.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ color }),
                                    });
                                    if (res.ok && session && session.organizations?.[0]) {
                                      await fetchWorkspaces(session.organizations[0].id);
                                      window.dispatchEvent(new CustomEvent("luman-workspaces-refresh"));
                                    }
                                  }}
                                >
                                  <option value="stone">Gray</option>
                                  <option value="red">Red</option>
                                  <option value="blue">Blue</option>
                                  <option value="green">Green</option>
                                  <option value="yellow">Yellow</option>
                                  <option value="purple">Purple</option>
                                  <option value="pink">Pink</option>
                                  <option value="orange">Orange</option>
                                </select>
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">Visibility</label>
                                <select
                                  className="bg-stone-50 dark:bg-zinc-800 border-2 border-black dark:border-stone-100 rounded-xl text-[11px] font-black uppercase px-2.5 py-2.5 cursor-pointer focus:outline-none focus:bg-stone-100 dark:focus:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] text-black dark:text-stone-100"
                                  defaultValue={ws.role || "intern"}
                                  disabled={session.userId !== ws.owner_id && session.userId !== ws.created_by}
                                  title={session.userId !== ws.owner_id && session.userId !== ws.created_by ? "Only the creator/owner can change visibility." : ""}
                                  onChange={async (e) => {
                                    const role = e.target.value;
                                    const res = await fetch(`/api/workspaces?id=${ws.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ role }),
                                    });
                                    if (res.ok && session && session.organizations?.[0]) {
                                      await fetchWorkspaces(session.organizations[0].id);
                                      window.dispatchEvent(new CustomEvent("luman-workspaces-refresh"));
                                    }
                                  }}
                                >
                                  <option value="intern">Visible to All</option>
                                  <option value="admin">Admin & Founder</option>
                                  <option value="founder">Founder Only</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-5 border-t-2 border-stone-200 dark:border-zinc-800 mt-6 font-sans">
                            <Link
                              href={isRestricted ? "#" : `/workspace/${ws.id}${orgSlug ? `?org=${orgSlug}` : ""}`}
                              onClick={(e) => {
                                if (isRestricted) {
                                  e.preventDefault();
                                  alert("You do not have permission to enter a founder-restricted workspace.");
                                }
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-black dark:text-stone-100 hover:underline"
                            >
                              OPEN WORKSPACE
                              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </Link>

                            {!isRestricted && (session.role === "founder" || session.userId === ws.owner_id) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDeleteWorkspace(ws.id);
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                DELETE
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <OnboardingModal isOpen={showOnboarding} onSubmit={handleCreateWorkspace} />
    </AppShell>
  );
}
