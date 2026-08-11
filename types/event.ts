export type Event = {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  all_day: boolean;
  event_type: "event" | "reminder" | "task";
  is_completed: boolean;
  workspace_id?: string;
  note_id?: string;
  // Text, not a uuid fk to auth.users — inconsistent with every other
  // created_by/owner column in the schema, which are uuid fks. Kept as-is;
  // fixing the column type is a Phase 7 schema change, not attempted here.
  created_by?: string;
  created_at: string;
  updated_at: string;
};
