"use client";

import { X } from "lucide-react";
import { useState, useEffect } from "react";

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
  noteId?: string; // Optional: Link event to a specific note
  onEventCreated?: () => void;
  workspaces?: { id: string; owner_name: string }[];
}

export function EventModal({ isOpen, onClose, workspaceId, noteId, onEventCreated, workspaces = [] }: EventModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [eventType, setEventType] = useState<"event" | "reminder" | "task">("event");
  const [loading, setLoading] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(workspaceId || "");

  useEffect(() => {
    if (workspaceId) {
      setSelectedWorkspaceId(workspaceId);
    }
  }, [workspaceId]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const start_time = allDay
        ? new Date(startDate).toISOString()
        : new Date(`${startDate}T${startTime}`).toISOString();

      const end_time = endDate && !allDay ? new Date(`${endDate}T${endTime || "23:59"}`).toISOString() : undefined;

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          start_time,
          end_time,
          all_day: allDay,
          event_type: eventType,
          workspace_id: selectedWorkspaceId || undefined,
          note_id: noteId, // Link to note if provided
        }),
      });

      if (res.ok) {
        onEventCreated?.();
        handleClose();
      } else {
        alert("Failed to create event");
      }
    } catch (error) {
      console.error("Error creating event:", error);
      alert("Error creating event");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setTitle("");
    setDescription("");
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
    setAllDay(false);
    setEventType("event");
    setSelectedWorkspaceId(workspaceId || "");
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-background border-brutal-thick shadow-brutal-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b-4 border-foreground">
          <h2 className="text-3xl font-black uppercase">CREATE EVENT</h2>
          <button type="button" onClick={handleClose} className="p-3 border-brutal hover-brutal bg-background">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Workspace Selection (only if workspaceId not pre-provided) */}
          {!workspaceId && workspaces && workspaces.length > 0 && (
            <div className="space-y-3">
              <label className="block text-sm font-black uppercase tracking-wider">WORKSPACE *</label>
              <select
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                required
                className="w-full border-brutal px-6 py-4 text-lg font-bold uppercase bg-background focus:outline-none focus:shadow-brutal cursor-pointer text-foreground"
              >
                <option value="">SELECT A WORKSPACE</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.owner_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-3">
            <label className="block text-sm font-black uppercase tracking-wider">TITLE *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="EVENT TITLE"
              className="w-full border-brutal px-6 py-4 text-lg font-bold uppercase bg-background placeholder:text-muted-foreground placeholder:font-bold focus:outline-none focus:shadow-brutal"
            />
          </div>

          {/* Description */}
          <div className="space-y-3">
            <label className="block text-sm font-black uppercase tracking-wider">DESCRIPTION</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="EVENT DESCRIPTION"
              rows={3}
              className="w-full border-brutal px-6 py-4 text-lg font-bold bg-background placeholder:text-muted-foreground placeholder:font-bold focus:outline-none focus:shadow-brutal resize-none"
            />
          </div>

          {/* Event Type */}
          <div className="space-y-3">
            <label className="block text-sm font-black uppercase tracking-wider">TYPE</label>
            <div className="flex gap-4">
              {(["event", "reminder", "task"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEventType(type)}
                  className={`px-6 py-3 text-sm font-black uppercase border-brutal hover-brutal ${
                    eventType === type ? "bg-accent text-accent-foreground" : "bg-background"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* All Day */}
          <div className="flex items-center gap-4">
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-6 h-6 border-brutal"
            />
            <label htmlFor="allDay" className="text-sm font-black uppercase tracking-wider">
              ALL DAY EVENT
            </label>
          </div>

          {/* Start Date/Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="block text-sm font-black uppercase tracking-wider">START DATE *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full border-brutal px-6 py-4 text-lg font-bold uppercase bg-background focus:outline-none focus:shadow-brutal"
              />
            </div>
            {!allDay && (
              <div className="space-y-3">
                <label className="block text-sm font-black uppercase tracking-wider">START TIME *</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required={!allDay}
                  className="w-full border-brutal px-6 py-4 text-lg font-bold uppercase bg-background focus:outline-none focus:shadow-brutal"
                />
              </div>
            )}
          </div>

          {/* End Date/Time */}
          {!allDay && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="block text-sm font-black uppercase tracking-wider">END DATE</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border-brutal px-6 py-4 text-lg font-bold uppercase bg-background focus:outline-none focus:shadow-brutal"
                />
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-black uppercase tracking-wider">END TIME</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full border-brutal px-6 py-4 text-lg font-bold uppercase bg-background focus:outline-none focus:shadow-brutal"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-8 py-4 text-lg font-black uppercase border-brutal hover-brutal bg-background"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-8 py-4 text-lg font-black uppercase border-brutal hover-brutal bg-accent text-accent-foreground disabled:opacity-50"
            >
              {loading ? "CREATING..." : "CREATE EVENT"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
