"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Task as SharedTask } from "@/types/task";

export type Task = Pick<SharedTask, "id" | "content" | "is_completed" | "workspace_id" | "created_at">;

export function MyTasksWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchTasks() {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      } else {
        console.error("Failed to fetch tasks");
        toast.error("Failed to load tasks");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error loading tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTasks();
  }, []);

  async function toggleTask(task: Task) {
    const newStatus = !task.is_completed;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_completed: newStatus } : t)));

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: task.workspace_id,
          tasks: [{ id: task.id, content: task.content, checked: newStatus }],
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update");
      }
    } catch (err) {
      toast.error("Failed to update task");
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_completed: !newStatus } : t)));
    }
  }

  const activeTasks = tasks.filter((t) => !t.is_completed);
  const completedTasks = tasks.filter((t) => t.is_completed);

  return (
    <div className="flex flex-col bg-background border-brutal-thick shadow-brutal overflow-hidden">
      <div className="p-8 pb-4 border-b-4 border-foreground sticky top-0 bg-background z-10 flex justify-between items-center">
        <h2 className="font-black uppercase text-2xl tracking-tight">MY TASKS</h2>
      </div>

      <div className="p-4 flex-1 overflow-y-auto max-h-[200px]">
        {loading ? (
          <div className="flex items-center gap-2 text-sm font-bold uppercase animate-pulse">
            <Loader2 className="h-4 w-4 animate-spin" />
            LOADING TASKS...
          </div>
        ) : (
          <div className="space-y-8">
            {tasks.length === 0 && (
              <div className="border-brutal-sm p-6 bg-muted/50 text-center">
                <p className="text-sm font-bold uppercase opacity-60">NO TASKS FOUND</p>
              </div>
            )}

            {activeTasks.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-black uppercase tracking-widest opacity-50 mb-4">TO DO</h3>
                <div className="grid gap-3">
                  {activeTasks.map((task) => (
                    <TaskItem key={task.id || Math.random()} task={task} onToggle={() => toggleTask(task)} />
                  ))}
                </div>
              </div>
            )}

            {completedTasks.length > 0 && (
              <div className="space-y-3 pt-6 border-t-2 border-dashed border-foreground/20">
                <h3 className="text-sm font-black uppercase tracking-widest opacity-50 mb-4">COMPLETED</h3>
                <div className="grid gap-3 opacity-60">
                  {completedTasks.map((task) => (
                    <TaskItem key={task.id || Math.random()} task={task} onToggle={() => toggleTask(task)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskItem({ task, onToggle }: { task: Task; onToggle: () => void }) {
  return (
    <div className="group flex items-start gap-3 p-3 border-brutal-sm bg-card hover:-translate-y-0.5 hover:shadow-brutal transition-all cursor-pointer" onClick={onToggle}>
      <button type="button" className="mt-0.5 text-foreground group-hover:text-accent transition-colors">
        {task.is_completed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="flex-1">
        <p className={`font-bold text-sm leading-snug ${task.is_completed ? "line-through opacity-50" : ""}`}>
          {task.content}
        </p>
        {task.workspace_id && (
          <p className="text-[10px] font-mono uppercase opacity-40 mt-1">WS: {task.workspace_id.slice(0, 8)}</p>
        )}
      </div>
    </div>
  );
}
