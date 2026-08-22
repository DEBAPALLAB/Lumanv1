"use client";

import { OsConfirmDialog } from "@/components/os/os-confirm-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Workspace } from "@/lib/os/use-org-data";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

export type CalEvent = {
  id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time?: string | null;
  all_day?: boolean;
  workspace_id?: string;
  workspaces?: { owner_name?: string } | null;
};

function splitDateTime(iso: string | null | undefined) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

const FIELD =
  "w-full rounded-[8px] bg-black/[0.05] px-2.5 py-1.5 text-[12.5px] text-black outline-none " +
  "placeholder:text-black/35 focus:bg-black/[0.08] dark:bg-[#EDE7DD]/[0.07] dark:text-[#EDE7DD] " +
  "dark:placeholder:text-[#EDE7DD]/35 dark:focus:bg-[#EDE7DD]/[0.12]";

const LABEL = "mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-black/40 dark:text-[#EDE7DD]/40";

/**
 * Create or edit a calendar event, styled to match the OS shell rather than
 * components/calendar/event-modal.tsx, whose brutalist look belongs to the
 * legacy /calendar page.
 */
export function CalendarEventModal({
  open,
  onClose,
  event,
  defaultDate,
  workspaces,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing; absent when creating a new event. */
  event?: CalEvent | null;
  /** yyyy-mm-dd to prefill the start date when creating from a selected day. */
  defaultDate?: string;
  workspaces: Workspace[];
  onSaved: (event: CalEvent) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);

    if (event) {
      const { date, time } = splitDateTime(event.start_time);
      const { time: endT } = splitDateTime(event.end_time);
      setTitle(event.title);
      setDescription(event.description ?? "");
      setStartDate(date);
      setStartTime(time);
      setEndTime(endT);
      setAllDay(Boolean(event.all_day));
      setWorkspaceId(event.workspace_id ?? "");
    } else {
      setTitle("");
      setDescription("");
      setStartDate(defaultDate ?? "");
      setStartTime("");
      setEndTime("");
      setAllDay(false);
      setWorkspaceId(workspaces[0]?.id ?? "");
    }
  }, [open, event, defaultDate, workspaces]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate || !workspaceId) return;

    setSaving(true);
    setError(null);
    try {
      const start_time = allDay ? new Date(`${startDate}T00:00`).toISOString() : new Date(`${startDate}T${startTime || "09:00"}`).toISOString();
      const end_time = !allDay && endTime ? new Date(`${startDate}T${endTime}`).toISOString() : undefined;

      const res = await fetch(event ? `/api/events/${event.id}` : "/api/events", {
        method: event ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          start_time,
          end_time,
          all_day: allDay,
          workspace_id: workspaceId,
        }),
      });

      if (!res.ok) {
        setError("Could not save that event.");
        return;
      }

      const saved = await res.json();
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    const res = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete that event.");
      return;
    }
    onDeleted(event.id);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent
          overlayClassName="bg-black/25 backdrop-blur-[1.5px]"
          className={cn(
            "max-w-md gap-0 rounded-[14px] border-[2.5px] border-black p-0",
            "bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
            "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.9)]",
          )}
        >
          <div className="px-5 pb-3 pt-5">
            <DialogTitle className="text-[15px] font-bold tracking-[-0.02em] text-black dark:text-[#EDE7DD]">
              {event ? "Edit event" : "New event"}
            </DialogTitle>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 px-5 pb-5">
            <div>
              <label className={LABEL}>Title</label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                required
                className={FIELD}
              />
            </div>

            <div>
              <label className={LABEL}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
                rows={2}
                className={cn(FIELD, "resize-none")}
              />
            </div>

            {workspaces.length > 0 && (
              <div>
                <label className={LABEL}>Workspace</label>
                <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} required className={FIELD}>
                  <option value="">Select a workspace</option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.owner_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cal-all-day"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded-[4px]"
              />
              <label htmlFor="cal-all-day" className="text-[12px] font-medium text-black/70 dark:text-[#EDE7DD]/70">
                All day
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className={LABEL}>Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className={FIELD} />
              </div>
              {!allDay && (
                <>
                  <div>
                    <label className={LABEL}>Start</label>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={FIELD} />
                  </div>
                  <div>
                    <label className={LABEL}>End</label>
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={FIELD} />
                  </div>
                </>
              )}
            </div>

            {error && <p className="text-[11.5px] font-medium text-[#B4636A] dark:text-[#E8B4B8]">{error}</p>}

            <div className="flex items-center gap-2 pt-1">
              {event && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete event"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-[7px] text-[#B4636A]",
                    "transition-colors duration-150 hover:bg-[#E8B4B8]/25 dark:text-[#E8B4B8]",
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(
                    "rounded-[7px] px-3 py-1.5 text-[12px] font-semibold text-black/60",
                    "transition-colors duration-150 hover:bg-black/[0.06]",
                    "dark:text-[#EDE7DD]/60 dark:hover:bg-[#EDE7DD]/10",
                  )}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !title.trim() || !startDate || !workspaceId}
                  className={cn(
                    "rounded-[7px] border-[2px] border-black bg-[#FBBF24] px-3.5 py-1.5 text-[12px] font-bold text-black",
                    "shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-[transform,box-shadow] duration-150",
                    "hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none disabled:opacity-40",
                    "dark:border-[#EDE7DD] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.9)]",
                  )}
                >
                  {saving ? "Saving…" : event ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <OsConfirmDialog
        open={confirmDelete}
        title="Delete event?"
        body={`"${event?.title ?? "This event"}" will be removed for everyone.`}
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
