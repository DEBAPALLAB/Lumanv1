export type NoteVisibilityMode = "public" | "hierarchy" | "specific";

export type Note = {
  id: string;
  workspace_id: string;
  title: string;
  template_type: string;
  content: unknown; // Tiptap JSON document
  tags: string[];
  due_date: string | null;
  visibility_mode: NoteVisibilityMode;
  minimum_visible_role_level: number | null;
  specific_role_ids: string[] | null;
  created_by_role_level: number | null;
  created_at: string;
};

// Shape returned by list endpoints (api/notes GET) — a narrower column set
// than the full row, matching the source app's select().
export type NoteListItem = Pick<Note, "id" | "workspace_id" | "title" | "created_at" | "tags" | "due_date">;
