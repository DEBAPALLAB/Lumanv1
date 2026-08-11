"use client";

import { CalendarGrid } from "@/components/calendar/calendar-grid";
import { EventModal } from "@/components/calendar/event-modal";
import AppShell from "@/components/layouts/app-shell";
import type { Event } from "@/types/event";
import { Calendar, Check, Plus, List } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function WorkspaceCalendarPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");

  useEffect(() => {
    loadEvents();
  }, [workspaceId]);

  async function loadEvents() {
    try {
      const res = await fetch(`/api/events?workspaceId=${workspaceId}`);
      const data = await res.json();
      setEvents(data);
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setLoading(false);
    }
  }

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

  // Get events for current month
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  const monthEvents = events.filter((event) => {
    const eventDate = new Date(event.start_time);
    return eventDate >= monthStart && eventDate <= monthEnd;
  });

  // Sort: incomplete first, then by date
  const sortedMonthEvents = [...monthEvents].sort((a, b) => {
    if (a.is_completed !== b.is_completed) {
      return a.is_completed ? 1 : -1;
    }
    return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
  });

  // Get upcoming events (next 7 days, not completed)
  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingEvents = events
    .filter((event) => {
      const eventDate = new Date(event.start_time);
      return !event.is_completed && eventDate >= today && eventDate <= nextWeek;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
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

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-8 md:pt-6 md:pb-12 z-10">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-8 mb-16">
            <div className="space-y-4">
              <h1 className="font-black uppercase leading-none border-l-8 border-foreground pl-6 text-4xl sm:text-5xl">CALENDAR</h1>
              <p className="text-lg font-bold uppercase pl-6 text-stone-500 dark:text-stone-400">
                {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase()}
              </p>
            </div>

            <div className="flex gap-4 flex-wrap">
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

          {loading ? (
            <div className="text-lg font-bold uppercase animate-pulse">LOADING...</div>
          ) : viewMode === "grid" ? (
            <CalendarGrid
              events={events}
              currentDate={currentDate}
              onEventComplete={toggleEventCompletion}
            />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Upcoming Events */}
              <div className="xl:col-span-1 space-y-6">
                <h2 className="text-2xl font-black uppercase border-b-4 border-foreground pb-4">UPCOMING</h2>

                {upcomingEvents.length === 0 ? (
                  <div className="border-brutal p-6 bg-muted/30">
                    <p className="text-sm font-bold uppercase">NO UPCOMING EVENTS</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {upcomingEvents.map((event) => (
                      <div key={event.id} className="border-brutal shadow-brutal hover-brutal bg-card p-6">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-lg font-black uppercase leading-tight flex-1">{event.title}</div>
                            <button
                              type="button"
                              onClick={() => toggleEventCompletion(event.id)}
                              className="p-2 border-brutal hover-brutal bg-background shrink-0"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          </div>
                          <span
                            className={`px-3 py-1 text-xs font-black uppercase border-2 border-foreground inline-block ${
                              event.event_type === "event"
                                ? "bg-accent text-accent-foreground"
                                : event.event_type === "reminder"
                                  ? "bg-destructive text-destructive-foreground"
                                  : "bg-foreground text-background"
                            }`}
                          >
                            {event.event_type}
                          </span>
                          <div className="text-sm font-bold uppercase opacity-70">
                            {formatDate(event.start_time)}
                            {!event.all_day && ` • ${formatTime(event.start_time)}`}
                          </div>
                          {event.description && (
                            <p className="text-sm font-bold pt-2 border-t-2 border-foreground">{event.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Month View */}
              <div className="xl:col-span-2 space-y-6">
                <h2 className="text-2xl font-black uppercase border-b-4 border-foreground pb-4">
                  THIS MONTH ({monthEvents.length} EVENTS)
                </h2>

                {monthEvents.length === 0 ? (
                  <div className="border-brutal-thick p-12 bg-muted/30">
                    <div className="text-center space-y-6">
                      <Calendar className="h-16 w-16 mx-auto opacity-50" />
                      <h3 className="text-3xl font-black uppercase">NO EVENTS</h3>
                      <p className="text-lg font-bold uppercase">CREATE YOUR FIRST EVENT</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sortedMonthEvents.map((event) => (
                      <div
                        key={event.id}
                        className={`border-brutal shadow-brutal hover-brutal bg-card p-8 ${
                          event.is_completed ? "opacity-60" : ""
                        }`}
                      >
                        <div className="space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div
                                className={`text-2xl font-black uppercase leading-tight mb-2 ${
                                  event.is_completed ? "line-through" : ""
                                }`}
                              >
                                {event.title}
                              </div>
                              <div className="text-sm font-bold uppercase opacity-70">
                                {formatDate(event.start_time)}
                                {!event.all_day && ` • ${formatTime(event.start_time)}`}
                                {event.end_time && !event.all_day && ` - ${formatTime(event.end_time)}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
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
                              <button
                                type="button"
                                onClick={() => toggleEventCompletion(event.id)}
                                className={`p-3 border-brutal hover-brutal ${
                                  event.is_completed ? "bg-accent text-accent-foreground" : "bg-background"
                                }`}
                              >
                                <Check className="h-5 w-5" />
                              </button>
                            </div>
                          </div>
                          {event.description && (
                            <p className="text-base font-bold pt-4 border-t-4 border-foreground">{event.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <EventModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        workspaceId={workspaceId}
        onEventCreated={loadEvents}
      />
    </AppShell>
  );
}
