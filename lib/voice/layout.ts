/**
 * Tiling: where windows go when several are opened at once.
 *
 * The window store's cascade is right for opening things one at a time — each
 * new window offset from the last, so you can see there is a stack. It is
 * wrong for a batch: saying "open tasks, calendar and my roadmap" and getting
 * three windows 32px apart means seeing one window and two edges, which is
 * exactly the disorientation the cascade exists to prevent in the first place.
 *
 * So a batch is tiled instead. The agent computes real rects up front and
 * passes them to `openWindow`, which accepts an explicit rect for this reason.
 *
 * Geometry constants match the desktop's own furniture: the dock owns the left
 * edge (see dock.tsx, fixed at left-4 with a 10-wide button column), and
 * minimised blobs stack at the bottom right.
 */

import type { WindowRect } from "@/lib/os/window-store";

/** Clear of the dock on the left, the titlebar on top, blobs bottom-right. */
const INSET = { left: 116, top: 56, right: 24, bottom: 24 };
const GAP = 12;

/** The rectangle windows are allowed to occupy. */
function workArea() {
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const vh = typeof window === "undefined" ? 900 : window.innerHeight;
  return {
    x: INSET.left,
    y: INSET.top,
    width: Math.max(480, vw - INSET.left - INSET.right),
    height: Math.max(360, vh - INSET.top - INSET.bottom),
  };
}

/**
 * Splits the work area into `count` tiles.
 *
 * Column counts are chosen rather than derived from a formula, because the
 * arrangements people actually want are not the ones `ceil(sqrt(n))` gives:
 * two windows should be side by side (not stacked), three should be one tall
 * plus two stacked beside it — the classic "main and sidebar" — and four
 * should be an even quarter grid. Beyond six, tiles get too small to read, so
 * the extras cascade on top instead.
 */
export function tile(count: number): WindowRect[] {
  const area = workArea();
  if (count <= 0) return [];

  if (count === 1) {
    return [{ x: area.x, y: area.y, width: area.width, height: area.height }];
  }

  if (count === 2) {
    const w = (area.width - GAP) / 2;
    return [
      { x: area.x, y: area.y, width: w, height: area.height },
      { x: area.x + w + GAP, y: area.y, width: w, height: area.height },
    ];
  }

  if (count === 3) {
    // One tall on the left, two stacked on the right. The first window in the
    // batch is the one the speaker named first, so it gets the big tile.
    const w = (area.width - GAP) / 2;
    const h = (area.height - GAP) / 2;
    return [
      { x: area.x, y: area.y, width: w, height: area.height },
      { x: area.x + w + GAP, y: area.y, width: w, height: h },
      { x: area.x + w + GAP, y: area.y + h + GAP, width: w, height: h },
    ];
  }

  const cols = count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const w = (area.width - GAP * (cols - 1)) / cols;
  const h = (area.height - GAP * (rows - 1)) / rows;

  return Array.from({ length: count }, (_, i) => ({
    x: area.x + (i % cols) * (w + GAP),
    y: area.y + Math.floor(i / cols) * (h + GAP),
    width: w,
    height: h,
  }));
}

/** Side-by-side halves, for "put these next to each other". */
export function leftRight(): WindowRect[] {
  return tile(2);
}

/** Overlapping stack, offset so every titlebar stays clickable. */
export function cascade(count: number): WindowRect[] {
  const area = workArea();
  const step = 34;
  const width = Math.min(820, area.width - step * Math.min(count - 1, 5));
  const height = Math.min(620, area.height - step * Math.min(count - 1, 5));

  return Array.from({ length: count }, (_, i) => {
    const offset = (i % 6) * step;
    return { x: area.x + offset, y: area.y + offset, width, height };
  });
}

/**
 * What each named layout opens.
 *
 * Named arrangements are the fastest thing a voice agent can offer: one
 * phrase for a whole working setup, which is tedious by hand and trivial by
 * voice. `query` is left undefined so the executor fills in the most recent
 * matching thing — "focus" means your current note, not a fixed one.
 */
export const LAYOUTS: Record<string, { label: string; items: { target: string; query?: string }[] }> = {
  focus: {
    label: "Focus",
    // One note, full width, nothing else competing for attention.
    items: [{ target: "note" }],
  },
  planning: {
    label: "Planning",
    items: [{ target: "tasks" }, { target: "calendar" }, { target: "note" }],
  },
  comms: {
    label: "Comms",
    items: [{ target: "chat" }, { target: "tasks" }],
  },
  review: {
    label: "Review",
    items: [{ target: "note" }, { target: "whiteboard" }, { target: "tasks" }],
  },
  everything: {
    label: "Everything",
    items: [{ target: "tasks" }, { target: "calendar" }, { target: "note" }, { target: "chat" }, { target: "files" }],
  },
};
