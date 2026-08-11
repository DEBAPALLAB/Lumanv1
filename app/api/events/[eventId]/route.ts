import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { deleteEvent, getEventById, updateEvent } from "@/lib/db/events";
import type { NextRequest } from "next/server";

// GET /api/events/[eventId]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { eventId } = await params;
    const event = await getEventById(eventId);
    return apiSuccess(event);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to fetch event", 500);
  }
}

// PUT /api/events/[eventId]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { eventId } = await params;
    const body = await req.json();
    const event = await updateEvent(eventId, body);
    return apiSuccess(event);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to update event", 500);
  }
}

// DELETE /api/events/[eventId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { eventId } = await params;
    await deleteEvent(eventId);
    return apiSuccess({ success: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to delete event", 500);
  }
}
