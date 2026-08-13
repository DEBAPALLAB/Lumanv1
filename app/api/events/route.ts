import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { createEvent, getEvents } from "@/lib/db/events";
import type { NextRequest } from "next/server";

// GET /api/events?workspaceId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    const events = await getEvents(workspaceId || undefined);
    return apiSuccess(events);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to fetch events", 500);
  }
}

// POST /api/events
export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const body = await req.json();
    const { title, description, start_time, end_time, all_day, event_type, workspace_id, note_id, created_by } = body;

    if (!title || !start_time) {
      return apiError("Title and start_time are required", 400);
    }

    // An event with no workspace belongs to no organisation, so no access rule
    // can ever grant anyone sight of it again — it becomes an orphan row.
    // The UI's workspace picker is already `required`; this closes the one path
    // that slips past it (an organisation with no workspaces yet) with a clear
    // message, rather than the opaque row-level-security rejection it would
    // otherwise produce. Matches /api/tasks, which has always required one.
    if (!workspace_id) {
      return apiError("A workspace is required to create an event", 400);
    }

    const event = await createEvent({
      title,
      description,
      start_time,
      end_time,
      all_day: all_day || false,
      event_type: event_type || "event",
      workspace_id,
      note_id,
      created_by,
      is_completed: false,
    });

    return apiSuccess(event, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to create event", 500);
  }
}
