import { createSupabaseServerClient } from "@/lib/supabase/server";

export type WhiteboardScope = "organization" | "workspace";

/** One drawn element. Kept deliberately loose — the canvas owns the shape. */
export type SceneElement = {
  id: string;
  type: "path" | "rect" | "ellipse" | "arrow" | "text";
  color: string;
  width: number;
  points?: number[][];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  author?: string;
};

export type Scene = { elements: SceneElement[] };

export type Whiteboard = {
  id: string;
  scope: WhiteboardScope;
  organization_id: string;
  workspace_id: string | null;
  name: string;
  scene: Scene;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  archived_at: string | null;
};

/** Every board the caller can open in one organisation. RLS does the filtering. */
export async function listWhiteboards(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("whiteboards")
    .select("id, scope, organization_id, workspace_id, name, created_at, updated_at")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Whiteboard[];
}

export async function getWhiteboard(id: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from("whiteboards").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data as Whiteboard | null;
}

/**
 * The single board for a container, created on first open.
 *
 * There is exactly one organisation board and one board per workspace — the
 * unique indexes in migration 015 enforce that, so this can never produce a
 * second. Delegates to the get_or_create_whiteboard() function rather than
 * doing select-then-insert here, because two clients opening a board at the
 * same moment race, and resolving that inside one statement in the database is
 * both simpler and correct.
 */
export async function getOrCreateWhiteboard({
  scope,
  organizationId,
  workspaceId,
}: {
  scope: WhiteboardScope;
  organizationId: string;
  workspaceId?: string | null;
}) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_or_create_whiteboard", {
    p_scope: scope,
    p_org_id: organizationId,
    p_workspace_id: scope === "workspace" ? workspaceId : null,
  });

  if (error) throw error;
  return data as Whiteboard;
}

/**
 * Replaces the stored scene.
 *
 * A whole-document write rather than a patch: the canvas already holds the
 * authoritative element list, live edits travel over broadcast, and this is
 * the periodic snapshot. Merging partial writes here would mean resolving
 * conflicts twice, once in the canvas and once in the database.
 */
export async function saveScene(id: string, scene: Scene, updatedBy: string) {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("whiteboards")
    .update({ scene, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}
