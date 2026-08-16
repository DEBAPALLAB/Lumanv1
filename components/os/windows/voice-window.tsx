"use client";

import { useScreenShare } from "@/lib/os/use-screen-share";
import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Loader2, Mic, MicOff, MonitorUp, MonitorX, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ScreenSharePicker } from "./screen-share-picker";

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
  /** The sender holding this peer's copy of our screen track, if we are sharing. */
  screenSender: RTCRtpSender | null;
};

type Participant = {
  id: string;
  name: string;
  sharing: boolean;
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
 *
 * Screen sharing rides the same connections: the shared video track is added
 * to every peer and the resulting renegotiation is carried by the existing
 * offer/answer path. Who is sharing is published through presence, so the UI
 * can switch to the stage layout the moment someone starts — before their
 * first video frame has actually arrived.
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
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  /** Remote screen streams, keyed by the peer sharing them. */
  const [remoteScreens, setRemoteScreens] = useState<Record<string, MediaStream>>({});

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

  /** Re-announces our presence so peers see the current sharing flag. */
  const publishPresence = useCallback(
    (sharing: boolean) => {
      channel.current?.track({ name: displayName, sharing, at: Date.now() });
    },
    [displayName],
  );

  /**
   * Sends a fresh offer to one peer.
   *
   * Used both for the initial handshake and for renegotiation when a screen
   * track is added or removed, which is why it takes the connection rather
   * than looking it up — the caller has already made or found it.
   */
  const sendOffer = useCallback(
    async (peerId: string, connection: RTCPeerConnection) => {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      channel.current?.send({
        type: "broadcast",
        event: "signal",
        payload: { to: peerId, from: me, kind: "offer", data: offer },
      });
    },
    [me],
  );

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
        const entry = peers.current.get(peerId);

        // Audio and screen arrive on the same connection, so they are told
        // apart by kind rather than by which stream they belong to.
        if (e.track.kind === "video") {
          setRemoteScreens((prev) => ({ ...prev, [peerId]: stream }));
          e.track.addEventListener("ended", () => {
            setRemoteScreens((prev) => {
              const next = { ...prev };
              delete next[peerId];
              return next;
            });
          });
          return;
        }

        peers.current.set(peerId, {
          connection,
          stream,
          screenSender: entry?.screenSender ?? null,
        });
        attachAudio(peerId, stream);
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "failed" || connection.connectionState === "closed") {
          peers.current.delete(peerId);
          setParticipants((prev) => prev.filter((p) => p.id !== peerId));
          setRemoteScreens((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
          audioHost.current?.querySelector(`audio[data-peer="${peerId}"]`)?.remove();
        }
      };

      peers.current.set(peerId, { connection, stream: null, screenSender: null });
      return connection;
    },
    [me, attachAudio],
  );

  // Screen sharing. Adding or removing the track on an established connection
  // requires a new offer, which is what the renegotiation loops below do.
  const share = useScreenShare({
    onStart: async (stream) => {
      const [track] = stream.getVideoTracks();
      if (!track) return;

      for (const [peerId, peer] of peers.current) {
        peer.screenSender = peer.connection.addTrack(track, stream);
        await sendOffer(peerId, peer.connection).catch(() => {});
      }
      publishPresence(true);
    },
    onStop: async () => {
      for (const [peerId, peer] of peers.current) {
        if (!peer.screenSender) continue;
        peer.connection.removeTrack(peer.screenSender);
        peer.screenSender = null;
        await sendOffer(peerId, peer.connection).catch(() => {});
      }
      publishPresence(false);
    },
  });

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
          const state = ch.presenceState() as Record<string, { name?: string; sharing?: boolean }[]>;
          const others = Object.keys(state).filter((id) => id !== me);
          setParticipants(
            others.map((id) => ({
              id,
              name: state[id]?.[0]?.name || "Teammate",
              sharing: Boolean(state[id]?.[0]?.sharing),
            })),
          );

          // The impolite peer offers. Comparing ids gives both sides the same
          // answer without another round trip.
          for (const peerId of others) {
            if (me < peerId) continue;
            if (peers.current.get(peerId)?.connection.signalingState === "have-local-offer") continue;

            const connection = makePeer(peerId);
            if (connection.signalingState !== "stable") continue;

            // A peer joining mid-share needs our screen track on their very
            // first offer, or they would see nothing until we toggled it.
            const localScreen = share.stream?.getVideoTracks()[0];
            const entry = peers.current.get(peerId);
            if (localScreen && entry && !entry.screenSender) {
              entry.screenSender = connection.addTrack(localScreen, share.stream as MediaStream);
            }

            await sendOffer(peerId, connection);
          }
        })
        .on(
          "presence",
          { event: "join" },
          ({ key, newPresences }: { key: string; newPresences: { name?: string }[] }) => {
            if (key === me) return;
            const name = newPresences?.[0]?.name || "A teammate";
            toast(`${name} joined the call`);
          },
        )
        .on("presence", { event: "leave" }, ({ key }: { key: string }) => {
          peers.current.get(key)?.connection.close();
          peers.current.delete(key);
          setParticipants((prev) => prev.filter((p) => p.id !== key));
          setRemoteScreens((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          audioHost.current?.querySelector(`audio[data-peer="${key}"]`)?.remove();
        })
        .subscribe((s: string) => {
          if (s === "SUBSCRIBED") {
            ch.track({ name: displayName, sharing: false, at: Date.now() });
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
  }, [roomId, me, displayName, makePeer, sendOffer, share.stream]);

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

  const leave = () => {
    // Closing the window runs the effect cleanup, which is what actually
    // leaves the room.
    window.dispatchEvent(new CustomEvent("luman:close-window", { detail: { id: `voice:${roomId}` } }));
  };

  /**
   * Everyone in the room, us first.
   *
   * Built as one list rather than rendering "you" separately so the grid can
   * treat all tiles identically — the only difference is the label.
   */
  const roster = useMemo(
    () => [
      { id: me, name: displayName, sharing: share.sharing, self: true },
      ...participants.map((p) => ({ ...p, self: false })),
    ],
    [me, displayName, share.sharing, participants],
  );

  // Whoever is on the stage. Our own share wins if both are running, since it
  // is the one thing the sharer cannot see anywhere else on their screen.
  const stage = useMemo(() => {
    if (share.sharing && share.stream) {
      return { stream: share.stream, label: "Your screen", self: true };
    }
    const sharer = participants.find((p) => remoteScreens[p.id]);
    if (sharer) return { stream: remoteScreens[sharer.id], label: `${sharer.name}'s screen`, self: false };
    return null;
  }, [share.sharing, share.stream, participants, remoteScreens]);

  if (status === "denied") {
    return (
      <Centered>
        <MicOff className="h-6 w-6 text-black/30 dark:text-[#EDE7DD]/30" strokeWidth={2} />
        <p className="mt-3 text-[13px] font-semibold text-black/60 dark:text-[#EDE7DD]/60">Microphone blocked</p>
        <p className="mt-1 max-w-[30ch] text-[11.5px] leading-relaxed text-black/40 dark:text-[#EDE7DD]/40">
          Allow microphone access for this site, then reopen the call.
        </p>
      </Centered>
    );
  }

  if (status === "connecting") {
    return (
      <Centered>
        <Loader2 className="h-5 w-5 animate-spin text-black/30 dark:text-[#EDE7DD]/30" />
        <p className="mt-3 text-[12px] text-black/40 dark:text-[#EDE7DD]/40">Connecting…</p>
      </Centered>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-white dark:bg-[#211e1a]">
      <div ref={audioHost} className="hidden" />

      <header className="flex shrink-0 items-center gap-2 border-b-[1.5px] border-black/[0.08] px-4 py-2.5 dark:border-[#EDE7DD]/[0.08]">
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full bg-[#8FB8AC]", !muted && "animate-pulse")}
          aria-hidden="true"
        />
        <h2 className="min-w-0 flex-1 truncate text-[12.5px] font-bold tracking-[-0.01em] text-black dark:text-[#EDE7DD]">
          {scopeLabel}
        </h2>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-black/35 dark:text-[#EDE7DD]/35">
          {roster.length}
        </span>
      </header>

      {expiresIn !== null && expiresIn < 30 && (
        <p className="shrink-0 bg-[#E8B4B8]/25 px-4 py-1.5 text-center text-[10.5px] font-semibold text-[#8C4A52] dark:text-[#E8B4B8]">
          Closing in {expiresIn}s
        </p>
      )}

      {share.error && (
        <p className="shrink-0 bg-[#E8B4B8]/25 px-4 py-1.5 text-center text-[10.5px] font-semibold text-[#8C4A52] dark:text-[#E8B4B8]">
          {share.error}
        </p>
      )}

      {stage ? <StageLayout stage={stage} roster={roster} /> : <TileGrid roster={roster} muted={muted} />}

      <footer className="flex shrink-0 items-center justify-center gap-2 border-t-[1.5px] border-black/[0.08] px-4 py-3 dark:border-[#EDE7DD]/[0.08]">
        <ControlButton
          label={muted ? "Unmute" : "Mute"}
          pressed={muted}
          onClick={toggleMute}
          tone={muted ? "warn" : "neutral"}
        >
          {muted ? <MicOff className="h-4 w-4" strokeWidth={2.4} /> : <Mic className="h-4 w-4" strokeWidth={2.4} />}
        </ControlButton>

        <ControlButton
          label={share.sharing ? "Stop sharing" : "Share screen"}
          pressed={share.sharing}
          onClick={() => (share.sharing ? share.stop() : void share.start())}
          tone={share.sharing ? "accent" : "neutral"}
        >
          {share.sharing ? (
            <MonitorX className="h-4 w-4" strokeWidth={2.4} />
          ) : (
            <MonitorUp className="h-4 w-4" strokeWidth={2.4} />
          )}
        </ControlButton>

        <ControlButton label="Leave call" onClick={leave} tone="danger">
          <PhoneOff className="h-4 w-4" strokeWidth={2.4} />
        </ControlButton>
      </footer>

      {share.pickerOpen && (
        <ScreenSharePicker sources={share.sources} onPick={(id) => void share.pick(id)} onClose={share.closePicker} />
      )}
    </div>
  );
}

/**
 * The default view: every participant as a tile.
 *
 * The column count is derived from the head count rather than left to
 * auto-fill, because a room of two should be two large tiles side by side, not
 * two small ones stranded on a wide row.
 */
function TileGrid({ roster, muted }: { roster: RosterEntry[]; muted: boolean }) {
  const columns = roster.length <= 1 ? 1 : roster.length <= 4 ? 2 : roster.length <= 9 ? 3 : 4;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3 os-scroll">
      <div
        className="grid h-full auto-rows-fr gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {roster.map((person) => (
          <ParticipantTile key={person.id} person={person} muted={person.self && muted} />
        ))}
      </div>
    </div>
  );
}

/**
 * Share view: the screen takes the room, everyone shrinks to a filmstrip.
 *
 * The filmstrip scrolls horizontally rather than wrapping so the stage keeps a
 * constant height no matter how many people are on the call.
 */
function StageLayout({
  stage,
  roster,
}: {
  stage: { stream: MediaStream; label: string; self: boolean };
  roster: RosterEntry[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <figure className="relative min-h-0 flex-1 overflow-hidden rounded-[10px] bg-black ring-[2px] ring-black dark:ring-[#EDE7DD]/25">
        <ScreenVideo stream={stage.stream} muted={stage.self} />
        <figcaption
          className={cn(
            "absolute left-2 top-2 rounded-[6px] px-2 py-1",
            "bg-black/70 text-[10.5px] font-semibold text-white backdrop-blur-sm",
          )}
        >
          {stage.label}
        </figcaption>
      </figure>

      <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-0.5 os-scroll">
        {roster.map((person) => (
          <FilmstripChip key={person.id} person={person} />
        ))}
      </div>
    </div>
  );
}

/**
 * Plays a screen-share stream.
 *
 * `srcObject` cannot be set from JSX, so it is assigned in an effect. Muted
 * for our own share — playing our own captured audio back would echo.
 */
function ScreenVideo({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.play().catch(() => {});
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className="h-full w-full object-contain"
      aria-label="Shared screen"
    />
  );
}

type RosterEntry = { id: string; name: string; sharing: boolean; self: boolean };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic tile tint.
 *
 * Same person, same colour, every session — a tile that changed hue between
 * calls would stop being recognisable at a glance, which is the only job the
 * colour has here.
 */
const TILE_TINTS = ["#E8B4B8", "#8FB8AC", "#C3A6D8", "#E0A458", "#7FA5C4", "#B8C48F"];

function tintFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_TINTS[hash % TILE_TINTS.length];
}

function ParticipantTile({ person, muted }: { person: RosterEntry; muted: boolean }) {
  return (
    <div
      className={cn(
        "relative flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[10px] p-3",
        "bg-black/[0.035] ring-1 ring-inset ring-black/[0.07]",
        "dark:bg-[#EDE7DD]/[0.05] dark:ring-[#EDE7DD]/[0.09]",
      )}
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-[14px] text-[15px] font-bold text-black ring-[2px] ring-black/80 dark:ring-[#EDE7DD]/70"
        style={{ background: tintFor(person.id) }}
        aria-hidden="true"
      >
        {initials(person.name)}
      </span>

      <span className="max-w-full truncate text-[11.5px] font-semibold text-black dark:text-[#EDE7DD]">
        {person.self ? `${person.name} (you)` : person.name}
      </span>

      <div className="absolute right-2 top-2 flex gap-1">
        {person.sharing && (
          <span
            className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-[#FBBF24] ring-1 ring-black/70"
            title="Sharing their screen"
          >
            <MonitorUp className="h-3 w-3 text-black" strokeWidth={2.6} />
          </span>
        )}
        {muted && (
          <span
            className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-[#E8B4B8] ring-1 ring-black/70"
            title="Muted"
          >
            <MicOff className="h-3 w-3 text-black" strokeWidth={2.6} />
          </span>
        )}
      </div>
    </div>
  );
}

function FilmstripChip({ person }: { person: RosterEntry }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-[8px] py-1 pl-1 pr-2.5",
        "bg-black/[0.05] ring-1 ring-inset ring-black/[0.07]",
        "dark:bg-[#EDE7DD]/[0.07] dark:ring-[#EDE7DD]/[0.09]",
      )}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[9.5px] font-bold text-black ring-1 ring-black/70"
        style={{ background: tintFor(person.id) }}
        aria-hidden="true"
      >
        {initials(person.name)}
      </span>
      <span className="max-w-[110px] truncate text-[11px] font-semibold text-black dark:text-[#EDE7DD]">
        {person.self ? "You" : person.name}
      </span>
      {person.sharing && <MonitorUp className="h-3 w-3 shrink-0 text-[#B98A0E]" strokeWidth={2.6} />}
    </span>
  );
}

function ControlButton({
  children,
  label,
  onClick,
  pressed,
  tone = "neutral",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  tone?: "neutral" | "accent" | "warn" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full ring-[2px]",
        "transition-[background-color,transform] duration-150 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-offset-2 focus-visible:ring-black dark:focus-visible:ring-[#EDE7DD]",
        tone === "danger" && "bg-red-500 text-white ring-black hover:bg-red-600 dark:ring-[#EDE7DD]",
        tone === "warn" && "bg-[#E8B4B8] text-black ring-black dark:ring-[#EDE7DD]",
        tone === "accent" && "bg-[#FBBF24] text-black ring-black dark:ring-[#EDE7DD]",
        tone === "neutral" &&
          "bg-black/[0.05] text-black ring-black/15 hover:bg-black/[0.1] dark:bg-[#EDE7DD]/10 dark:text-[#EDE7DD] dark:ring-[#EDE7DD]/20",
      )}
    >
      {children}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center px-6 text-center">{children}</div>;
}
