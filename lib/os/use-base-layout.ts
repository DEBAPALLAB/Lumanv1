"use client";

import type { Channel, Workspace } from "@/lib/os/use-org-data";
import { type WindowRect, useDesktopActions } from "@/lib/os/window-store";
import { useEffect, useRef } from "react";

const STORAGE_PREFIX = "luman_desktop_seeded_";

/** Dock plus a little breathing room, mirrored from the window store's own placement. */
const LEFT_MARGIN = 132;
const TOP_MARGIN = 72;
const EDGE_MARGIN = 40;
const GUTTER = 16;

/**
 * Lays out up to four windows in a 2x2 grid instead of the default cascade.
 *
 * The cascade is built for one-at-a-time opens and steps each new window only
 * 32px down-right — fine normally, but four windows opened back to back end up
 * almost fully stacked with only title bars peeking out. A seeded desktop is
 * the one moment several windows appear at once, so it earns its own layout.
 */
function tileQuadrants(vw: number, vh: number): WindowRect[] {
  const usableW = vw - LEFT_MARGIN - EDGE_MARGIN;
  const usableH = vh - TOP_MARGIN - EDGE_MARGIN;
  const cellW = (usableW - GUTTER) / 2;
  const cellH = (usableH - GUTTER) / 2;

  return [0, 1, 2, 3].map((i) => ({
    x: LEFT_MARGIN + (i % 2) * (cellW + GUTTER),
    y: TOP_MARGIN + Math.floor(i / 2) * (cellH + GUTTER),
    width: cellW,
    height: cellH,
  }));
}

/**
 * Opens a starter set of windows the first time a given user ever reaches the
 * desktop, so it doesn't greet them with an empty room. After that first
 * seed it never fires again for that user — closing every window later is a
 * deliberate "show desktop", not a state to keep correcting.
 *
 * Keyed by user id in localStorage rather than window-count: seeding off "zero
 * windows open" would refill the desktop every time someone cleared it.
 */
export function useBaseLayout({
  userId,
  workspaces,
  channels,
  loading,
}: {
  userId: string | null;
  workspaces: Workspace[];
  channels: Channel[];
  loading: boolean;
}) {
  const actions = useDesktopActions();
  const seededRef = useRef(false);

  useEffect(() => {
    if (loading || !userId || seededRef.current) return;

    const key = `${STORAGE_PREFIX}${userId}`;
    if (localStorage.getItem(key)) {
      seededRef.current = true;
      return;
    }

    const slots = tileQuadrants(window.innerWidth, window.innerHeight);
    let slot = 0;

    actions.open({ kind: "tasks", title: "My tasks", rect: slots[slot++] });
    actions.open({ kind: "calendar", title: "Calendar", rect: slots[slot++] });

    const orgChannel = channels.find((c) => c.scope === "organization");
    if (orgChannel) {
      actions.open({
        kind: "chat",
        title: `# ${orgChannel.name}`,
        payload: { channelId: orgChannel.id, channelName: orgChannel.name },
        dedupeKey: `chat:${orgChannel.id}`,
        rect: slots[slot++],
      });
    }

    const firstWorkspace = workspaces[0];
    if (firstWorkspace) {
      actions.open({
        kind: "workspace",
        title: firstWorkspace.owner_name,
        payload: { workspaceId: firstWorkspace.id },
        dedupeKey: `workspace:${firstWorkspace.id}`,
        rect: slots[slot++],
      });
    }

    localStorage.setItem(key, "1");
    seededRef.current = true;
  }, [loading, userId, workspaces, channels, actions]);
}
