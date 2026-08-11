export type Task = {
  id: string;
  content: string;
  is_completed: boolean;
  due_date: string | null;
  workspace_id: string;
  // No fk constraint by design (source migration note: "to avoid schema
  // issues") — validate at the application layer if this is ever trusted.
  assignee_id: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
};
