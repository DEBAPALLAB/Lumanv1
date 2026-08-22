"use client";

import { cn } from "@/lib/utils";
import type { ExecContext } from "@/lib/voice/execute";
import { useAgent } from "@/lib/voice/use-agent";
import { useRecorder } from "@/lib/voice/use-recorder";
import { CornerDownLeft, Loader2, Mic, MicOff, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/** What the caller supplies, rebuilt on every desktop change so it stays live. */
export type VoiceAgentContext = ExecContext & {
  snapshot: Record<string, { id: string; title: string; hint?: string }[]>;
};

/**
 * The agent surface: a mic, a transcript, and a text box.
 *
 * Anchored to the bottom centre rather than opened as a window, for the same
 * reason the dock's flyouts are not windows — the agent is a way of operating
 * the desktop, not a document on it. Putting it in a window would mean it
 * could be buried behind the very things it opens, and would leave "Voice
 * agent" sitting in the minimised blob tray as if it were a file.
 *
 * The typed input is not a lesser path. Voice is unusable in a shared room and
 * unreliable in a noisy one, and the same sentence typed has to do the same
 * thing — so both feed the identical agent loop.
 *
 * VOICE INPUT IS RECORD-THEN-TRANSCRIBE, NOT LIVE RECOGNITION
 *   This used to wrap the browser's built-in `SpeechRecognition`. That API is
 *   not a real web standard — it is a private integration only Chrome/Edge
 *   ship, and only when the vendor's speech backend is actually wired in.
 *   Confirmed directly: it failed identically on two different browsers on
 *   the same machine (a Chrome install with a broken internal speech
 *   component, and Comet, which does not carry the integration at all) while
 *   Edge worked immediately with the exact same code. No client-side handling
 *   fixes that — the browser refuses to even attempt the underlying request.
 *
 *   `MediaRecorder` has none of that dependency: it is an actual standard
 *   every evergreen browser implements the same way, because it only
 *   captures audio — it does not talk to a speech backend itself. A server
 *   route (app/api/voice/transcribe/route.ts) does the transcribing, against
 *   Groq's hosted Whisper, which is both inexpensive and fast enough that a
 *   several-second command still comes back well inside the latency budget a
 *   push-to-talk interaction has. The trade is real and worth naming: this is
 *   request-response rather than word-by-word streaming, so the transcript
 *   appears right after release rather than while still speaking.
 */
export function VoiceAgent({
  open,
  onClose,
  context,
}: {
  open: boolean;
  onClose: () => void;
  context: () => VoiceAgentContext;
}) {
  const [muted, setMuted] = useState(false);
  const [typed, setTyped] = useState("");
  const { turns, thinking, submit } = useAgent({ context, muted });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const recorder = useRecorder();
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  /** True only while the button or the hotkey is physically held. */
  const [holding, setHolding] = useState(false);
  /** The same fact, readable synchronously — see `endHold`. */
  const holdingRef = useRef(false);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else recorderRef.current.cancel();
  }, [open]);

  /**
   * Ends the hold, wherever it finished, and dispatches whatever was said.
   *
   * One place owns "the gesture is over", because every way of ending it has
   * to do the same thing exactly once. Releasing the mouse off the button,
   * releasing Space, alt-tabbing mid-recording and the tab losing focus all
   * land here. Without the window-level listeners below the recorder would
   * keep capturing after the gesture visibly ended — the same trust-breaking
   * failure a stuck-open mic always is, regardless of which API is behind it.
   *
   * Guarded by a ref rather than the `holding` state so a second release
   * during the same tick cannot dispatch the command twice.
   */
  const beginHold = useCallback(() => {
    if (holdingRef.current) return;
    holdingRef.current = true;
    setHolding(true);
    void recorderRef.current.start();
  }, []);

  const endHold = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    void recorderRef.current.stopAndTranscribe().then(({ text, language }) => {
      if (text.trim()) void submit(text, language);
    });
  }, [submit]);

  const beginHoldRef = useRef(beginHold);
  beginHoldRef.current = beginHold;
  const endHoldRef = useRef(endHold);
  endHoldRef.current = endHold;

  /**
   * Hold Space to talk, release to send.
   *
   * Ignored while the text box has focus, where Space is a space. Bound on the
   * window rather than the panel so the gesture works with the desktop focused
   * — needing to click the panel first would defeat a push-to-talk key.
   */
  useEffect(() => {
    if (!open) return;

    const isTyping = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.hasAttribute("contenteditable");
    };

    const onDown = (e: KeyboardEvent) => {
      // `e.repeat` guards the auto-repeat a held key emits; without it every
      // repeat would restart the recording and drop what was captured so far.
      if (e.code !== "Space" || e.repeat || isTyping()) return;
      e.preventDefault();
      beginHoldRef.current();
    };

    const onUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping()) return;
      e.preventDefault();
      endHoldRef.current();
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [open]);

  useEffect(() => {
    if (!holding) return;
    window.addEventListener("pointerup", endHold);
    window.addEventListener("blur", endHold);
    return () => {
      window.removeEventListener("pointerup", endHold);
      window.removeEventListener("blur", endHold);
    };
  }, [holding, endHold]);

  // Pin to the newest turn. A transcript that has to be scrolled to see the
  // answer to what you just said is showing you the wrong end of itself.
  const turnCount = turns.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || turnCount === 0) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turnCount, thinking]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const send = () => {
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    void submit(text);
  };

  const busy = recorder.recording || recorder.transcribing;

  return (
    // A <section>, not a dialog, for the same reason window-frame.tsx is one:
    // the panel is non-modal. The desktop stays live underneath it and windows
    // open behind it while it is up, so it is a labelled region of the desktop
    // rather than something stacked over it demanding to be dismissed.
    <section
      aria-label="Voice agent"
      className={cn(
        "fixed bottom-6 left-1/2 z-[9600] w-[min(560px,calc(100vw-160px))] -translate-x-1/2",
        "overflow-hidden rounded-[16px] border-[3px] border-black bg-[#FDFBF7]",
        "shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]",
        "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.9)]",
      )}
    >
      <header className="flex items-center gap-2.5 border-b-[2.5px] border-black px-3.5 py-2.5 dark:border-[#EDE7DD]">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border-[2px] border-black",
            "dark:border-[#EDE7DD]",
            recorder.recording
              ? "bg-[#FBBF24] text-black"
              : "bg-white text-black dark:bg-[#2a2621] dark:text-[#EDE7DD]",
          )}
        >
          <Mic className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>

        <p className="flex-1 truncate text-[12.5px] font-bold tracking-[-0.01em] text-black dark:text-[#EDE7DD]">
          {recorder.recording ? "Recording…" : recorder.transcribing ? "Transcribing…" : "Voice agent"}
        </p>

        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-pressed={!muted}
          title={muted ? "Replies are silent. Click to hear them." : "Replies are spoken. Click to silence."}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-[6px] border-[2px] px-1.5 py-0.5",
            "text-[9.5px] font-bold uppercase tracking-[0.05em] transition-colors",
            muted
              ? "border-black/25 text-black/50 hover:border-black hover:text-black dark:border-[#EDE7DD]/25 dark:text-[#EDE7DD]/50 dark:hover:border-[#EDE7DD] dark:hover:text-[#EDE7DD]"
              : "border-black bg-[#A7F3D0] text-black dark:border-[#EDE7DD]",
          )}
        >
          {muted ? (
            <VolumeX className="h-3 w-3" strokeWidth={2.6} />
          ) : (
            <Volume2 className="h-3 w-3" strokeWidth={2.6} />
          )}
          {muted ? "Silent" : "Speaks"}
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close voice agent"
          className="rounded-[5px] p-1 text-black/45 transition-colors hover:text-black dark:text-[#EDE7DD]/45 dark:hover:text-[#EDE7DD]"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </header>

      <div ref={scrollRef} className="os-scroll max-h-[260px] min-h-[92px] overflow-y-auto px-3.5 py-3">
        {turns.length === 0 && (
          <div className="py-1.5">
            <p className="text-[12px] text-black/45 dark:text-[#EDE7DD]/45">
              Hold the button below (or Space) and speak. Or type.
            </p>
            <p className="mt-1 text-[11px] text-black/35 dark:text-[#EDE7DD]/35">
              Tip: hold{" "}
              <kbd className="rounded-[4px] border-[1.5px] border-black/25 px-1 py-0.5 font-mono text-[9.5px] font-semibold dark:border-[#EDE7DD]/25">
                Ctrl+Space
              </kbd>{" "}
              from anywhere on the desktop for push-to-talk without opening this panel.
            </p>
            <ul className="mt-2 space-y-1">
              {[
                "Open my tasks and the calendar",
                "Pull up the roadmap note",
                "Planning layout",
                "Close everything",
              ].map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => void submit(example)}
                    className="text-left text-[11.5px] font-medium text-black/55 underline-offset-2 transition-colors hover:text-black hover:underline dark:text-[#EDE7DD]/55 dark:hover:text-[#EDE7DD]"
                  >
                    “{example}”
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          {turns.map((turn) => (
            <div key={turn.id} className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}>
              <p
                className={cn(
                  "max-w-[86%] rounded-[9px] border-[2px] px-2.5 py-1.5 text-[12.5px] font-medium leading-snug",
                  turn.role === "user"
                    ? "border-black bg-[#FBBF24] text-black dark:border-[#EDE7DD]"
                    : turn.failed
                      ? "border-black bg-[#F3C7C7] text-black dark:border-[#EDE7DD]"
                      : "border-black bg-white text-black dark:border-[#EDE7DD] dark:bg-[#2a2621] dark:text-[#EDE7DD]",
                )}
              >
                {turn.text}
              </p>
            </div>
          ))}

          {recorder.transcribing && (
            <div className="flex items-center gap-1.5 justify-end pr-0.5 text-black/45 dark:text-[#EDE7DD]/45">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
              <span className="text-[11.5px] font-medium">Transcribing…</span>
            </div>
          )}

          {thinking && (
            <div className="flex items-center gap-1.5 pl-0.5 text-black/45 dark:text-[#EDE7DD]/45">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
              <span className="text-[11.5px] font-medium">Working on it…</span>
            </div>
          )}
        </div>
      </div>

      {recorder.error && (
        <p className="border-t-[2px] border-black/15 px-3.5 py-1.5 text-[11px] font-medium text-[#B45309] dark:border-[#EDE7DD]/15">
          {recorder.error}
        </p>
      )}

      {/* The primary control, and sized like one. A full-width bar that states
          the gesture and names the key is the difference between a control
          people find and one they miss. */}
      <div className="border-t-[2.5px] border-black px-3 pt-2.5 dark:border-[#EDE7DD]">
        <button
          type="button"
          disabled={recorder.transcribing}
          // Pointer events, not click: a hold has a beginning and an end, and
          // click only fires after both. The window-level pointerup above
          // closes the gesture when the cursor slides off the button
          // mid-hold, which would otherwise leave the recorder stuck open.
          onPointerDown={(e) => {
            e.preventDefault();
            beginHold();
          }}
          // No onPointerUp here: the window-level listener above owns the
          // release, so a hold that ends off the button behaves identically
          // to one that ends on it. Handling both would send twice.
          aria-pressed={recorder.recording}
          aria-label="Hold to talk"
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-[10px] border-[2.5px] border-black",
            "px-3 py-2.5 text-[12.5px] font-bold tracking-[-0.01em] select-none",
            "transition-[transform,box-shadow,background-color] duration-100 dark:border-[#EDE7DD]",
            "disabled:cursor-not-allowed disabled:opacity-40",
            recorder.recording
              ? // Pressed in: the shadow is gone and the button has moved into
                // it, the same affordance the dock uses for an active press.
                "translate-x-[2px] translate-y-[2px] bg-[#FBBF24] text-black shadow-none"
              : cn(
                  "bg-white text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:bg-[#2a2621] dark:text-[#EDE7DD]",
                  "hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
                  "dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.9)] dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.9)]",
                ),
          )}
        >
          {busy ? (
            <Mic className="h-4 w-4 shrink-0" strokeWidth={2.6} />
          ) : (
            <MicOff className="h-4 w-4 shrink-0" strokeWidth={2.6} />
          )}

          <span>
            {recorder.recording
              ? "Recording — release to send"
              : recorder.transcribing
                ? "Transcribing…"
                : "Hold to talk"}
          </span>

          {!busy && (
            <kbd className="ml-0.5 rounded-[4px] border-[1.5px] border-black/25 px-1.5 py-0.5 font-mono text-[10px] font-bold text-black/45 dark:border-[#EDE7DD]/25 dark:text-[#EDE7DD]/45">
              SPACE
            </kbd>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5">
        <input
          ref={inputRef}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Or type a command…"
          aria-label="Command"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none",
            "text-black placeholder:text-black/30 dark:text-[#EDE7DD] dark:placeholder:text-[#EDE7DD]/30",
          )}
        />

        <button
          type="button"
          onClick={send}
          disabled={!typed.trim()}
          aria-label="Send command"
          className="shrink-0 rounded-[6px] p-1.5 text-black/45 transition-colors hover:text-black disabled:opacity-30 dark:text-[#EDE7DD]/45 dark:hover:text-[#EDE7DD]"
        >
          <CornerDownLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </section>
  );
}
