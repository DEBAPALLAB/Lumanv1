"use client";

import { cn } from "@/lib/utils";
import { Check, CircleSlash, type ListTodo } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/**
 * Shape returned by /api/tasks — `tasks` joined to its workspace.
 *
 * The route filters on `is_completed = false`, so everything arriving here is
 * outstanding; there is no "done" section to render because done tasks never
 * reach the client.
 */
type Task = {
  id: string;
  content?: string | null;
  title?: string | null;
  is_completed: boolean;
  due_date?: string | null;
  workspace_id: string;
  workspaces?: { owner_name?: string } | null;
};

/** Midnight today, for bucketing due dates without time-of-day noise. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

type Bucket = "Overdue" | "Today" | "This week" | "Later" | "No date";

function bucketFor(due: string | null | undefined): Bucket {
  if (!due) return "No date";
  const today = startOfToday();
  const date = new Date(due);
  date.setHours(0, 0, 0, 0);

  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days <= 7) return "This week";
  return "Later";
}

const BUCKET_ORDER: Bucket[] = ["Overdue", "Today", "This week", "Later", "No date"];

const BUCKET_TINT: Record<Bucket, string> = {
  Overdue: "bg-[#E8B4B8]",
  Today: "bg-[#FBBF24]",
  "This week": "bg-[#8FB8AC]",
  Later: "bg-[#7FA5C4]",
  "No date": "bg-black/15 dark:bg-[#EDE7DD]/20",
};

/**
 * My tasks, open as a window.
 *
 * Grouped by when they are due rather than listed flat: an undifferentiated
 * list of thirty tasks tells you nothing about what to do next, which is the
 * only question this window exists to answer. Overdue sits at the top because
 * it is the one bucket that is already a problem.
 */
export function TasksWindow() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Optimistically completed ids, so a tick is instant. */
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/tasks");
        if (!res.ok) {
          if (!cancelled) setError("Could not load your tasks.");
          return;
        }
        const body = await res.json();
        if (!cancelled) setTasks(Array.isArray(body) ? body : []);
      } catch {
        if (!cancelled) setError("Could not load your tasks.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    if (!tasks) return [];
    const map = new Map<Bucket, Task[]>();
    for (const task of tasks) {
      const bucket = bucketFor(task.due_date);
      const list = map.get(bucket) ?? [];
      list.push(task);
      map.set(bucket, list);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, items: map.get(b) ?? [] }));
  }, [tasks]);

  if (error) {
    return <Message icon={CircleSlash} title={error} />;
  }

  if (!tasks) {
    return (
      <div className="space-y-2 p-4" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-11 rounded-[9px] bg-black/[0.05] animate-skeleton dark:bg-[#EDE7DD]/[0.07]"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return <Message icon={Check} title="Nothing outstanding" body="Tasks from your notes show up here." />;
  }

  const toggle = async (task: Task) => {
    // Optimistic: the row greys out and strikes through immediately, then
    // disappears on the next load. A tick that waits on a round trip feels
    // broken even when it is working.
    setCompleting((prev) => new Set(prev).add(task.id));
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: task.id, is_completed: true }),
      });
    } catch {
      setCompleting((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  return (
    <div className="h-full overflow-y-auto os-scroll">
      <div className="p-3">
        {grouped.map(({ bucket, items }) => (
          <section key={bucket} className="mb-4 last:mb-0">
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", BUCKET_TINT[bucket])} aria-hidden="true" />
              <h3
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.09em]",
                  bucket === "Overdue" ? "text-[#B4636A] dark:text-[#E8B4B8]" : "text-black/35 dark:text-[#EDE7DD]/35",
                )}
              >
                {bucket}
              </h3>
              <span className="text-[10px] font-semibold tabular-nums text-black/25 dark:text-[#EDE7DD]/25">
                {items.length}
              </span>
            </div>

            <ul className="space-y-1">
              {items.map((task) => {
                const done = completing.has(task.id);
                const label = task.content || task.title || "Untitled task";
                return (
                  <li key={task.id}>
                    <div
                      className={cn(
                        "group flex items-start gap-2.5 rounded-[9px] px-2.5 py-2",
                        "transition-colors duration-150 hover:bg-black/[0.04] dark:hover:bg-[#EDE7DD]/[0.06]",
                        done && "opacity-45",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void toggle(task)}
                        disabled={done}
                        aria-label={`Complete ${label}`}
                        className={cn(
                          "mt-[1px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px]",
                          "ring-[1.5px] ring-inset transition-colors duration-150",
                          done
                            ? "bg-[#8FB8AC] ring-[#8FB8AC]"
                            : "ring-black/25 hover:bg-black/[0.06] hover:ring-black/50 dark:ring-[#EDE7DD]/25",
                        )}
                      >
                        {done && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-[12.5px] font-medium leading-snug text-black dark:text-[#EDE7DD]",
                            done && "line-through",
                          )}
                        >
                          {label}
                        </p>
                        {task.workspaces?.owner_name && (
                          <p className="mt-0.5 truncate text-[10px] text-black/35 dark:text-[#EDE7DD]/35">
                            {task.workspaces.owner_name}
                          </p>
                        )}
                      </div>

                      {task.due_date && bucket !== "No date" && (
                        <span
                          className={cn(
                            "mt-[1px] shrink-0 text-[10px] font-semibold tabular-nums",
                            bucket === "Overdue"
                              ? "text-[#B4636A] dark:text-[#E8B4B8]"
                              : "text-black/30 dark:text-[#EDE7DD]/30",
                          )}
                        >
                          {new Date(task.due_date).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Message({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ListTodo;
  title: string;
  body?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-black/[0.05] dark:bg-[#EDE7DD]/[0.08]">
        <Icon className="h-5 w-5 text-black/30 dark:text-[#EDE7DD]/30" strokeWidth={2} />
      </div>
      <p className="mt-3 text-[13px] font-semibold text-black/55 dark:text-[#EDE7DD]/55">{title}</p>
      {body && <p className="mt-1 text-[11.5px] text-black/35 dark:text-[#EDE7DD]/35">{body}</p>}
    </div>
  );
}
