import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ orgId: string; roleId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { orgId, roleId } = await params;
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.from("roles").delete().eq("id", roleId).eq("organization_id", orgId);

    if (error) {
      // Handles ON DELETE RESTRICT (users assigned) or hierarchy_level = 1 check gracefully
      return apiError(error.message, 400);
    }

    return apiSuccess({ success: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
