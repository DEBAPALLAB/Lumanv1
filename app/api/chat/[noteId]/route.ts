import { apiError, apiSuccess } from "@/lib/api-response";
import { getChatHistory } from "@/lib/db/chat";

export async function GET(_req: Request, { params }: { params: Promise<{ noteId: string }> }) {
  try {
    const { noteId } = await params;
    const data = await getChatHistory(noteId);
    return apiSuccess(data);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
