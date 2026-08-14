"use client";

import type { Message } from "@/lib/db/messaging";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

/**
 * Live message delivery for one open channel.
 *
 * Supabase Realtime re-runs the table's RLS against the subscriber's own JWT
 * before it delivers a row, so `can_access_channel()` in migration 012 is what
 * stops a user receiving messages from a channel they cannot open. There is no
 * second authorisation scheme here, and there should not be one — an extra
 * client-side check would only hide a server-side hole rather than close it.
 *
 * One subscription per OPEN channel, torn down on switch or unmount. The
 * alternative — subscribing to every channel the user can reach — would hold
 * a connection open per channel and hit the per-client channel limit on any
 * reasonably busy organisation.
 */
export function useChannelRealtime({
  channelId,
  onInsert,
  onUpdate,
}: {
  channelId: string | null;
  onInsert: (message: Message) => void;
  onUpdate: (message: Message) => void;
}) {
  // The handlers are held in refs so that a caller passing inline closures
  // does not tear down and re-establish the socket on every render — the
  // subscription's lifetime should follow the channel, nothing else.
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onInsertRef.current = onInsert;
    onUpdateRef.current = onUpdate;
  }, [onInsert, onUpdate]);

  useEffect(() => {
    if (!channelId) return;

    const supabase = createSupabaseClient();
    let realtimeChannel: RealtimeChannel | null = null;

    realtimeChannel = supabase
      .channel(`messages:channel:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const message = payload.new as Message;
          // Threads have their own view; a reply arriving here would otherwise
          // appear as a loose message in the main transcript.
          if (message.parent_message_id) return;
          onInsertRef.current(message);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          // Edits and soft deletes are both UPDATEs. The list decides what to
          // do with a row carrying deleted_at.
          onUpdateRef.current(payload.new as Message);
        },
      )
      .subscribe();

    return () => {
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    };
  }, [channelId]);
}
