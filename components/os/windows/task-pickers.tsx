"use client";

import { initialsFor, tintFor } from "@/components/messaging/chrome";
import type { AuthorDirectory } from "@/components/messaging/message-list";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Calendar, ChevronLeft, ChevronRight, User, X } from "lucide-react";
import { useMemo, useState } from "react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const leading = first.getDay();
  const start = new Date(year, month, 1 - leading);
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push({ date, inMonth: date.getMonth() === month });
    if (i >= 27 && (i + 1) % 7 === 0 && date.getMonth() !== month) break;
  }
  return cells;
}

/**
 * A pill button that opens a small calendar popover, replacing the browser's
 * native date input — which renders its own chrome (a "mm/dd/yyyy" spinner and
 * an OS-styled calendar) that clashes with everything else in this window.
 */
export function DatePickerField({
  value,
  onChange,
  label = "Due",
}: {
  /** ISO string or null. */
  value: string | null;
  onChange: (iso: string | null) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(value) : null;
  const [cursor, setCursor] = useState(() => selectedDate ?? new Date());

  const cells = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const todayKey = dayKey(new Date());
  const selectedKey = selectedDate ? dayKey(selectedDate) : null;

  const pick = (date: Date) => {
    const iso = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    onChange(iso);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
            "transition-colors duration-150",
            value
              ? "bg-[#FBBF24]/25 text-black/75 hover:bg-[#FBBF24]/35 dark:text-[#EDE7DD]/85"
              : "bg-black/[0.05] text-black/45 hover:bg-black/[0.09] dark:bg-[#EDE7DD]/[0.07] dark:text-[#EDE7DD]/45 dark:hover:bg-[#EDE7DD]/[0.12]",
          )}
        >
          <Calendar className="h-3 w-3" strokeWidth={2.25} />
          {value
            ? new Date(value).toLocaleDateString([], { month: "short", day: "numeric" })
            : label}
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
            >
              <X className="h-2.5 w-2.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className={cn(
          "w-[240px] rounded-[13px] border-[2px] border-black bg-white p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
          "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.9)]",
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-bold text-black dark:text-[#EDE7DD]">
            {cursor.toLocaleDateString([], { month: "long", year: "numeric" })}
          </span>
          <div className="flex gap-0.5">
            <button
              type="button"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              className="flex h-5 w-5 items-center justify-center rounded-[5px] text-black/45 hover:bg-black/[0.06] dark:text-[#EDE7DD]/45 dark:hover:bg-[#EDE7DD]/10"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              className="flex h-5 w-5 items-center justify-center rounded-[5px] text-black/45 hover:bg-black/[0.06] dark:text-[#EDE7DD]/45 dark:hover:bg-[#EDE7DD]/10"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0.5 pb-1">
          {WEEKDAYS.map((d, i) => (
            <span
              key={`${d}-${i}`}
              className="text-center text-[9px] font-bold uppercase text-black/30 dark:text-[#EDE7DD]/30"
            >
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map(({ date, inMonth }) => {
            const key = dayKey(date);
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => pick(date)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-[6px] text-[10.5px] tabular-nums",
                  "transition-colors duration-150",
                  !inMonth && "text-black/20 dark:text-[#EDE7DD]/20",
                  inMonth && !isSelected && "text-black/70 hover:bg-black/[0.07] dark:text-[#EDE7DD]/70",
                  isSelected && "bg-[#FBBF24] font-bold text-black",
                  isToday && !isSelected && "font-bold ring-[1.5px] ring-inset ring-black/30 dark:ring-[#EDE7DD]/30",
                )}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            const now = new Date();
            setCursor(now);
            pick(now);
          }}
          className="mt-2 w-full rounded-[7px] py-1 text-center text-[10.5px] font-semibold text-black/50 hover:bg-black/[0.06] dark:text-[#EDE7DD]/50 dark:hover:bg-[#EDE7DD]/10"
        >
          Today
        </button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A pill button that opens a member-picker popover — an avatar list rather
 * than a plain `<select>`, matching how people are shown everywhere else
 * (chat, agenda) instead of a bare text dropdown.
 */
export function AssigneePickerField({
  value,
  onChange,
  directory,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  directory: AuthorDirectory;
}) {
  const [open, setOpen] = useState(false);
  const assignee = value ? directory[value] : undefined;
  const people = Object.entries(directory);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
            "transition-colors duration-150",
            assignee
              ? "bg-[#8FB8AC]/25 text-black/75 hover:bg-[#8FB8AC]/35 dark:text-[#EDE7DD]/85"
              : "bg-black/[0.05] text-black/45 hover:bg-black/[0.09] dark:bg-[#EDE7DD]/[0.07] dark:text-[#EDE7DD]/45 dark:hover:bg-[#EDE7DD]/[0.12]",
          )}
        >
          {assignee ? (
            <span
              className={cn(
                "flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px] font-bold text-black/70",
                tintFor(value),
              )}
            >
              {initialsFor(assignee.name || assignee.email || "?")}
            </span>
          ) : (
            <User className="h-3 w-3" strokeWidth={2.25} />
          )}
          {assignee ? assignee.name || assignee.email?.split("@")[0] : "Assign"}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className={cn(
          "w-[200px] rounded-[13px] border-[2px] border-black bg-white p-1.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
          "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.9)]",
        )}
      >
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] font-medium",
            "text-black/50 transition-colors duration-150 hover:bg-black/[0.06]",
            "dark:text-[#EDE7DD]/50 dark:hover:bg-[#EDE7DD]/10",
            !value && "bg-black/[0.05] dark:bg-[#EDE7DD]/[0.08]",
          )}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 dark:bg-[#EDE7DD]/15">
            <User className="h-2.5 w-2.5" />
          </span>
          Unassigned
        </button>

        <div className="max-h-[180px] overflow-y-auto os-scroll">
          {people.map(([id, person]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onChange(id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] font-medium text-black dark:text-[#EDE7DD]",
                "transition-colors duration-150 hover:bg-black/[0.06] dark:hover:bg-[#EDE7DD]/10",
                value === id && "bg-black/[0.05] dark:bg-[#EDE7DD]/[0.08]",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-black/70",
                  tintFor(id),
                )}
              >
                {initialsFor(person.name || person.email || "?")}
              </span>
              <span className="truncate">{person.name || person.email}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
