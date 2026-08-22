"use client";

import { cn } from "@/lib/utils";
import type { ExecContext } from "@/lib/voice/execute";
import { useAgent } from "@/lib/voice/use-agent";
import { useRecorder } from "@/lib/voice/use-recorder";
import { Loader2, Mic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceHudContext = ExecContext & {
  snapshot: Record<string, { id: string; title: string; hint?: string }[]>;
};

/**
 * Global push-to-talk: hold Ctrl+Space anywhere on the desktop, say a
 * command, let go. No window opens for it — a small pill appears top-right
 * with the transcript and the reply, and the reply is spoken.
 *
 * This is deliberately a second, lighter surface next to VoiceAgent rather
 * than that panel reused in a smaller skin. The full panel is a place you go
 * to talk to the agent — it opens, holds focus, keeps history. This is a
 * reflex: it should not need to be opened first, and it should get out of the
 * way the instant it is done. Sharing the hold-to-talk mechanics with
 * VoiceAgent would couple two things that change for different reasons (one
 * is a workspace surface, the other a global hotkey), so instead both are
 * thin shells over the same primitives — useRecorder for capture, useAgent
 * for the understand-and-execute loop — and stay independent of each other.
 *
 * Ctrl+Space, not Space alone: Space needs no modifier to mean "space" in a
 * text field, and this has to fire from anywhere, including while a window
 * has a text field focused. Not Alt+Space (opens the window menu on Windows)
 * and not Cmd/Ctrl alone (fires on every other chord that includes it). Held
 * together, unheld anywhere else, Ctrl+Space is free on both platforms.
 */
export function VoiceHud({
  context,
  enabled = true,
}: {
  context: () => VoiceHudContext;
  /** False while the full panel is open, which already owns bare Space there —
   *  without this, holding Ctrl+Space with the panel open would start two
   *  independent recordings fighting over the one microphone. */
  enabled?: boolean;
}) {
  const [muted] = useState(false);
  const { turns, thinking, submit } = useAgent({ context, muted });

  const recorder = useRecorder();
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const holdingRef = useRef(false);
  const [holding, setHolding] = useState(false);
  // Once a hold has happened, the pill stays mounted (fading through its own
  // states) until the whole exchange finishes, then disappears — a HUD that
  // is either invisible or mid-thought, never sitting empty on screen.
  const [active, setActive] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastUser = [...turns].reverse().find((t) => t.role === "user");
  const lastAgent = [...turns].reverse().find((t) => t.role === "agent");
  // Only turns from this HUD's own most recent gesture are shown — an older
  // exchange left over in the shared history must not flash up when the next
  // hold begins before its own transcript exists yet.
  const sessionStart = useRef(0);

  const beginHold = useCallback(() => {
    if (holdingRef.current) return;
    holdingRef.current = true;
    setHolding(true);
    setActive(true);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    sessionStart.current = Date.now();
    void recorderRef.current.start();
  }, []);

  const endHold = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    void recorderRef.current.stopAndTranscribe().then(({ text, language }) => {
      if (text.trim()) {
        void submit(text, language);
      } else {
        // Nothing captured (too short, blocked mic) — nothing to show.
        setActive(false);
      }
    });
  }, [submit]);

  const beginHoldRef = useRef(beginHold);
  beginHoldRef.current = beginHold;
  const endHoldRef = useRef(endHold);
  endHoldRef.current = endHold;

  useEffect(() => {
    if (!enabled) return;
    let ctrlDown = false;

    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Control") ctrlDown = true;
      if (e.code === "Space" && ctrlDown && !e.repeat) {
        e.preventDefault();
        beginHoldRef.current();
      }
    };

    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Control") ctrlDown = false;
      if (e.code === "Space" || e.key === "Control") {
        if (holdingRef.current) {
          e.preventDefault();
          endHoldRef.current();
        }
      }
    };

    // Losing focus mid-hold (alt-tab, a browser dialog) must still end the
    // gesture, or the mic is left recording with no way left to release it.
    const onBlur = () => {
      ctrlDown = false;
      if (holdingRef.current) endHoldRef.current();
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled]);

  // Once the reply lands (thinking goes false) after a session started here,
  // hold the pill a moment so the answer can be read, then clear it.
  useEffect(() => {
    if (!active || holding || thinking) return;
    if (!lastAgent || lastAgent.at < sessionStart.current) return;

    dismissTimer.current = setTimeout(() => setActive(false), 4500);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [active, holding, thinking, lastAgent]);

  if (!active) return null;

  const showUser = lastUser && lastUser.at >= sessionStart.current;
  const showAgent = lastAgent && lastAgent.at >= sessionStart.current && !holding && !recorder.transcribing;

  const statusLabel = holding
    ? "Listening…"
    : recorder.transcribing
      ? "Transcribing…"
      : thinking
        ? "Working on it…"
        : showAgent
          ? "Done"
          : "Listening…";

  return (
    <div
      aria-live="polite"
      className={cn(
        "fixed top-4 right-4 z-[9700] w-[min(320px,calc(100vw-32px))]",
        "overflow-hidden rounded-[14px] border-[3px] border-black bg-[#FDFBF7]",
        "shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
        "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.9)]",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border-[2px] border-black dark:border-[#EDE7DD]",
            holding ? "bg-[#FBBF24] text-black" : "bg-white text-black dark:bg-[#2a2621] dark:text-[#EDE7DD]",
          )}
        >
          {holding || recorder.transcribing || thinking ? (
            holding ? (
              <Mic className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
            )
          ) : (
            <Mic className="h-3.5 w-3.5" strokeWidth={2.5} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-black/45 dark:text-[#EDE7DD]/45">
            {statusLabel}
          </p>
          <p className="truncate text-[12.5px] font-bold leading-tight text-black dark:text-[#EDE7DD]">
            {showAgent ? lastAgent?.text : showUser ? lastUser?.text : "Hold Ctrl+Space and speak"}
          </p>
        </div>
      </div>

      {recorder.error && (
        <p className="border-t-[2px] border-black/15 px-3 py-1.5 text-[10.5px] font-medium text-[#B45309] dark:border-[#EDE7DD]/15">
          {recorder.error}
        </p>
      )}
    </div>
  );
}
