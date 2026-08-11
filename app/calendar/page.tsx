"use client";

import { CalendarGrid } from "@/components/calendar/calendar-grid";
import { EventModal } from "@/components/calendar/event-modal";
import AppShell from "@/components/layouts/app-shell";
import type { Event as BaseEvent } from "@/types/event";
import { Calendar, Plus, List } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

type Event = BaseEvent & {
  workspaces?: { owner_name: string };
};

function CalendarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org");

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("all");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");

  const [session, setSession] = useState<any>(null);
  const [orgWorkspaces, setOrgWorkspaces] = useState<any[]>([]);

  async function toggleEventCompletion(eventId: string) {
    const event = events.find((e) => e.id === eventId);
    if (!event) return;

    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: !event.is_completed }),
      });

      if (res.ok) {
        setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, is_completed: !e.is_completed } : e)));
      }
    } catch (error) {
      console.error("Error toggling event completion:", error);
    }
  }

  async function checkSession() {
    try {
      const res = await fetch(`/api/auth/session${orgSlug ? `?org=${orgSlug}` : ""}`);
      if (!res.ok) {
        router.push(`/login${orgSlug ? `?org=${orgSlug}` : ""}`);
        return;
      }
      const data = await res.json();
      setSession(data.user);

      const currentOrg = data.user.organizations?.find((o: any) => o.slug === orgSlug) || data.user.organizations?.[0];
      if (currentOrg) {
        const wsRes = await fetch(`/api/workspaces?orgId=${currentOrg.id}`);
        if (wsRes.ok) {
          const wsData = await wsRes.json();
          setOrgWorkspaces(wsData);
        }
        sessionStorage.setItem("selected_org_slug", currentOrg.slug);
        sessionStorage.setItem("selected_org_name", currentOrg.name);
      }
    } catch (err) {
      console.error("Session check failed:", err);
    }
  }

  useEffect(() => {
    if (!orgSlug) {
      const storedSlug = sessionStorage.getItem("selected_org_slug");
      if (storedSlug) {
        router.push(`/calendar?org=${storedSlug}`);
        return;
      }
    }
    checkSession();
  }, [orgSlug, router]);

  useEffect(() => {
    if (session) {
      loadEvents();
    }
  }, [session]);

  async function loadEvents() {
    try {
      const res = await fetch(`/api/calendar/organization${orgSlug ? `?org=${orgSlug}` : ""}`);
      const data = await res.json();
      setEvents(data);
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setLoading(false);
    }
  }

  // Filter events by workspace
  const filteredEvents =
    selectedWorkspace === "all" ? events : events.filter((e) => e.workspace_id === selectedWorkspace);

  // Get upcoming events (all future events)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingEvents = filteredEvents
    .filter((event) => {
      const eventDate = new Date(event.start_time);
      return eventDate >= today;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <AppShell>
      <div className="relative min-h-screen bg-[#FDFBF7] dark:bg-zinc-950 overflow-hidden pt-16 lg:pt-20">
        {/* Technical grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] opacity-70 pointer-events-none z-0" />

        {/* Ambient Glows */}
        <div className="pointer-events-none absolute top-12 left-1/4 h-96 w-96 rounded-full bg-[#FBBF24]/10 blur-[120px] dark:opacity-20 z-0" />
        <div className="pointer-events-none absolute bottom-24 right-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px] dark:opacity-20 z-0" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-8 md:pt-6 md:pb-12 space-y-12 z-10">
          {/* Header */}
          <div className="flex flex-col gap-8 mb-16">
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
              <h1 className="font-black uppercase leading-none border-l-8 border-foreground pl-6 text-4xl sm:text-5xl">
                ORGANIZATION
                <br />
                CALENDAR
              </h1>

              <div className="flex items-center gap-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
                  className="px-6 py-3.5 sm:px-8 sm:py-4 text-base sm:text-lg font-black uppercase border-brutal hover-brutal bg-background flex items-center gap-3"
                >
                  {viewMode === "list" ? (
                    <>
                      <Calendar className="h-5 w-5 sm:h-6 sm:w-6" />
                      GRID VIEW
                    </>
                  ) : (
                    <>
                      <List className="h-5 w-5 sm:h-6 sm:w-6" />
                      LIST VIEW
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="px-6 py-3.5 sm:px-8 sm:py-4 text-base sm:text-lg font-black uppercase border-brutal hover-brutal bg-accent text-accent-foreground flex items-center gap-3"
                >
                  <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
                  NEW EVENT
                </button>
              </div>
            </div>

            {/* Workspace Filter */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider">FILTER:</span>
              <button
                type="button"
                onClick={() => setSelectedWorkspace("all")}
                className={`px-4 py-2 sm:px-6 sm:py-3 text-xs sm:text-sm font-black uppercase border-brutal hover-brutal ${
                  selectedWorkspace === "all" ? "bg-accent text-accent-foreground" : "bg-background"
                }`}
              >
                ALL WORKSPACES ({events.length})
              </button>
              {orgWorkspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => setSelectedWorkspace(ws.id)}
                  className={`px-4 py-2 sm:px-6 sm:py-3 text-xs sm:text-sm font-black uppercase border-brutal hover-brutal ${
                    selectedWorkspace === ws.id ? "bg-accent text-accent-foreground" : "bg-background"
                  }`}
                >
                  {ws.owner_name} ({events.filter((e) => e.workspace_id === ws.id).length})
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-lg font-bold uppercase animate-pulse">LOADING...</div>
          ) : viewMode === "grid" ? (
            <CalendarGrid
              events={filteredEvents}
              currentDate={currentDate}
              onEventComplete={toggleEventCompletion}
            />
          ) : upcomingEvents.length === 0 ? (
            <div className="border-brutal-thick p-12 bg-muted/30">
              <div className="text-center space-y-6">
                <Calendar className="h-16 w-16 mx-auto opacity-50" />
                <h3 className="text-3xl font-black uppercase">NO UPCOMING EVENTS</h3>
                <p className="text-lg font-bold uppercase">CREATE YOUR FIRST EVENT</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-2xl font-black uppercase border-b-4 border-foreground pb-4">
                UPCOMING EVENTS ({upcomingEvents.length})
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="border-brutal shadow-brutal hover-brutal bg-card p-8">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="text-2xl font-black uppercase leading-tight mb-2">
                            {event.note_id && event.workspace_id ? (
                              <a
                                href={`/workspace/${event.workspace_id}/note/${event.note_id}${orgSlug ? `?org=${orgSlug}` : ""}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-accent transition-colors underline decoration-2"
                                title="Open linked note"
                              >
                                {event.title} 📝
                              </a>
                            ) : (
                              event.title
                            )}
                          </div>
                          <div className="text-sm font-bold uppercase opacity-70">
                            {formatDate(event.start_time)}
                            {!event.all_day && ` • ${formatTime(event.start_time)}`}
                            {event.end_time && !event.all_day && ` - ${formatTime(event.end_time)}`}
                          </div>
                        </div>
                        <span
                          className={`px-4 py-2 text-sm font-black uppercase border-brutal ${
                            event.event_type === "event"
                              ? "bg-accent text-accent-foreground"
                              : event.event_type === "reminder"
                                ? "bg-destructive text-destructive-foreground"
                                : "bg-foreground text-background"
                          }`}
                        >
                          {event.event_type}
                        </span>
                      </div>

                      {event.workspaces && (
                        <div className="px-4 py-2 text-xs font-black uppercase border-2 border-foreground bg-muted inline-block">
                          {event.workspaces.owner_name}
                        </div>
                      )}

                      {event.description && (
                        <p className="text-base font-bold pt-4 border-t-4 border-foreground">{event.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <EventModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onEventCreated={loadEvents}
        workspaces={orgWorkspaces}
      />
    </AppShell>
  );
}

export default function OrganizationCalendarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>}>
      <CalendarContent />
    </Suspense>
  );
}
