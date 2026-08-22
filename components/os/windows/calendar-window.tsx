"use client";

import { tintFor } from "@/components/messaging/chrome";
import type { Workspace } from "@/lib/os/use-org-data";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CalendarEventModal, type CalEvent } from "./calendar-event-modal";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Local YYYY-MM-DD. Not toISOString, which converts to UTC and can shift the
 *  day either side of midnight depending on the reader's timezone. */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The grid for one month, Monday-first, padded to whole weeks.
 *
 * Days from the neighbouring months are included and flagged, so the grid is
 * always a clean rectangle rather than a ragged one with holes at each end.
 */
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-first; shift so Monday is 0.
  const leading = (first.getDay() + 6) % 7;

  const start = new Date(year, month, 1 - leading);
  const cells: { date: Date; inMonth: boolean }[] = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push({ date, inMonth: date.getMonth() === month });
    // Stop at a whole week once the month is finished — a fixed six rows
    // leaves an empty trailing week most months.
    if (i >= 27 && (i + 1) % 7 === 0 && date.getMonth() !== month) break;
  }

  return cells;
}

/**
 * The organisation calendar, open as a window.
 *
 * A month grid with a day agenda beneath it, rather than the flat event list
 * this was before: a calendar's job is showing you shape — which days are busy,
 * what is coming — and a list conveys none of that. Selecting a day fills the
 * agenda below.
 */
