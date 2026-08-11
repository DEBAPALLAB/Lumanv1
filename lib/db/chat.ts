import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/types/chat";

/**
 * Extracted from the source app's app/api/chat/route.ts and
 * app/api/chat/[noteId]/route.ts, which queried `chat_messages` directly
 * inline. Consolidated here so both routes call into one module.
 */

export async function getChatHistory(noteId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function insertChatMessage(noteId: string, role: ChatMessage["role"], content: string) {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("chat_messages").insert({
    note_id: noteId,
    role,
    content,
  });

  if (error) throw error;
}
