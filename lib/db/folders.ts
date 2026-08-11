import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WorkspaceFolder } from "@/types/workspace";

export async function createFolder(name: string, organizationId: string, color = "stone", creatorId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workspace_folders")
    .insert({
      name,
      organization_id: organizationId,
      color,
      created_by: creatorId,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as WorkspaceFolder;
}

export async function getFolders(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workspace_folders")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data as WorkspaceFolder[];
}

export async function deleteFolder(folderId: string) {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("workspace_folders").delete().eq("id", folderId);

  if (error) {
    throw error;
  }
}
