"use client";

import AppShell from "@/components/layouts/app-shell";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { toast } from "sonner";
import type { Task as SharedTask } from "@/types/task";

type Task = Pick<SharedTask, "id" | "content" | "is_completed" | "workspace_id" | "created_at"> & {
  workspaces?: { owner_name: string };
};

function TasksContent() {
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Middleware already blocks unauthenticated access to /dashboard/*, so
  // this page can assume an authenticated context by the time it mounts —
  // no client-side session check/redirect needed here.

  useEffect(() => {
    if (orgSlug) {
      sessionStorage.setItem("selected_org_slug", orgSlug);
    }
  }, [orgSlug]);

  async function fetchTasks() {
    try {
      const res = await fetch(`/api/tasks${orgSlug ? `?org=${orgSlug}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      } else {
        toast.error("Failed to load tasks");
      }
    } catch {
      toast.error("Error loading tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTasks();
  }, [orgSlug]);

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
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      toast.error("Failed to update task");
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_completed: !newStatus } : t)));
    }
  }

  const activeTasks = tasks.filter((t) => !t.is_completed);
  const completedTasks = tasks.filter((t) => t.is_completed);

  return (
    <AppShell>
      <div className="relative min-h-screen bg-[#FDFBF7] dark:bg-zinc-950 overflow-hidden pt-16 lg:pt-20">
        {/* Technical grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] opacity-70 pointer-events-none z-0" />

        {/* Ambient Glows */}
        <div className="pointer-events-none absolute top-12 left-1/4 h-96 w-96 rounded-full bg-[#FBBF24]/10 blur-[120px] dark:opacity-20 z-0" />
        <div className="pointer-events-none absolute bottom-24 right-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px] dark:opacity-20 z-0" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-4 pb-8 md:pt-6 md:pb-12 z-10">
          {/* Header */}
          <div className="mb-12">
            <h1 className="font-black uppercase leading-none border-l-8 border-foreground pl-6 text-4xl sm:text-5xl md:text-6xl">
              MY TASKS
            </h1>
            <p className="pl-6 mt-4 text-base sm:text-lg font-bold uppercase opacity-50">
              {activeTasks.length} PENDING · {completedTasks.length} COMPLETED
            </p>
          </div>

          {loading ? (
            <div className="flex items-center gap-4 text-lg font-bold uppercase animate-pulse border-brutal-thick p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              LOADING TASKS...
            </div>
          ) : tasks.length === 0 ? (
            <div className="border-brutal-thick p-16 bg-muted/30 text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 mx-auto opacity-30" />
              <h2 className="text-3xl font-black uppercase">ALL CLEAR</h2>
              <p className="text-lg font-bold uppercase opacity-50">NO TASKS FOUND ACROSS ANY WORKSPACE</p>
            </div>
          ) : (
            <div className="space-y-12">
              {/* Active Tasks */}
              {activeTasks.length > 0 && (
                <div>
                  <h2 className="text-2xl font-black uppercase border-b-4 border-foreground pb-4 mb-8 flex items-center gap-4">
                    <span className="w-3 h-3 bg-foreground inline-block" />
                    TO DO
                    <span className="ml-auto text-xl opacity-50">{activeTasks.length}</span>
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    {activeTasks.map((task) => (
                      <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Completed Tasks */}
              {completedTasks.length > 0 && (
                <div>
                  <h2 className="text-2xl font-black uppercase border-b-4 border-foreground pb-4 mb-8 flex items-center gap-4 opacity-60">
                    <span className="w-3 h-3 bg-foreground inline-block" />
                    COMPLETED
                    <span className="ml-auto text-xl">{completedTasks.length}</span>
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2 opacity-60">
                    {completedTasks.map((task) => (
                      <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  return (
    <div
      className="group flex items-start gap-4 p-6 border-brutal-thick bg-card hover:shadow-brutal hover:-translate-y-0.5 transition-all cursor-pointer"
      onClick={onToggle}
    >
      <button type="button" className="mt-0.5 shrink-0 text-foreground group-hover:text-accent transition-colors">
        {task.is_completed ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`font-black text-lg uppercase leading-snug ${task.is_completed ? "line-through opacity-50" : ""}`}>
          {task.content}
        </p>
        {task.workspaces?.owner_name && (
          <p className="text-xs font-mono uppercase opacity-40 mt-2 border-l-2 border-foreground/20 pl-2">
            WS: {task.workspaces.owner_name}
          </p>
        )}
      </div>
    </div>
  );
}

export default function MyTasksPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>}>
      <TasksContent />
    </Suspense>
  );
}
