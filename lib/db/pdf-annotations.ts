import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AnnotationKind = "highlight" | "draw" | "note";

/** Normalised 0..1 page-space geometry. Shape depends on the annotation kind. */
export type AnnotationGeometry =
  | { rects: { x: number; y: number; w: number; h: number }[] }
  | { points: [number, number][] }
  | { x: number; y: number };

export type PdfAnnotation = {
  id: string;
  file_id: string;
  page: number;
  kind: AnnotationKind;
  color: string;
  geometry: AnnotationGeometry;
  body: string | null;
  created_by: string | null;
  author_name: string;
  created_at: string;
};

/** Every annotation on one file. RLS limits this to files the caller can see. */
export async function listAnnotations(fileId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("pdf_annotations")
    .select("*")
    .eq("file_id", fileId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PdfAnnotation[];
}

export async function createAnnotation(input: {
  fileId: string;
  page: number;
  kind: AnnotationKind;
  color: string;
  geometry: AnnotationGeometry;
  body?: string | null;
  createdBy: string;
  authorName: string;
}) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("pdf_annotations")
    .insert({
      file_id: input.fileId,
      page: input.page,
      kind: input.kind,
      color: input.color,
      geometry: input.geometry,
      body: input.body ?? null,
      created_by: input.createdBy,
      author_name: input.authorName,
    })
    .select()
    .single();

  if (error) throw error;
  return data as PdfAnnotation;
}

/**
 * Deletes one annotation.
 *
 * No author check here: the RLS policy allows a delete only when
 * created_by = auth.uid(), so a request for someone else's annotation
 * removes zero rows rather than needing a second lookup to reject it.
 */
export async function deleteAnnotation(id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("pdf_annotations").delete().eq("id", id);
  if (error) throw error;
}
