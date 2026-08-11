import { apiError, apiSuccess } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();

    return apiSuccess({ success: true });
  } catch (error) {
    return apiError("Failed to logout", 500);
  }
}
