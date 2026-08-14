"use client";

/**
 * The window manager.
 *
 * Luman v2 treats the dashboard as a desktop rather than a page: notes, chats,
 * tasks and calendars all open as windows that live side by side, get dragged
 * around, maximised for focus, and minimised into pills along the dock.
 *
 * State lives in one store rather than in each window because the things that
 * make a desktop feel like a desktop are all cross-window concerns — which
 * window is on top, what the next one should cascade to, which are minimised
 * and in what order they sit in the dock.
 *
 * Deliberately dependency-free: a reducer plus a subscription, so the desktop
 * does not pull in a state library the rest of the app does not use.
 */

import { useCallback, useSyncExternalStore } from "react";

/** What a window contains. Each maps to a renderer in window-registry.tsx. */
export type WindowKind =
  | "note"
  | "chat"
  | "tasks"
  | "calendar"
  | "workspace"
  | "whiteboard"
  | "voice"
  | "settings"
  | "search";

export type WindowRect = { x: number; y: number; width: number; height: number };

export type WindowState = {
  id: string;
  kind: WindowKind;
  title: string;
  /** Free-form payload the renderer interprets — a note id, a channel id, … */
  payload?: Record<string, unknown>;
  rect: WindowRect;
  /** Restored to when un-maximising. Null until the window is first maximised. */
  restoreRect: WindowRect | null;
  minimized: boolean;
  maximized: boolean;
  z: number;
  /**
   * Where this window's blob sits while minimised.
   *
   * Null means "wherever the automatic stack puts it" — the blob takes its
   * place in the bottom-left column and shuffles as neighbours come and go.
   * Once the user drags a blob it gets an explicit position and stops
   * participating in the stack, because a blob that snapped back after being
   * moved would be ignoring a direct instruction.
   */
  blob: { x: number; y: number } | null;
};

export type DesktopTheme = {
  /** Wallpaper id, resolved to a background by the desktop component. */
  wallpaper: string;
  /** Accent used by window chrome and the dock. */
  accent: string;
  /** Whether the grid shows through the wallpaper. */
  grid: boolean;
};

/**
 * Which browser the dock has open beside it, if any.
 *
 * A flyout is not a window: it is a transient picker anchored to the dock, it
 * never appears in the dock's minimised pills, and opening a second one
 * replaces the first. Modelling it as a window would put "Workspaces" in the
 * pill tray as if it were a document, which it is not.
 */
export type FlyoutKind = "workspaces" | "chats" | "boards" | "calls" | null;

type DesktopState = {
  windows: WindowState[];
  focusedId: string | null;
  nextZ: number;
  /** Where the next opened window is placed, so they cascade rather than stack. */
  cascade: number;
  theme: DesktopTheme;
  flyout: FlyoutKind;
};

const DEFAULT_THEME: DesktopTheme = {
  wallpaper: "paper",
  accent: "#FBBF24",
  grid: true,
};

const INITIAL: DesktopState = {
  windows: [],
  focusedId: null,
  nextZ: 1,
  cascade: 0,
  theme: DEFAULT_THEME,
  flyout: null,
};

/** Default size per kind. A chat wants to be tall; a calendar wants to be wide. */
const DEFAULT_SIZE: Record<WindowKind, { width: number; height: number }> = {
  note: { width: 720, height: 560 },
  chat: { width: 460, height: 620 },
  tasks: { width: 640, height: 580 },
  calendar: { width: 860, height: 600 },
  workspace: { width: 560, height: 520 },
  // A board wants room to draw; a call is a small status panel.
  whiteboard: { width: 900, height: 640 },
  voice: { width: 360, height: 420 },
  settings: { width: 620, height: 500 },
  search: { width: 640, height: 420 },
};

const CASCADE_STEP = 32;
const CASCADE_WRAP = 6;

let state: DesktopState = INITIAL;
const listeners = new Set<() => void>();

