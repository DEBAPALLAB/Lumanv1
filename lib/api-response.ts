import { NextResponse } from "next/server";

/**
 * One error shape for every API route: always `{ error }` with the correct
 * status code. Never leaks stack traces or debug internals (source app's
 * `api/workspaces` POST did on error), and callers must not swallow real
 * failures into a 200 with empty data (source app's `api/notes` GET and
 * `api/chat/[noteId]` GET both did — silently hiding failures from callers).
 */
export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
