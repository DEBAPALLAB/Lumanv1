"use client";

import { createSupabaseClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useRef, useState } from "react";

export type Workspace = {
  id: string;
  owner_name: string;
  folder_id: string | null;
  color: string;
};

export type Folder = { id: string; name: string; color: string };
export type Note = { id: string; title: string; created_at: string; workspace_id?: string };
export type Channel = {
  id: string;
  name: string;
  scope: "organization" | "workspace";
  workspace_id: string | null;
};

export type Board = {
  id: string;
  name: string;
  scope: "organization" | "workspace";
  workspace_id: string | null;
  updated_at?: string;
};

export type VoiceRoom = {
  id: string;
  scope: "organization" | "workspace";
  workspace_id: string | null;
  organization_id: string;
  started_by: string | null;
  started_at: string;
  expires_at: string;
  closed_at?: string | null;
};

/**
 * The desktop's shared read of the current organisation.
 *
 * Both flyouts and several windows need workspaces, folders and channels. The
 * v1 pages each fetched these independently, which is why the dev log showed
 * the same endpoints hit five and ten times per navigation. Here the desktop
 * resolves the org once and hands the result down, so opening three windows
 * costs no extra round trips.
 *
 * Org resolution mirrors the order the v1 sidebar uses — ?org= slug, then the
 * remembered slug, then the first membership — so both apps agree on which
 * organisation is open.
 */
export type Identity = {
  email: string | null;
  fullName: string | null;
  orgName: string | null;
  /** The caller's role in the current organisation — "founder", "admin", "intern", etc. */
  role: string | null;
};

