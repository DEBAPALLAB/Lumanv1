import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VoiceScope = "organization" | "workspace";

export type VoiceRoom = {
  id: string;
  scope: VoiceScope;
  organization_id: string;
  workspace_id: string | null;
  started_by: string | null;
  started_at: string;
  expires_at: string;
  closed_at: string | null;
};

export type VoiceParticipant = {
  room_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
};

/** How long a room survives without activity. Mirrors the column default. */
export const ROOM_IDLE_MS = 2 * 60 * 1000;

/**
 * Open rooms for an organisation.
 *
 * Sweeps expired rooms first: expiry is lazy rather than scheduled, and the
 * moment somebody asks for the list is exactly when a stale room would be
 * misleading. The sweep is cheap — an indexed update over open rows only.
 */
export async function listOpenRooms(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  // Best-effort. A failed sweep must not take the listing down with it; the
  // client also filters on expires_at, so a missed sweep is invisible.
  // The builder is a thenable rather than a Promise, so it cannot be .catch()ed
  // directly — awaiting inside try/catch is the supported shape.
  try {
    await supabase.rpc("close_expired_voice_rooms");
  } catch {
    // ignored
  }

  const { data, error } = await supabase
    .from("voice_rooms")
    .select("*")
    .eq("organization_id", organizationId)
    .is("closed_at", null);

  if (error) throw error;
  return (data ?? []) as VoiceRoom[];
}

/**
 * Returns the live room for a container, creating it if there is none.
 *
 * The unique partial indexes guarantee at most one open room per container, so
 * two people pressing "call" simultaneously race here — the loser catches the
 * unique violation and returns the winner's room rather than erroring, which
 * is what makes the button idempotent.
 */
export async function openRoom({
  scope,
  organizationId,
  workspaceId,
  startedBy,
}: {
  scope: VoiceScope;
  organizationId: string;
  workspaceId?: string | null;
  startedBy: string;
}) {
  const supabase = await createSupabaseServerClient();
  try {
    await supabase.rpc("close_expired_voice_rooms");
  } catch {
    // ignored — see listOpenRooms
  }

  const existing = supabase
    .from("voice_rooms")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("scope", scope)
    .is("closed_at", null);

  const { data: live } = await (scope === "workspace"
    ? existing.eq("workspace_id", workspaceId as string).maybeSingle()
    : existing.is("workspace_id", null).maybeSingle());

  if (live) return live as VoiceRoom;

  const { data, error } = await supabase
    .from("voice_rooms")
    .insert({
      scope,
      organization_id: organizationId,
      workspace_id: scope === "workspace" ? workspaceId : null,
      started_by: startedBy,
      expires_at: new Date(Date.now() + ROOM_IDLE_MS).toISOString(),
    })
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation: somebody opened it first.
    if ((error as { code?: string }).code === "23505") {
      const retry = supabase
        .from("voice_rooms")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("scope", scope)
        .is("closed_at", null);

      const { data: winner } = await (scope === "workspace"
        ? retry.eq("workspace_id", workspaceId as string).maybeSingle()
        : retry.is("workspace_id", null).maybeSingle());

      if (winner) return winner as VoiceRoom;
    }
    throw error;
  }

  return data as VoiceRoom;
}

/** Marks the caller present and pushes the idle deadline out. */
export async function joinRoom(roomId: string, userId: string) {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("voice_participants")
    .upsert({ room_id: roomId, user_id: userId, joined_at: new Date().toISOString(), left_at: null });

  if (error) throw error;
  await touchRoom(roomId);
}

/**
 * Marks the caller gone, and closes the room when nobody is left.
 *
 * Closing here rather than waiting for the sweep means the last person leaving
 * ends the call immediately, which is what everyone expects — a room that
 * lingers for two minutes after the last goodbye reads as broken.
 */
export async function leaveRoom(roomId: string, userId: string) {
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("voice_participants")
    .update({ left_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", userId);

  const { count } = await supabase
    .from("voice_participants")
    .select("user_id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .is("left_at", null);

  if ((count ?? 0) === 0) {
    await supabase.from("voice_rooms").update({ closed_at: new Date().toISOString() }).eq("id", roomId);
  }
}

/** Extends the idle deadline. Called on join and periodically while speaking. */
export async function touchRoom(roomId: string) {
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("voice_rooms")
    .update({ expires_at: new Date(Date.now() + ROOM_IDLE_MS).toISOString() })
    .eq("id", roomId)
    .is("closed_at", null);
}

export async function listParticipants(roomId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("voice_participants")
    .select("*")
    .eq("room_id", roomId)
    .is("left_at", null);

  if (error) throw error;
  return (data ?? []) as VoiceParticipant[];
}
