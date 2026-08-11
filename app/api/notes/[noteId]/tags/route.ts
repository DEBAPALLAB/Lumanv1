import { apiError, apiSuccess } from "@/lib/api-response";
import { updateNoteTags } from "@/lib/db/notes";

export async function PATCH(req: Request, { params }: { params: Promise<{ noteId: string }> }) {
  try {
    const { noteId } = await params;
    const { tags } = await req.json();

    if (!Array.isArray(tags)) {
      return apiError("Tags must be an array", 400);
    }

    await updateNoteTags(noteId, tags);

    return apiSuccess({ success: true, tags });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
