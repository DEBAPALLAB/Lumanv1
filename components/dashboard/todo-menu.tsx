"use client";

import { CheckSquare, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Task as SharedTask } from "@/types/task";

type Task = Pick<SharedTask, "id" | "content" | "is_completed" | "workspace_id" | "created_at">;

export function TodoMenu({ workspaceId }: { workspaceId?: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"workspace" | "organization">("workspace");

  const fetchTasks = async () => {
    setLoading(true);
    try {
      // Fetch all tasks for the user (Organization view)
      // If we only wanted workspace tasks, we'd pass workspaceId param
      // But we want to support switching views, so fetching all is easier if volume is low
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (err) {
      console.error("Failed to fetch tasks", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchTasks();
    }
  }, [open]);

  const filteredTasks = tasks.filter((t) => {
    if (view === "workspace") {
      return t.workspace_id === workspaceId;
    }
    return true;
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground transition" aria-label="Open Todo Menu">
          <CheckSquare className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex border-b">
          <button
            onClick={() => setView("workspace")}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              view === "workspace"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Workspace
          </button>
          <button
            onClick={() => setView("organization")}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              view === "organization"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Tasks
          </button>
        </div>

        <div className="p-4 max-h-[300px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-4">No tasks found.</div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2 text-sm">
                  <div className="mt-0.5 h-4 w-4 rounded border border-primary/50 text-primary opacity-50" />
                  <span className="flex-1 break-words">{task.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