export function useOrgData() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const onRoomOpenedRef = useRef<(room: VoiceRoom) => void>(() => {});
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity>({ email: null, fullName: null, orgName: null, role: null });
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [rooms, setRooms] = useState<VoiceRoom[]>([]);
  const [notesByWorkspace, setNotesByWorkspace] = useState<Record<string, Note[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        if (!cancelled) {
          setError("You need to be signed in.");
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setUserId(userData.user.id);

      // Full name lives in auth metadata rather than a profile table in this
      // schema — mirrors how the v1 sidebar and the messaging directory both
      // read it.
      const metaName = (userData.user.user_metadata as { full_name?: string } | null)?.full_name ?? null;

      const slug =
        new URLSearchParams(window.location.search).get("org") ?? sessionStorage.getItem("selected_org_slug");

      let resolved: string | null = null;
      if (slug) {
        const { data: org } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle();
        resolved = org?.id ?? null;
      }
      if (!resolved) {
        const { data: membership } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", userData.user.id)
          .limit(1)
          .maybeSingle();
        resolved = membership?.organization_id ?? null;
      }

      if (cancelled) return;
      if (!resolved) {
        setError("Create or join an organization to get started.");
        setLoading(false);
        return;
      }

      setOrgId(resolved);
      setOrgSlug(slug);

      // The lists the desktop needs up front, in parallel — they do not depend
      // on each other, and serialising them would make the dock's first flyout
      // wait on all of these latencies back to back.
      const [wsRes, foldersRes, channelsRes, boardsRes, roomsRes, orgRow, membershipRow] = await Promise.all([
        fetch(`/api/workspaces?orgId=${resolved}`),
        fetch(`/api/folders?orgId=${resolved}`),
        fetch(`/api/messaging/channels?organizationId=${resolved}`),
        fetch(`/api/whiteboards?organizationId=${resolved}`),
        fetch(`/api/voice/rooms?organizationId=${resolved}`),
        supabase.from("organizations").select("name").eq("id", resolved).maybeSingle(),
        supabase
          .from("organization_members")
          .select("role")
          .eq("organization_id", resolved)
          .eq("user_id", userData.user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setIdentity({
        email: userData.user.email ?? null,
        fullName: metaName,
        orgName: orgRow.data?.name ?? null,
        role: membershipRow.data?.role ?? null,
      });

      if (wsRes.ok) setWorkspaces((await wsRes.json()) as Workspace[]);
      if (foldersRes.ok) setFolders((await foldersRes.json()) as Folder[]);
      if (channelsRes.ok) {
        const body = (await channelsRes.json()) as {
          organizationChannels: Channel[];
          workspaceChannels: Record<string, Channel[]>;
        };
        setChannels([...body.organizationChannels, ...Object.values(body.workspaceChannels).flat()]);
      }

      if (boardsRes.ok) {
        const body = (await boardsRes.json()) as {
          organizationBoards: Board[];
          workspaceBoards: Record<string, Board[]>;
        };
        setBoards([...body.organizationBoards, ...Object.values(body.workspaceBoards).flat()]);
      }
      if (roomsRes.ok) {
        const body = (await roomsRes.json()) as { rooms: VoiceRoom[] };
        setRooms(body.rooms ?? []);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Notes for one workspace, fetched on demand and cached.
   *
   * Lazy rather than eager: a user with fifteen workspaces should not pay
   * fifteen note queries to open the workspace picker, and the flyout only
   * ever shows one workspace's notes at a time.
   */
  const loadNotes = useCallback(
    async (workspaceId: string) => {
      if (notesByWorkspace[workspaceId]) return notesByWorkspace[workspaceId];

      const res = await fetch(`/api/notes?workspaceId=${workspaceId}`);
      if (!res.ok) return [];

      const notes = (await res.json()) as Note[];
      setNotesByWorkspace((prev) => ({ ...prev, [workspaceId]: notes }));
      return notes;
    },
    [notesByWorkspace],
  );

  /** Re-reads boards and live rooms. Called after creating either. */
  const refreshBoards = useCallback(async () => {
    if (!orgId) return;
    const res = await fetch(`/api/whiteboards?organizationId=${orgId}`);
    if (!res.ok) return;
    const body = (await res.json()) as {
      organizationBoards: Board[];
      workspaceBoards: Record<string, Board[]>;
    };
    setBoards([...body.organizationBoards, ...Object.values(body.workspaceBoards).flat()]);
  }, [orgId]);

  const refreshRooms = useCallback(async () => {
    if (!orgId) return;
    const res = await fetch(`/api/voice/rooms?organizationId=${orgId}`);
    if (!res.ok) return;
    const body = (await res.json()) as { rooms: VoiceRoom[] };
    setRooms(body.rooms ?? []);
  }, [orgId]);

  /**
   * Registers a callback for "a call just started somewhere in this org".
   * Held in a ref so the caller can pass an inline closure without tearing
   * down the realtime subscription below on every render.
   */
  const onRoomOpened = useCallback((handler: (room: VoiceRoom) => void) => {
    onRoomOpenedRef.current = handler;
  }, []);

  // Live awareness of calls other people start, so the desktop can pop a
  // notification instead of relying on someone opening the flyout to notice.
  useEffect(() => {
    if (!orgId) return;

    const supabase = createSupabaseClient();
    const realtimeChannel = supabase
      .channel(`voice-rooms:${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "voice_rooms", filter: `organization_id=eq.${orgId}` },
        (payload) => {
          const room = payload.new as VoiceRoom;
          setRooms((prev) => (prev.some((r) => r.id === room.id) ? prev : [...prev, room]));
          onRoomOpenedRef.current(room);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "voice_rooms", filter: `organization_id=eq.${orgId}` },
        (payload) => {
          const room = payload.new as VoiceRoom;
          if (!room.closed_at) return;
          setRooms((prev) => prev.filter((r) => r.id !== room.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [orgId]);

  return {
    orgId,
    orgSlug,
    userId,
    identity,
    workspaces,
    folders,
    channels,
    boards,
    rooms,
    notesByWorkspace,
    loadNotes,
    refreshBoards,
    refreshRooms,
    onRoomOpened,
    loading,
    error,
  };
}
