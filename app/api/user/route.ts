import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import type { NextRequest } from "next/server";

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { supabase } = session;

    const body = await req.json();
    const { fullName } = body;

    if (!fullName || typeof fullName !== "string" || fullName.trim().length === 0) {
      return apiError("Full name is required", 400);
    }

    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });

    if (error) {
      return apiError(error.message, 500);
    }

    return apiSuccess({ success: true, user: data.user });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