function setState(next: DesktopState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

/** Server render has no desktop; an empty one keeps useSyncExternalStore happy. */
function getServerSnapshot() {
  return INITIAL;
}

/**
 * Where a newly opened window lands.
 *
 * Cascading from the top-left of the usable area — not centred — because a
 * centred window would sit exactly on top of the previous one, which is the
 * single most disorienting thing a window manager can do.
 */
function placeWindow(kind: WindowKind, cascade: number): WindowRect {
  const size = DEFAULT_SIZE[kind];
  const offset = (cascade % CASCADE_WRAP) * CASCADE_STEP;

  // Falls back to a sane viewport during SSR, where `window` does not exist.
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;

  // The dock occupies the left edge, so windows start clear of it.
  const left = 132 + offset;
  const top = 72 + offset;

  return {
    x: Math.min(left, Math.max(132, vw - size.width - 40)),
    y: Math.min(top, Math.max(72, vh - size.height - 40)),
    width: Math.min(size.width, vw - left - 40),
    height: Math.min(size.height, vh - top - 40),
  };
}

/**
 * Opens a window, or focuses the existing one when `dedupeKey` matches.
 *
 * Deduping matters for notes and chats: clicking the same note in the sidebar
 * twice should raise the window you already have open, not stack a second copy
 * of it on top of the first.
 */
export function openWindow(input: {
  kind: WindowKind;
  title: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
}) {
  const key = input.dedupeKey ?? `${input.kind}:${JSON.stringify(input.payload ?? {})}`;
  const existing = state.windows.find((w) => w.id === key);

  if (existing) {
    focusWindow(key);
    // Raising a minimised window should also restore it — the click means
    // "show me this", not "bring the hidden thing to the front".
    if (existing.minimized) toggleMinimize(key);
    return key;
  }

  const rect = placeWindow(input.kind, state.cascade);
  const next: WindowState = {
    id: key,
    kind: input.kind,
    title: input.title,
    payload: input.payload,
    rect,
    restoreRect: null,
    minimized: false,
    maximized: false,
    z: state.nextZ,
    blob: null,
  };

  setState({
    ...state,
    windows: [...state.windows, next],
    focusedId: key,
    nextZ: state.nextZ + 1,
    cascade: state.cascade + 1,
    // Picking something from a flyout is the end of that errand — the picker
    // dismisses itself rather than lingering over the window it just opened.
    flyout: null,
  });

  return key;
}

/** Opens a flyout, or closes it when it is already the open one. */
export function toggleFlyout(kind: Exclude<FlyoutKind, null>) {
  setState({ ...state, flyout: state.flyout === kind ? null : kind });
}

export function closeFlyout() {
  if (state.flyout === null) return;
  setState({ ...state, flyout: null });
}

export function closeWindow(id: string) {
  const remaining = state.windows.filter((w) => w.id !== id);
  setState({
    ...state,
    windows: remaining,
    // Focus falls to whatever is visually on top of what is left, so closing
    // the front window does not leave the desktop with nothing focused.
    focusedId:
      state.focusedId === id
        ? (remaining.filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ?? null)
        : state.focusedId,
  });
}

export function focusWindow(id: string) {
  const target = state.windows.find((w) => w.id === id);
  if (!target) return;
  // Already on top: skip the state churn so dragging does not rewrite z on
  // every pointer move.
  if (state.focusedId === id && target.z === state.nextZ - 1) return;

  setState({
    ...state,
    focusedId: id,
    nextZ: state.nextZ + 1,
    windows: state.windows.map((w) => (w.id === id ? { ...w, z: state.nextZ } : w)),
  });
}

export function toggleMinimize(id: string) {
  setState({
    ...state,
    windows: state.windows.map((w) => (w.id === id ? { ...w, minimized: !w.minimized } : w)),
    focusedId: state.focusedId === id ? null : state.focusedId,
  });
}

/**
 * Maximise fills the workspace minus the dock; restoring returns the window to
 * exactly where it was. The pre-maximise rect is stashed rather than recomputed
 * so a maximise/restore round trip is lossless.
 */
export function toggleMaximize(id: string) {
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;

  setState({
    ...state,
    windows: state.windows.map((w) => {
      if (w.id !== id) return w;
      if (w.maximized) {
        return { ...w, maximized: false, rect: w.restoreRect ?? w.rect, restoreRect: null };
      }
      return {
        ...w,
        maximized: true,
        restoreRect: w.rect,
        rect: { x: 116, y: 56, width: vw - 148, height: vh - 92 },
      };
    }),
  });
}

/** Live drag/resize. Called at pointer-move rate, so it touches one window. */
export function moveWindow(id: string, rect: Partial<WindowRect>) {
  setState({
    ...state,
    windows: state.windows.map((w) => (w.id === id ? { ...w, rect: { ...w.rect, ...rect } } : w)),
  });
}

/** Geometry of the minimised-blob column, shared with the renderer. */
export const BLOB_SIZE = 46;
export const BLOB_GAP = 10;
/** Distance from the right edge of the viewport to the blob column. */
export const BLOB_ORIGIN_RIGHT = 20;
/** Distance from the bottom of the viewport to the first blob's bottom edge. */
export const BLOB_ORIGIN_BOTTOM = 20;

/**
 * Resting place for the nth blob in the automatic stack.
 *
 * Bottom-right, counted upward: the first minimised window sits lowest and
 * later ones stack above it. The right edge keeps the column clear of the
 * dock, which owns the left.
 */
export function blobSlot(index: number) {
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;
  return {
    x: vw - BLOB_ORIGIN_RIGHT - BLOB_SIZE,
    y: vh - BLOB_ORIGIN_BOTTOM - BLOB_SIZE - index * (BLOB_SIZE + BLOB_GAP),
  };
}

/** Pins a blob to an explicit spot, taking it out of the automatic stack. */
export function moveBlob(id: string, position: { x: number; y: number }) {
  setState({
    ...state,
    windows: state.windows.map((w) => (w.id === id ? { ...w, blob: position } : w)),
  });
}

export function setTheme(patch: Partial<DesktopTheme>) {
  setState({ ...state, theme: { ...state.theme, ...patch } });
}

/** Minimise everything — the "show desktop" gesture. */
export function minimizeAll() {
  setState({
    ...state,
    windows: state.windows.map((w) => ({ ...w, minimized: true })),
    focusedId: null,
  });
}

export function useDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Stable action bundle, so consumers do not re-render on every state change. */
export function useDesktopActions() {
  return {
    open: useCallback(openWindow, []),
    close: useCallback(closeWindow, []),
    focus: useCallback(focusWindow, []),
    minimize: useCallback(toggleMinimize, []),
    maximize: useCallback(toggleMaximize, []),
    move: useCallback(moveWindow, []),
    theme: useCallback(setTheme, []),
    minimizeAll: useCallback(minimizeAll, []),
    toggleFlyout: useCallback(toggleFlyout, []),
    closeFlyout: useCallback(closeFlyout, []),
    moveBlob: useCallback(moveBlob, []),
  };
}
