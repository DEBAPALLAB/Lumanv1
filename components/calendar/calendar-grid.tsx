"use client";

import { Calendar as CalendarIcon, Check, List } from "lucide-react";
import { useState } from "react";

interface Event {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  all_day: boolean;
  event_type: "event" | "reminder" | "task";
  is_completed: boolean;
  note_id?: string;
  workspace_id?: string;
}

interface CalendarGridProps {
  events: Event[];
  currentDate: Date;
  onDateClick?: (date: Date) => void;
  onEventComplete?: (eventId: string) => void;
}

export function CalendarGrid({ events, currentDate, onDateClick, onEventComplete }: CalendarGridProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Get days in month
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  // Create calendar grid
  const days: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  // Get events for a specific date
  function getEventsForDate(day: number) {
    const dateStr = new Date(year, month, day).toDateString();
    return events.filter((event) => {
      const eventDate = new Date(event.start_time).toDateString();
      return eventDate === dateStr;
    });
  }

  // Check if date has events
  function hasEvents(day: number) {
    return getEventsForDate(day).length > 0;
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Get events for selected date
  const selectedDateEvents = selectedDate
    ? events.filter((event) => {
        const eventDate = new Date(event.start_time).toDateString();
        return eventDate === selectedDate.toDateString();
      })
    : [];

  return (
    <div className="w-full bg-transparent space-y-8">
      <div className="flex flex-col xl:flex-row gap-8 items-start w-full">
        {/* Calendar Grid (Left) */}
        <div className="flex-[5] w-full border-brutal-thick bg-card p-4 sm:p-8">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-2 sm:gap-4 mb-4 sm:mb-8">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
              <div key={day} className="text-center text-xs sm:text-lg font-black uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-2 sm:gap-4">
            {days.map((day, index) => {
              if (!day) {
                return <div key={index} className="aspect-square" />;
              }

              const dateObj = new Date(year, month, day);
              const isToday = new Date().toDateString() === dateObj.toDateString();
              const dayHasEvents = hasEvents(day);
              const isSelected = selectedDate && selectedDate.toDateString() === dateObj.toDateString();

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    setSelectedDate(dateObj);
                    onDateClick?.(dateObj);
                  }}
                  className={`aspect-square border-brutal-thick p-1.5 sm:p-4 md:p-6 relative transition-none ${
                    isSelected
                      ? "bg-accent text-accent-foreground shadow-brutal-lg"
                      : isToday
                        ? "bg-foreground text-background shadow-brutal"
                        : dayHasEvents
                          ? "bg-muted hover-brutal"
                          : "bg-background hover-brutal"
                  }`}
                >
                  <div className="text-base sm:text-2xl md:text-4xl font-black leading-none">{day}</div>
                  {dayHasEvents && (
                    <div className="absolute bottom-1 sm:bottom-3 left-1/2 -translate-x-1/2 flex gap-1 sm:gap-2">
                      {getEventsForDate(day)
                        .slice(0, 3)
                        .map((_, i) => (
                          <div key={i} className="w-1.5 h-1.5 sm:w-3 sm:h-3 border border-foreground sm:border-2 bg-accent" />
                        ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Date Events (Right Sidebar) */}
        {selectedDate && (
          <div className="flex-[2] shrink-0 w-full xl:w-[420px] border-brutal-thick p-6 sm:p-8 bg-card shadow-brutal-xl">
            <h3 className="text-2xl sm:text-3xl font-black uppercase mb-6 sm:mb-8 border-b-4 border-foreground pb-4">
              {selectedDate
                .toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
                .toUpperCase()}
            </h3>
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
              {selectedDateEvents.length > 0 ? (
                selectedDateEvents.map((event) => (
                  <div key={event.id} className="border-brutal-thick p-4 sm:p-6 bg-background shadow-brutal">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div
                          className={`text-xl sm:text-2xl font-black uppercase leading-tight mb-3 ${
                            event.is_completed ? "opacity-50 line-through" : ""
                          }`}
                        >
                          {event.note_id && event.workspace_id ? (
                            <a
                              href={`/workspace/${event.workspace_id}/note/${event.note_id}`}
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
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          <span
                            className={`px-3 py-1 text-xs font-black uppercase border-brutal ${
                              event.event_type === "event"
                                ? "bg-accent text-accent-foreground"
                                : event.event_type === "reminder"
                                  ? "bg-destructive text-destructive-foreground"
                                  : "bg-foreground text-background"
                            }`}
                          >
                            {event.event_type}
                          </span>
                          {!event.all_day && (
                            <div className="text-sm font-bold uppercase">
                              {formatTime(event.start_time)}
                              {event.end_time && ` - ${formatTime(event.end_time)}`}
                            </div>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-sm font-bold pt-4 border-t-4 border-foreground">{event.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventComplete?.(event.id);
                        }}
                        className={`p-2.5 sm:p-3 border-brutal-thick hover-brutal shrink-0 ${
                          event.is_completed ? "bg-accent text-accent-foreground" : "bg-background"
                        }`}
                        title={event.is_completed ? "Mark as incomplete" : "Mark as complete"}
                      >
                        <Check className="h-5 w-5 sm:h-6 sm:w-6" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="border-brutal-thick p-6 sm:p-8 bg-background text-center space-y-4">
                  <CalendarIcon className="h-10 w-10 sm:h-12 sm:w-12 mx-auto opacity-40" />
                  <p className="text-base sm:text-lg font-black uppercase opacity-50">NO EVENTS</p>
                  <p className="text-xs sm:text-sm font-bold uppercase opacity-40">NOTHING SCHEDULED FOR THIS DAY</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
