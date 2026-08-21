import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FileKind = "pdf" | "image" | "audio" | "video";

export type OrgFile = {
  id: string;
  organization_id: string;
  name: string;
  kind: FileKind;
  content_type: string;
  size_bytes: number;
  blob_url: string;
  uploaded_by: string | null;
  created_at: string;
};

/** Every file the caller can see in one organisation, newest first. RLS does the member check. */
export async function listOrgFiles(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("org_files")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as OrgFile[];
}

/** The org's cap and its current usage, read together so callers can enforce the limit in one round trip. */
export async function getFileUsage(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const [{ data: org, error: orgError }, { count, error: countError }] = await Promise.all([
    supabase.from("organizations").select("file_limit").eq("id", organizationId).single(),
    supabase.from("org_files").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);

  if (orgError) throw orgError;
  if (countError) throw countError;

  return { used: count ?? 0, limit: org?.file_limit ?? 10 };
}

export async function createOrgFile(input: {
  organizationId: string;
  name: string;
  kind: FileKind;
  contentType: string;
  sizeBytes: number;
  blobUrl: string;
  uploadedBy: string;
}) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("org_files")
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      kind: input.kind,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      blob_url: input.blobUrl,
      uploaded_by: input.uploadedBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data as OrgFile;
}

/** Row lookup ahead of a delete, so the route can also remove the blob it points to. */
export async function getOrgFile(id: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from("org_files").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data as OrgFile | null;
}

export async function deleteOrgFile(id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("org_files").delete().eq("id", id);
  if (error) throw error;
}
