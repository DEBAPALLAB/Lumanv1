"use client";

/**
 * Microphone in, audio blob out — the cross-browser alternative to
 * SpeechRecognition.
 *
 * `MediaRecorder` is an actual web standard, unlike `webkitSpeechRecognition`
 * (see the note at the top of app/api/voice/transcribe/route.ts for why that
 * distinction turned out to matter: SpeechRecognition failed identically on
 * two different browsers on the same machine — a Chrome install with a broken
 * internal speech component, and Comet, which does not carry Google's private
 * speech integration at all — while `MediaRecorder` has none of that
 * dependency, because it does not talk to a speech backend itself. It only
 * records; a server route does the transcribing.
 *
 * WHY A SEPARATE HOOK RATHER THAN EXTENDING use-speech.ts
 *   The two have almost nothing in common operationally. SpeechRecognition is
 *   push-and-forget: start it, results stream in continuously, no upload.
 *   This is record-then-upload: hold, capture into a Blob, release, send the
 *   whole clip in one request. Bolting record/upload into the recognition
 *   hook would mean every consumer carries both code paths regardless of
 *   which one actually runs — the panel picks between the two hooks instead
 *   (see use-agent.ts / voice-agent.tsx), so each hook stays what it already
 *   is.
 */

import { useCallback, useRef, useState } from "react";

export type RecorderState = {
  /** True while actively capturing audio. */
  recording: boolean;
  /** True while the finished clip is uploading and being transcribed. */
  transcribing: boolean;
  error: string | null;
  /** Begins capture. Resolves once the mic is actually recording. */
  start: () => Promise<void>;
  /** Stops capture, uploads the clip, and returns its transcript and the
   *  spoken language Whisper detected (an ISO 639-1 code such as "en", "hi",
   *  "mr"), so the reply can be spoken back in a matching voice. */
  stopAndTranscribe: () => Promise<{ text: string; language: string }>;
  /** Stops capture and discards it — no upload, no transcript. */
  cancel: () => void;
};

/** MediaRecorder's own guess for a widely-supported, small audio container. */
function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

export function useRecorder(): RecorderState {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const releaseStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorderRef.current = recorder;
      // Timesliced so a chunk exists even if stop() races the very first
      // dataavailable event on an unusually short press.
      recorder.start(250);
      setRecording(true);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was blocked."
          : `Could not start the microphone (${name || (err instanceof Error ? err.message : String(err))}).`,
      );
      releaseStream();
    }
  }, [releaseStream]);

  /** Resolves once the recorder has flushed its final chunk. */
  const stopCapture = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return Promise.resolve(null);

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: recorder.mimeType }) : null;
        chunksRef.current = [];
        resolve(blob);
      };
      // Already inactive (e.g. the track ended underneath it) — onstop will
      // not fire in that case, so resolve directly rather than hanging.
      if (recorder.state === "inactive") resolve(null);
      else recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    void stopCapture();
    recorderRef.current = null;
    releaseStream();
    setRecording(false);
  }, [stopCapture, releaseStream]);

  const stopAndTranscribe = useCallback(async (): Promise<{ text: string; language: string }> => {
    const recorder = recorderRef.current;
    if (!recorder) return { text: "", language: "" };

    const blob = await stopCapture();
    recorderRef.current = null;
    releaseStream();
    setRecording(false);

    // Recordings under this are almost always the click of stopping the mic
    // rather than a spoken word — uploading them just spends money to learn
    // "no speech detected".
    if (!blob || blob.size < 800) return { text: "", language: "" };

    setTranscribing(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("audio", blob, "clip.webm");

      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      if (!res.ok) {
        const detail = await res
          .json()
          .then((b: { error?: string }) => b?.error ?? "")
          .catch(() => "");
        throw new Error(detail || `Transcription failed (${res.status})`);
      }

      const body = (await res.json()) as { text?: string; language?: string };
      return { text: body.text ?? "", language: body.language ?? "" };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
      return { text: "", language: "" };
    } finally {
      setTranscribing(false);
    }
  }, [stopCapture, releaseStream]);

  return { recording, transcribing, error, start, stopAndTranscribe, cancel };
}