export function CalendarWindow({ workspaces }: { workspaces: Workspace[] }) {
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalEvent | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/calendar/organization");
      if (!res.ok) {
        if (!cancelled) setEvents([]);
        return;
      }
      const body = await res.json();
      if (!cancelled) setEvents(Array.isArray(body) ? body : []);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Events bucketed by local day, so a lookup while painting the grid is O(1)
  // rather than a scan of every event per cell.
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const event of events ?? []) {
      if (!event.start_time) continue;
      const key = dayKey(new Date(event.start_time));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    }
    return map;
  }, [events]);

  const cells = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const todayKey = dayKey(new Date());
  const selectedEvents = byDay.get(selected) ?? [];

  if (!events) {
    return (
      <div className="p-4" aria-hidden="true">
        <div className="mb-3 h-5 w-32 rounded-full bg-black/[0.07] animate-skeleton dark:bg-[#EDE7DD]/[0.08]" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, i) => `sk-${i}`).map((key, i) => (
            <div
              key={key}
              className="aspect-square rounded-[7px] bg-black/[0.05] animate-skeleton dark:bg-[#EDE7DD]/[0.07]"
              style={{ animationDelay: `${i * 12}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  const shiftMonth = (delta: number) =>
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return (
    <div className="flex h-full flex-col bg-[#FDFBF7] dark:bg-[#211e1a]">
      <header className="flex shrink-0 items-center gap-1.5 px-4 pb-3 pt-4">
        <h2 className="flex-1 text-[17px] font-bold tracking-[-0.02em] text-black dark:text-[#EDE7DD]">
          {cursor.toLocaleDateString([], { month: "long" })}{" "}
          <span className="text-[13px] font-medium text-black/35 dark:text-[#EDE7DD]/35">{cursor.getFullYear()}</span>
        </h2>

        {[
          { icon: ChevronLeft, label: "Previous month", run: () => shiftMonth(-1) },
          { icon: ChevronRight, label: "Next month", run: () => shiftMonth(1) },
        ].map((btn) => (
          <button
            key={btn.label}
            type="button"
            onClick={btn.run}
            aria-label={btn.label}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-[6px] text-black/45",
              "transition-colors duration-150 hover:bg-black/[0.06] hover:text-black",
              "dark:text-[#EDE7DD]/45 dark:hover:bg-[#EDE7DD]/10 dark:hover:text-[#EDE7DD]",
            )}
          >
            <btn.icon className="h-4 w-4" strokeWidth={2.5} />
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            const now = new Date();
            setCursor(now);
            setSelected(dayKey(now));
          }}
          className={cn(
            "ml-0.5 rounded-[6px] px-2 py-1 text-[10.5px] font-semibold text-black/50",
            "transition-colors duration-150 hover:bg-black/[0.06] hover:text-black",
            "dark:text-[#EDE7DD]/50 dark:hover:bg-[#EDE7DD]/10",
          )}
        >
          Today
        </button>

        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          aria-label="New event"
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-[7px] border-[1.5px] border-black bg-[#FBBF24] text-black",
            "shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] transition-[transform,box-shadow] duration-150",
            "hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
            "dark:border-[#EDE7DD] dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,0.85)]",
          )}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </header>

      {/* The month occupies the upper 55% of the window and the agenda takes
          the rest. Cells are sized by that height, NOT by aspect-ratio: a
          square cell in a 900px-wide window is 120px tall, which pushed the
          agenda entirely off-screen and left a grid of mostly empty boxes. */}
      <div className="flex min-h-[190px] shrink-0 basis-[55%] flex-col px-4 pt-3">
        <div className="grid shrink-0 grid-cols-7 gap-1 pb-2.5">
          {WEEKDAYS.map((day, i) => (
            <span
              key={`${day}-${i}`}
              className={cn(
                "text-center text-[9.5px] font-bold uppercase tracking-[0.08em]",
                i >= 5 ? "text-black/20 dark:text-[#EDE7DD]/20" : "text-black/30 dark:text-[#EDE7DD]/30",
              )}
            >
              {day}
            </span>
          ))}
        </div>

        <div className="mb-2 h-px shrink-0 bg-black/[0.07] dark:bg-[#EDE7DD]/[0.08]" />

        {/* grid-rows-N with minmax(0,1fr) is what lets the rows share the
            available height evenly and shrink below their content box. */}
        <div
          className="grid min-h-0 flex-1 grid-cols-7 gap-1"
          style={{ gridTemplateRows: `repeat(${cells.length / 7}, minmax(0, 1fr))` }}
        >
          {cells.map(({ date, inMonth }) => {
            const key = dayKey(date);
            const dayEvents = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selected;
            const hasEvents = dayEvents.length > 0;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={cn(
                  "group relative flex min-h-0 flex-col items-center justify-center gap-[3px] rounded-[9px]",
                  "text-[12px] tabular-nums transition-all duration-150",
                  !inMonth && "text-black/15 dark:text-[#EDE7DD]/15",
                  inMonth &&
                    !isSelected &&
                    !isToday &&
                    "text-black/65 hover:bg-black/[0.05] dark:text-[#EDE7DD]/65 dark:hover:bg-[#EDE7DD]/[0.06]",
                  inMonth && hasEvents && !isSelected && !isToday && "bg-[#E0A458]/[0.08] font-semibold text-black/80 dark:text-[#EDE7DD]/85",
                  isToday &&
                    !isSelected &&
                    "bg-black font-bold text-white dark:bg-[#EDE7DD] dark:text-[#211e1a]",
                  isSelected &&
                    "scale-[1.04] bg-[#FBBF24] font-bold text-black shadow-[0_2px_8px_rgba(251,191,36,0.45)]",
                )}
              >
                <span className="leading-none">{date.getDate()}</span>
                {/* Event density as dots, colour-coded per workspace so a glance
                    at the month shows whose days are busy, not just that they
                    are. Inline under the number rather than absolutely
                    positioned, which detached them from the digit as the row
                    height changed. */}
                {hasEvents && (
                  <span className="flex gap-[2.5px]">
                    {dayEvents.slice(0, 4).map((event) => (
                      <span
                        key={event.id}
                        className={cn(
                          "h-[4px] w-[4px] rounded-full",
                          isSelected || isToday ? "bg-current opacity-70" : tintFor(event.workspace_id ?? event.id),
                        )}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Agenda for the selected day. Takes whatever the month grid leaves and
          scrolls internally, so a day with twelve events never pushes the grid
          out of the window. */}
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto border-t-[1.5px] border-black/[0.08] px-4 pb-4 pt-3.5 os-scroll dark:border-[#EDE7DD]/[0.08]">
        <div className="mb-3 flex items-baseline gap-2">
          <p className="text-[13px] font-bold text-black dark:text-[#EDE7DD]">
            {new Date(`${selected}T00:00:00`).toLocaleDateString([], { weekday: "long" })}
          </p>
          <p className="text-[11px] font-medium text-black/40 dark:text-[#EDE7DD]/40">
            {new Date(`${selected}T00:00:00`).toLocaleDateString([], { month: "long", day: "numeric" })}
          </p>
          {selected === todayKey && (
            <span className="rounded-full bg-[#FBBF24]/25 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.06em] text-[#8a6415] dark:text-[#FBBF24]">
              Today
            </span>
          )}
        </div>

        {selectedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[12px] bg-black/[0.02] py-8 text-center dark:bg-[#EDE7DD]/[0.03]">
            <CalendarDays className="h-5 w-5 text-black/20 dark:text-[#EDE7DD]/20" strokeWidth={1.75} />
            <p className="mt-2 text-[11.5px] text-black/35 dark:text-[#EDE7DD]/35">Nothing scheduled</p>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="mt-2 text-[11px] font-semibold text-[#8a6415] hover:underline dark:text-[#FBBF24]"
            >
              Add an event
            </button>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {selectedEvents.map((event) => {
              const tint = tintFor(event.workspace_id ?? event.id);
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(event);
                      setModalOpen(true);
                    }}
                    className={cn(
                      "group flex w-full gap-3 rounded-[10px] border-[1.5px] border-transparent px-3 py-2.5 text-left",
                      "bg-black/[0.03] transition-all duration-150 hover:border-black/10 hover:bg-black/[0.055]",
                      "dark:bg-[#EDE7DD]/[0.05] dark:hover:border-[#EDE7DD]/15 dark:hover:bg-[#EDE7DD]/[0.09]",
                    )}
                  >
                    <span className={cn("mt-[2px] h-full w-[3px] shrink-0 self-stretch rounded-full", tint)} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold leading-snug text-black dark:text-[#EDE7DD]">
                        {event.title}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-black/40 dark:text-[#EDE7DD]/40">
                        <span className="tabular-nums">
                          {event.all_day
                            ? "All day"
                            : new Date(event.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                        {event.workspaces?.owner_name && (
                          <>
                            <span className="text-black/20 dark:text-[#EDE7DD]/20">·</span>
                            <span className="truncate">{event.workspaces.owner_name}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CalendarEventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        event={editing}
        defaultDate={selected}
        workspaces={workspaces}
        onSaved={(saved) => {
          setEvents((prev) => {
            const rest = (prev ?? []).filter((e) => e.id !== saved.id);
            return [...rest, saved];
          });
        }}
        onDeleted={(id) => {
          setEvents((prev) => (prev ?? []).filter((e) => e.id !== id));
        }}
      />
    </div>
  );
}
