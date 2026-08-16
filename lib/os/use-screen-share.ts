"use client";

import type { DesktopCaptureSource } from "@/types/electron";
import { useCallback, useRef, useState } from "react";

/**
 * Acquiring a screen-share stream, on both builds.
 *
 * The two platforms need opposite orders of operations. In the browser,
 * getDisplayMedia() *is* the picker — one call shows Chrome's own chooser and
 * resolves with the stream. In Electron there is no built-in chooser at all:
 * the app has to list sources itself, let the user pick, tell the main process
 * which one won, and only then call getDisplayMedia(). Hiding that difference
 * here keeps the call window from branching on `isDesktop` in three places.
 *
 * `sources` is non-empty only while the desktop picker is open; the web path
 * never populates it.
 */
export type ScreenShareState = {
  stream: MediaStream | null;
  sharing: boolean;
  /** Desktop only: sources awaiting a choice. Empty while the picker is closed. */
  sources: DesktopCaptureSource[];
  pickerOpen: boolean;
  /** Set when a share attempt failed for a reason worth showing. */
  error: string | null;
};

export function useScreenShare({
  onStart,
  onStop,
}: {
  /** Called with the new stream once capture begins. */
  onStart: (stream: MediaStream) => void | Promise<void>;
  onStop: () => void | Promise<void>;
}) {
  const [state, setState] = useState<ScreenShareState>({
    stream: null,
    sharing: false,
    sources: [],
    pickerOpen: false,
    error: null,
  });

  const streamRef = useRef<MediaStream | null>(null);
  // Held in a ref as well as state so `stop` can be called from a track's
  // `onended` handler without being recreated on every stream change.
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  const stop = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    setState((prev) => ({ ...prev, stream: null, sharing: false }));
    void onStopRef.current();
  }, []);

  /** Wires a freshly acquired stream up and reports it to the caller. */
  const adopt = useCallback(
    async (stream: MediaStream) => {
      streamRef.current = stream;

      // Ending the share from the browser's own "Stop sharing" bar fires here.
      // Without this the UI would keep claiming it was sharing a dead track.
      for (const track of stream.getVideoTracks()) {
        track.addEventListener("ended", () => stop(), { once: true });
      }

      setState((prev) => ({ ...prev, stream, sharing: true, error: null, pickerOpen: false, sources: [] }));
      await onStart(stream);
    },
    [onStart, stop],
  );

  /**
   * Begins a share. On the web this immediately shows Chrome's picker; on the
   * desktop it opens the in-app picker and waits for `pick`.
   */
  const start = useCallback(async () => {
    const api = window.electronAPI;

    if (api?.screen) {
      try {
        const sources = await api.screen.getSources();
        setState((prev) => ({ ...prev, sources, pickerOpen: true, error: null }));
      } catch {
        setState((prev) => ({ ...prev, error: "Could not list windows to share." }));
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      await adopt(stream);
    } catch (err) {
      // A user dismissing the picker is not an error worth surfacing.
      const aborted = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError");
      setState((prev) => ({ ...prev, error: aborted ? null : "Screen sharing failed to start." }));
    }
  }, [adopt]);

  /** Desktop only: commits to one of the listed sources. */
  const pick = useCallback(
    async (sourceId: string) => {
      const api = window.electronAPI;
      if (!api?.screen) return;

      try {
        await api.screen.selectSource(sourceId);
        // The main process resolves this against the id just nominated. The
        // constraint object is ignored by Electron's handler but has to be
        // present for getDisplayMedia to be called at all.
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 30 } },
          audio: false,
        });
        await adopt(stream);
      } catch {
        await api.screen.cancelSelection().catch(() => {});
        setState((prev) => ({
          ...prev,
          pickerOpen: false,
          sources: [],
          error: "Screen sharing failed to start.",
        }));
      }
    },
    [adopt],
  );

  const closePicker = useCallback(() => {
    void window.electronAPI?.screen?.cancelSelection().catch(() => {});
    setState((prev) => ({ ...prev, pickerOpen: false, sources: [] }));
  }, []);

  return { ...state, start, stop, pick, closePicker };
}
