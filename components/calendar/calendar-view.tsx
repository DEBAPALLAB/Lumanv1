"use client";

import { useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import type { NoteListItem } from "@/types/note";
import type { Task as SharedTask } from "@/types/task";

type Note = Pick<NoteListItem, "id" | "title" | "due_date" | "workspace_id">;
type Task = Pick<SharedTask, "id" | "content" | "due_date" | "workspace_id" | "is_completed">;

export function CalendarView() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params?.workspaceId as string;

  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [notesRes, tasksRes] = await Promise.all([
          fetch(`/api/notes?workspaceId=${workspaceId}`),
          fetch(`/api/tasks?workspaceId=${workspaceId}`),
        ]);

        if (notesRes.ok) {
          setNotes(await notesRes.json());
        }
        if (tasksRes.ok) {
          setTasks(await tasksRes.json());
        }
      } catch (error) {
        console.error("Failed to fetch calendar data", error);
      } finally {
        setLoading(false);
      }
    }

    if (workspaceId) {
      fetchData();
    }
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group items by date
  // We'll use a simple modifier to highlight days with events
  // And maybe a footer or side panel to show events for selected day
  // Or render content in the day cell (custom component) via `components` prop (DayContent)
  // But react-day-picker simple usage is modifiers.

  const daysWithEvents = [
    ...notes.filter((n) => n.due_date).map((n) => new Date(n.due_date!)),
    ...tasks.filter((t) => t.due_date).map((t) => new Date(t.due_date!)),
  ];

  const handleDayClick = (day: Date) => {
    // Filter items for this day
    const dateStr = format(day, "yyyy-MM-dd");
    // Just logging for now or maybe we show a list below
    console.log("Clicked day", dateStr);
  };

  // Custom day content to show dots or indicators
  const modifiers = {
    hasEvent: daysWithEvents,
  };

  const modifiersStyles = {
    hasEvent: {
      fontWeight: "bold",
      color: "var(--primary)", // Assuming css variable or just 'blue'
    },
  };

  return (
    <div className="flex flex-col md:flex-row gap-8 p-6">
      <div className="border rounded-lg p-4 bg-card shadow-sm inline-block">
        <DayPicker
          mode="single"
          modifiers={modifiers}
          modifiersStyles={modifiersStyles}
          onDayClick={handleDayClick}
          footer={<div className="mt-4 text-sm text-muted-foreground">Click a date to view items.</div>}
        />
      </div>

      <div className="flex-1">
        <h2 className="text-xl font-semibold mb-4">Events</h2>
        <div className="space-y-4">
          {/* List all upcoming events or selected day events.
                   For now, let's list all items with dates sorted.
               */}
          {[...notes, ...tasks]
            .filter((item) => item.due_date)
            .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
            .map((item: any) => (
              <div
                key={item.id}
                className="p-3 border rounded-lg bg-card hover:bg-muted transition flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">{item.title || item.content}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(item.due_date), "PPP")}</div>
                </div>
                <div className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground">
                  {item.title ? "Note" : "Task"}
                </div>
              </div>
            ))}

          {[...notes, ...tasks].filter((i) => i.due_date).length === 0 && (
            <div className="text-muted-foreground text-sm">No scheduled events found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
