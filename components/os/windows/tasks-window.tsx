"use client";

import { initialsFor, tintFor } from "@/components/messaging/chrome";
import type { AuthorDirectory } from "@/components/messaging/message-list";
import { OsConfirmDialog } from "@/components/os/os-confirm-dialog";
import { AssigneePickerField, DatePickerField } from "@/components/os/windows/task-pickers";
import type { Workspace } from "@/lib/os/use-org-data";
import { cn } from "@/lib/utils";
import { Check, CircleSlash, Loader2, Plus, Trash2, type ListTodo } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/** Shape returned by /api/tasks — `tasks` joined to its workspace. */
type Task = {
  id: string;
  content?: string | null;
  title?: string | null;
  is_completed: boolean;
  due_date?: string | null;
  workspace_id: string;
  assignee_id?: string | null;
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
export function TasksWindow({
  workspaces,
  directory,
  defaultWorkspaceId,
}: {
  workspaces: Workspace[];
  directory: AuthorDirectory;
  defaultWorkspaceId?: string | null;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [draft, setDraft] = useState("");
  const [draftExpanded, setDraftExpanded] = useState(false);
  const [draftDueDate, setDraftDueDate] = useState<string | null>(null);
  const [draftAssigneeId, setDraftAssigneeId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  /** Patches a task on the server and merges the result locally — a completed
   *  task is removed outright since /api/tasks only ever returns outstanding
   *  ones, so there is nothing to "un-strike" on the next load. */
  const patch = async (task: Task, updates: Partial<Pick<Task, "is_completed" | "due_date" | "assignee_id">>) => {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: task.id, ...updates }),
    });
    if (!res.ok) {
      setError("Could not update that task.");
      return;
    }
    if (updates.is_completed) {
      setTasks((prev) => (prev ? prev.filter((t) => t.id !== task.id) : prev));
      setOpenId((id) => (id === task.id ? null : id));
    } else {
      setTasks((prev) => (prev ? prev.map((t) => (t.id === task.id ? { ...t, ...updates } : t)) : prev));
    }
  };

  const remove = async (task: Task) => {
    const res = await fetch(`/api/tasks?id=${task.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete that task.");
      return;
    }
    setTasks((prev) => (prev ? prev.filter((t) => t.id !== task.id) : prev));
    setPendingDelete(null);
    setOpenId((id) => (id === task.id ? null : id));
  };

  const workspaceId = defaultWorkspaceId ?? workspaces[0]?.id ?? null;

  const addTask = async () => {
    const content = draft.trim();
    if (!content || !workspaceId || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          workspaceId,
          due_date: draftDueDate,
          assignee_id: draftAssigneeId,
        }),
      });
      if (!res.ok) {
        setError("Could not create that task.");
        return;
      }
      const created = await res.json();
      setTasks((prev) => [created, ...(prev ?? [])]);
      setDraft("");
      setDraftDueDate(null);
      setDraftAssigneeId(null);
      setDraftExpanded(false);
      inputRef.current?.focus();
    } finally {
      setCreating(false);
    }
  };

  if (error && !tasks) {
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

  return (
    <div className="flex h-full flex-col">
      {/* New-task composer. workspaceId falls back to the first workspace, matching
          the workspace picker's own default — a task has to belong to somewhere.
          Expands on focus so due date and assignee are set before creation, not
          bolted on afterward through a second click into the task. */}
      <div className="shrink-0 border-b-[1.5px] border-black/[0.08] px-3 py-2.5 dark:border-[#EDE7DD]/[0.08]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setDraftExpanded(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addTask();
            }}
            placeholder={workspaceId ? "Add a task…" : "Create a workspace first"}
            disabled={!workspaceId}
            className={cn(
              "min-w-0 flex-1 rounded-[8px] bg-black/[0.04] px-2.5 py-1.5 text-[12.5px] text-black outline-none",
              "placeholder:text-black/35 focus:bg-black/[0.07]",
              "dark:bg-[#EDE7DD]/[0.06] dark:text-[#EDE7DD] dark:placeholder:text-[#EDE7DD]/35 dark:focus:bg-[#EDE7DD]/[0.1]",
            )}
          />
          <button
            type="button"
            onClick={() => void addTask()}
            disabled={!draft.trim() || !workspaceId || creating}
            aria-label="Add task"
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[#FBBF24] text-black",
              "transition-opacity duration-150 hover:opacity-85 disabled:opacity-30",
            )}
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />}
          </button>
        </div>

        {draftExpanded && (
          <div className="mt-2 flex items-center gap-1.5">
            <DatePickerField value={draftDueDate} onChange={setDraftDueDate} />
            <AssigneePickerField value={draftAssigneeId} onChange={setDraftAssigneeId} directory={directory} />
          </div>
        )}
      </div>

      {tasks.length === 0 ? (
        <Message icon={Check} title="Nothing outstanding" body="Add one above, or it'll show up from your notes." />
      ) : (
        <div className="flex-1 overflow-y-auto os-scroll">
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
                    const label = task.content || task.title || "Untitled task";
                    const assignee = task.assignee_id ? directory[task.assignee_id] : undefined;
                    const isOpen = openId === task.id;

                    return (
                      <li key={task.id}>
                        <div
                          className={cn(
                            "group rounded-[9px] px-2.5 py-2",
                            "transition-colors duration-150 hover:bg-black/[0.04] dark:hover:bg-[#EDE7DD]/[0.06]",
                            isOpen && "bg-black/[0.04] dark:bg-[#EDE7DD]/[0.06]",
                          )}
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() => void patch(task, { is_completed: true })}
                              aria-label={`Complete ${label}`}
                              className={cn(
                                "mt-[1px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px]",
                                "ring-[1.5px] ring-inset transition-colors duration-150",
                                "ring-black/25 hover:bg-[#8FB8AC] hover:ring-[#8FB8AC] dark:ring-[#EDE7DD]/25",
                              )}
                            />

                            <button
                              type="button"
                              onClick={() => setOpenId(isOpen ? null : task.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-[12.5px] font-medium leading-snug text-black dark:text-[#EDE7DD]">
                                {label}
                              </p>
                              {task.workspaces?.owner_name && (
                                <p className="mt-0.5 truncate text-[10px] text-black/35 dark:text-[#EDE7DD]/35">
                                  {task.workspaces.owner_name}
                                </p>
                              )}
                            </button>

                            {assignee && (
                              <span
                                title={assignee.name || assignee.email}
                                className={cn(
                                  "mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8.5px] font-bold text-black/70",
                                  tintFor(task.assignee_id ?? null),
                                )}
                              >
                                {initialsFor(assignee.name || assignee.email || "?")}
                              </span>
                            )}

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

                          {isOpen && (
                            <div className="mt-2 flex items-center gap-1.5 pl-[26px]">
                              <DatePickerField
                                value={task.due_date ?? null}
                                onChange={(iso) => void patch(task, { due_date: iso })}
                              />
                              <AssigneePickerField
                                value={task.assignee_id ?? null}
                                onChange={(id) => void patch(task, { assignee_id: id })}
                                directory={directory}
                              />

                              <button
                                type="button"
                                onClick={() => setPendingDelete(task)}
                                aria-label="Delete task"
                                className={cn(
                                  "ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-[#B4636A]",
                                  "transition-colors duration-150 hover:bg-[#E8B4B8]/25 dark:text-[#E8B4B8]",
                                )}
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            </div>
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
      )}

      <OsConfirmDialog
        open={pendingDelete !== null}
        title="Delete task?"
        body={`"${pendingDelete?.content || pendingDelete?.title || "This task"}" will be gone for everyone.`}
        confirmLabel="Delete"
        onConfirm={() => pendingDelete && void remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
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
