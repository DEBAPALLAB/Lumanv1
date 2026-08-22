import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Task } from "@/types/task";

/**
 * Extracted from the source app's app/api/tasks/route.ts, which queried the
 * `tasks` table directly inline. Consolidated here so the route becomes a
 * thin handler, matching the pattern of notes.ts / workspaces.ts.
 */

export type TaskUpsertInput = {
  id?: string;
  content: string;
  checked: boolean;
};

/** Incomplete tasks for a specific workspace. */
export async function getWorkspaceTasks(workspaceId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*, workspaces(owner_name)")
    .eq("is_completed", false)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
  return data;
}

/** Incomplete tasks across a set of workspace ids (e.g. all workspaces in an org). */
export async function getTasksForWorkspaces(workspaceIds: string[]) {
  if (workspaceIds.length === 0) return [];

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*, workspaces(owner_name)")
    .eq("is_completed", false)
    .in("workspace_id", workspaceIds);

  if (error) throw error;
  return data;
}

/** Upsert a batch of tasks (from the note editor's todo-list sync) for a workspace. */
export async function upsertTasks(tasks: TaskUpsertInput[], workspaceId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("tasks")
    .upsert(
      tasks.map((task) => {
        const payload: Record<string, unknown> = {
          content: task.content,
          is_completed: task.checked,
          workspace_id: workspaceId,
        };
        // Only add ID if it exists and is valid UUID (simple check for truthy)
        if (task.id) {
          payload.id = task.id;
        }
        return payload;
      }),
    )
    .select();

  if (error) throw error;
  return data as Task[];
}

/** Creates a single task directly (GodMode's "New task" field), not tied to a note. */
export async function createTask(input: {
  content: string;
  workspaceId: string;
  dueDate?: string | null;
  assigneeId?: string | null;
}) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      content: input.content,
      workspace_id: input.workspaceId,
      due_date: input.dueDate ?? null,
      assignee_id: input.assigneeId ?? null,
      is_completed: false,
    })
    .select("*, workspaces(owner_name)")
    .single();

  if (error) throw error;
  return data;
}

/** Patches one task's completion, due date, or assignee. */
export async function updateTask(
  id: string,
  updates: { is_completed?: boolean; due_date?: string | null; assignee_id?: string | null; content?: string },
) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, workspaces(owner_name)")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTask(id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
