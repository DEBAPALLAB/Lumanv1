"use client";

import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Loader2, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Public STUN only.
 *
 * That is enough for the common case (both peers behind ordinary NAT) and
 * needs no infrastructure. Symmetric NAT and some corporate networks will fail
 * to connect without a TURN relay — see the note in the deployment summary.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Keeps the server-side idle deadline pushed out while the call is live. */
const TOUCH_INTERVAL_MS = 45_000;

type Peer = {
  connection: RTCPeerConnection;
  stream: MediaStream | null;
};

/**
 * A live voice room, open as a window.
 *
 * Full mesh WebRTC: every participant holds a peer connection to every other.
 * That is the right shape for the small rooms this is for — an SFU would mean
 * running media infrastructure, and mesh audio is comfortable to about six
 * people before the uplink becomes the limit.
 *
 * Signalling rides Supabase Realtime broadcast rather than a bespoke socket
 * server: offers, answers and ICE candidates are just messages, and the
 * project already depends on Realtime for chat.
 *
 * Glare — two peers offering each other simultaneously — is avoided with the
 * "polite peer" rule: the peer with the lexically smaller id waits for an
 * offer instead of making one.
 */
export function VoiceWindow({
  roomId,
  scopeLabel,
  userId,
  displayName,
}: {
  roomId: string;
  scopeLabel: string;
  userId: string | null;
  displayName: string;
}) {
  const [status, setStatus] = useState<"connecting" | "live" | "denied" | "failed">("connecting");
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState<{ id: string; name: string }[]>([]);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  const localStream = useRef<MediaStream | null>(null);
  const peers = useRef<Map<string, Peer>>(new Map());
  // biome-ignore lint/suspicious/noExplicitAny: Supabase channel type is internal
  const channel = useRef<any>(null);
  const audioHost = useRef<HTMLDivElement>(null);

  const me = userId ?? "anon";

  /** Attaches a remote track to a hidden <audio> so it actually plays. */
  const attachAudio = useCallback((peerId: string, stream: MediaStream) => {
    const host = audioHost.current;
    if (!host) return;

    let el = host.querySelector<HTMLAudioElement>(`audio[data-peer="${peerId}"]`);
    if (!el) {
      el = document.createElement("audio");
      el.dataset.peer = peerId;
      el.autoplay = true;
      host.appendChild(el);
    }
    el.srcObject = stream;
    // Autoplay can be blocked until the user gestures; the join click counts,
    // but a rejected promise here must not break the call.
    el.play().catch(() => {});
  }, []);

  /** Builds a peer connection and wires its lifecycle. */
  const makePeer = useCallback(
    (peerId: string) => {
      const existing = peers.current.get(peerId);
      if (existing) return existing.connection;

      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      for (const track of localStream.current?.getTracks() ?? []) {
        connection.addTrack(track, localStream.current as MediaStream);
      }

      connection.onicecandidate = (e) => {
        if (!e.candidate) return;
        channel.current?.send({
          type: "broadcast",
          event: "signal",
          payload: { to: peerId, from: me, kind: "ice", data: e.candidate.toJSON() },
        });
      };

      connection.ontrack = (e) => {
        const [stream] = e.streams;
        peers.current.set(peerId, { connection, stream });
        attachAudio(peerId, stream);
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "failed" || connection.connectionState === "closed") {
          peers.current.delete(peerId);
          setParticipants((prev) => prev.filter((p) => p.id !== peerId));
          audioHost.current?.querySelector(`audio[data-peer="${peerId}"]`)?.remove();
        }
      };

      peers.current.set(peerId, { connection, stream: null });
      return connection;
    },
    [me, attachAudio],
  );

  // Microphone, signalling, and the join handshake.
  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseClient();

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        if (!cancelled) setStatus("denied");
        return;
      }
      if (cancelled) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      localStream.current = stream;

      await fetch(`/api/voice/rooms/${roomId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "join" }),
      }).catch(() => {});

      const ch = supabase.channel(`voice:${roomId}`, { config: { presence: { key: me } } });

      ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
        const msg = payload as { to: string; from: string; kind: string; data: unknown };
        if (msg.to !== me || msg.from === me) return;

        const connection = makePeer(msg.from);

        if (msg.kind === "offer") {
          await connection.setRemoteDescription(msg.data as RTCSessionDescriptionInit);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          ch.send({
            type: "broadcast",
            event: "signal",
            payload: { to: msg.from, from: me, kind: "answer", data: answer },
          });
        } else if (msg.kind === "answer") {
          if (connection.signalingState !== "stable") {
            await connection.setRemoteDescription(msg.data as RTCSessionDescriptionInit);
          }
        } else if (msg.kind === "ice") {
          // A candidate can arrive before the remote description; failing here
          // is normal and self-correcting.
          await connection.addIceCandidate(msg.data as RTCIceCandidateInit).catch(() => {});
        }
      })
        .on("presence", { event: "sync" }, async () => {
          const state = ch.presenceState() as Record<string, { name?: string }[]>;
          const others = Object.keys(state).filter((id) => id !== me);
          setParticipants(
            others.map((id) => ({ id, name: state[id]?.[0]?.name || "Teammate" })),
          );

          // The impolite peer offers. Comparing ids gives both sides the same
          // answer without another round trip.
          for (const peerId of others) {
            if (me < peerId) continue;
            if (peers.current.get(peerId)?.connection.signalingState === "have-local-offer") continue;

            const connection = makePeer(peerId);
            if (connection.signalingState !== "stable") continue;

            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            ch.send({
              type: "broadcast",
              event: "signal",
              payload: { to: peerId, from: me, kind: "offer", data: offer },
            });
          }
        })
        .on("presence", { event: "join" }, ({ key, newPresences }: { key: string; newPresences: { name?: string }[] }) => {
          if (key === me) return;
          const name = newPresences?.[0]?.name || "A teammate";
          toast(`${name} joined the call`);
        })
        .on("presence", { event: "leave" }, ({ key }: { key: string }) => {
          peers.current.get(key)?.connection.close();
          peers.current.delete(key);
          setParticipants((prev) => prev.filter((p) => p.id !== key));
          audioHost.current?.querySelector(`audio[data-peer="${key}"]`)?.remove();
        })
        .subscribe((s: string) => {
          if (s === "SUBSCRIBED") {
            ch.track({ name: displayName, at: Date.now() });
            if (!cancelled) setStatus("live");
          }
        });

      channel.current = ch;
    })();

    return () => {
      cancelled = true;

      for (const { connection } of peers.current.values()) connection.close();
      peers.current.clear();
      for (const track of localStream.current?.getTracks() ?? []) track.stop();

      if (channel.current) supabase.removeChannel(channel.current);
      channel.current = null;

      // keepalive so the leave lands even though the window is unmounting —
      // this is what closes the room when the last person goes.
      fetch(`/api/voice/rooms/${roomId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [roomId, me, displayName, makePeer]);

  // Hold the idle deadline open while the call is live.
  useEffect(() => {
    if (status !== "live") return;
    const timer = setInterval(() => {
      fetch(`/api/voice/rooms/${roomId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "touch" }),
      }).catch(() => {});
    }, TOUCH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [roomId, status]);

  // Countdown to the idle deadline, so an about-to-close room is visible.
  useEffect(() => {
    if (status !== "live") return;
    let stop = false;

    const poll = async () => {
      const res = await fetch(`/api/voice/rooms/${roomId}`).catch(() => null);
      if (!res?.ok || stop) return;
    };

    void poll();
    const timer = setInterval(() => setExpiresIn((n) => (n === null ? null : Math.max(0, n - 1))), 1000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [roomId, status]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    for (const track of localStream.current?.getAudioTracks() ?? []) {
      track.enabled = !next;
    }
  };

  if (status === "denied") {
    return (
      <Centered>
        <MicOff className="h-6 w-6 text-black/30 dark:text-stone-100/30" strokeWidth={2} />
        <p className="mt-3 text-[13px] font-semibold text-black/60 dark:text-stone-100/60">Microphone blocked</p>
        <p className="mt-1 max-w-[30ch] text-[11.5px] leading-relaxed text-black/40 dark:text-stone-100/40">
          Allow microphone access for this site, then reopen the call.
        </p>
      </Centered>
    );
  }

  if (status === "connecting") {
    return (
      <Centered>
        <Loader2 className="h-5 w-5 animate-spin text-black/30 dark:text-stone-100/30" />
        <p className="mt-3 text-[12px] text-black/40 dark:text-stone-100/40">Connecting…</p>
      </Centered>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
      <div ref={audioHost} className="hidden" />

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-6">
        <div className="relative">
          <span
            className={cn("absolute -inset-2 rounded-full bg-[#8FB8AC]/25", !muted && "animate-ping")}
            aria-hidden="true"
          />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#8FB8AC] ring-[2.5px] ring-black dark:ring-stone-100">
            <Volume2 className="h-7 w-7 text-black" strokeWidth={2.2} />
          </div>
        </div>

        <p className="mt-4 text-[14px] font-bold tracking-[-0.02em] text-black dark:text-stone-100">{scopeLabel}</p>
        <p className="mt-0.5 text-[11.5px] text-black/40 dark:text-stone-100/40">
          {participants.length === 0 ? "Waiting for someone to join" : `${participants.length + 1} on the call`}
        </p>

        {expiresIn !== null && expiresIn < 30 && (
          <p className="mt-2 text-[10.5px] font-semibold text-[#B4636A]">Closing in {expiresIn}s</p>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          <Chip label={`${displayName} (you)`} muted={muted} />
          {participants.map((p) => (
            <Chip key={p.id} label={p.name} />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-2 border-t-[1.5px] border-black/[0.08] px-4 py-3 dark:border-stone-100/[0.08]">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full ring-[2px] transition-colors duration-150",
            muted
              ? "bg-[#E8B4B8] text-black ring-black dark:ring-stone-100"
              : "bg-black/[0.05] text-black ring-black/15 hover:bg-black/[0.1] dark:bg-stone-100/10 dark:text-stone-100 dark:ring-stone-100/20",
          )}
        >
          {muted ? <MicOff className="h-4 w-4" strokeWidth={2.4} /> : <Mic className="h-4 w-4" strokeWidth={2.4} />}
        </button>

        <button
          type="button"
          onClick={() => {
            // Closing the window runs the effect cleanup, which is what
            // actually leaves the room.
            window.dispatchEvent(new CustomEvent("luman:close-window", { detail: { id: `voice:${roomId}` } }));
          }}
          aria-label="Leave call"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white ring-[2px] ring-black transition-transform duration-150 hover:scale-105 dark:ring-stone-100"
        >
          <PhoneOff className="h-4 w-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center px-6 text-center">{children}</div>;
}

function Chip({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        "bg-black/[0.05] text-black dark:bg-stone-100/10 dark:text-stone-100",
      )}
    >
      {muted && <MicOff className="h-3 w-3 opacity-60" strokeWidth={2.5} />}
      {label}
    </span>
  );
}
