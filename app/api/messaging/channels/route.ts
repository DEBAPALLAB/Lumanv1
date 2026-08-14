import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { type Channel, createChannel, ensureDefaultChannel, listChannels } from "@/lib/db/messaging";
import { getUserMembership } from "@/lib/db/organizations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/messaging/channels?organizationId=...
 *
 * Every channel the caller can open in one organisation, split the way the
 * sidebar renders it. RLS does the filtering, so a workspace channel belonging
 * to a workspace they cannot reach never comes back.
 */
export async function GET(req: Request) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    // Reuse the client requireUser already built rather than constructing a
    // second one, which re-reads cookies and re-initialises the client.
    const { user, supabase } = session;

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return apiError("organizationId is required", 400);
    }

    // Membership check and channel list run together rather than in sequence.
    // They do not depend on each other, and serialising them made this route
    // pay both latencies back to back on every load.
    //
    // The membership check selects a single column: getUserMembership() joins
    // `roles` for a hierarchy level this route never reads, which cost more
    // than the channel query it was gating.
    const [membershipResult, channels] = await Promise.all([
      supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("user_id", user.id)
        .maybeSingle(),
      listChannels(organizationId, supabase),
    ]);

    // Checked in the app layer as well as by RLS: without this, a non-member
    // gets an empty list (which reads as "no channels yet") instead of a 403.
    if (!membershipResult.data) return apiError("Not a member of this organization", 403);

    // The org's "general" channel is created on first visit rather than by a
    // trigger, so an organisation that predates this feature still has
    // somewhere to talk. Only attempted when the org genuinely has no
    // organisation-scoped channel — previously this ran a lookup on every
    // request forever, to do nothing in all but the very first one.
    if (!channels.some((channel) => channel.scope === "organization")) {
      try {
        const created = await ensureDefaultChannel({
          scope: "organization",
          organizationId,
          createdBy: user.id,
        });
        channels.push(created);
      } catch {
        // Not fatal to listing: the empty state renders and the next request
        // retries.
      }
    }

    const organizationChannels = channels.filter((c) => c.scope === "organization");
    const workspaceChannels: Record<string, Channel[]> = {};
    for (const channel of channels) {
      if (channel.scope !== "workspace" || !channel.workspace_id) continue;
      const bucket = workspaceChannels[channel.workspace_id] ?? [];
      bucket.push(channel);
      workspaceChannels[channel.workspace_id] = bucket;
    }

    return apiSuccess({ organizationChannels, workspaceChannels });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * POST /api/messaging/channels
 * Body: { scope, organizationId, workspaceId?, name, topic? }
 */
export async function POST(req: Request) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    let body: {
      scope?: string;
      organizationId?: string;
      workspaceId?: string;
      name?: string;
      topic?: string;
    };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const { scope, organizationId, workspaceId, name, topic } = body;

    if (scope !== "organization" && scope !== "workspace") {
      return apiError("scope must be 'organization' or 'workspace'", 400);
    }
    if (!organizationId) return apiError("organizationId is required", 400);
    if (!name?.trim()) return apiError("name is required", 400);
    if (name.trim().length > 80) return apiError("Channel name is too long (80 characters max)", 400);
    if (scope === "workspace" && !workspaceId) {
      return apiError("workspaceId is required for a workspace channel", 400);
    }

    const membership = await getUserMembership(organizationId, user.id);
    if (!membership) return apiError("Not a member of this organization", 403);

    // A workspace channel must live in the organisation it claims to. Without
    // this the row would still be created — the INSERT policy only asks
    // whether the caller can reach the workspace — but it would then be listed
    // under an organisation the workspace does not belong to.
    if (scope === "workspace") {
      const supabase = await createSupabaseServerClient();
      const { data: workspace, error } = await supabase
        .from("workspaces")
        .select("id, organization_id")
        .eq("id", workspaceId!)
        .maybeSingle();

      if (error) return apiError(error.message, 500);
      if (!workspace) return apiError("Workspace not found", 404);
      if (workspace.organization_id !== organizationId) {
        return apiError("Workspace does not belong to this organization", 400);
      }
    }

    try {
      const channel = await createChannel({
        scope,
        organizationId,
        workspaceId,
        name,
        topic,
        createdBy: user.id,
      });
      return apiSuccess(channel, 201);
    } catch (error) {
      // Postgres failures that are the caller's to fix are reported as such.
      // Letting them fall through to the generic 500 below hid the reason from
      // the client and made a bad channel name look like a server outage.
      const code = (error as { code?: string })?.code;
      if (code === "23505") {
        return apiError("A channel with that name already exists here", 409);
      }
      if (code === "23514") {
        return apiError("Channel names must be 1 to 80 characters", 400);
      }
      // 42501 = insufficient_privilege: the INSERT policy rejected the row.
      if (code === "42501") {
        return apiError("You do not have permission to create a channel here", 403);
      }
      throw error;
    }
  } catch (err) {
    // Logged server-side with the Postgres code attached: the response body
    // deliberately stays terse, so without this an unexpected failure leaves
    // nothing to debug from but a 500 in the request log.
    console.error("POST /api/messaging/channels failed", {
      code: (err as { code?: string })?.code,
      details: (err as { details?: string })?.details,
      message: err instanceof Error ? err.message : err,
    });
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
