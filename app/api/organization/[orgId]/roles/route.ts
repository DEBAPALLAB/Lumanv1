import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { orgId } = await params;
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("roles")
      .select("*")
      .eq("organization_id", orgId)
      .order("hierarchy_level", { ascending: true });

    if (error) {
      return apiError(error.message, 500);
    }

    return apiSuccess(data);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { orgId } = await params;
    const supabase = await createSupabaseServerClient();
    const { role_name, hierarchy_level } = await req.json();

    if (!role_name || hierarchy_level === undefined) {
      return apiError("Missing role_name or hierarchy_level", 400);
    }

    const { data, error } = await supabase
      .from("roles")
      .insert({
        organization_id: orgId,
        role_name,
        hierarchy_level,
      })
      .select()
      .single();

    if (error) {
      return apiError(error.message, 500);
    }

    return apiSuccess(data, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Internal server error", 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);

    const { orgId } = await params;
    const supabase = await createSupabaseServerClient();
    const body = await req.json();

    if (body.roles && Array.isArray(body.roles)) {
      // Reorder roles in one statement/transaction (see migration 018) so a
      // swap between two levels never trips the UNIQUE(organization_id,
      // hierarchy_level) constraint mid-batch the way independent
      // per-role updates did.
      const { data, error } = await supabase.rpc("reorder_roles", {
        p_org_id: orgId,
        p_roles: body.roles,
      });

      if (error) {
        return apiError(error.message ?? "Failed to reorder roles", 500);
      }

      return apiSuccess(data);
    }
    // Single role update
    const { roleId, role_name, hierarchy_level } = body;

    if (!roleId || !role_name || hierarchy_level === undefined) {
      return apiError("Missing required fields", 400);
    }

    const { data, error } = await supabase
      .from("roles")
      .update({ role_name, hierarchy_level })
      .eq("id", roleId)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) {
      return apiError(error.message, 500);
    }

    return apiSuccess(data);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Internal server error", 500);
  }
}
