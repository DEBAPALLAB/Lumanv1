"use client";

import { Desktop } from "@/components/os/desktop";
import { Suspense } from "react";

/**
 * Luman v2 — the workspace OS.
 *
 * Mounted at /dashboard2 rather than replacing /dashboard so the two can be
 * compared side by side while this is being built. Marketing and auth routes
 * are untouched: this surface sits entirely behind them.
 *
 * NOT wrapped in AppShell. The desktop *is* the shell — a second navigation
 * column above a window manager would defeat the point.
 */
export default function Dashboard2Page() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#FDFBF7] dark:bg-zinc-950" />}>
      <Desktop />
    </Suspense>
  );
}
