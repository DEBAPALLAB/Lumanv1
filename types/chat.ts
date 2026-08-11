// Column list confirmed against a live row in the production Supabase
// project during Phase 0 (this table's DDL was never captured in any
// migration file in the source repo).
export type ChatMessage = {
  id: string;
  note_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};
