import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getNote(noteId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from("notes").select("*").eq("id", noteId).single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createNote({
  workspaceId,
  title,
  templateType,
  content,
  tags = [],
}: {
  workspaceId: string;
  title: string;
  templateType: string;
  content: any;
  tags?: string[];
}) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("notes")
    .insert({
      workspace_id: workspaceId,
      title,
      template_type: templateType,
      content,
      tags,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateNoteTags(noteId: string, tags: string[]) {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("notes").update({ tags }).eq("id", noteId);

  if (error) {
    throw error;
  }
}
