"use client";

import { Desktop } from "@/components/os/desktop";
import { cn } from "@/lib/utils";
import { Suspense, useEffect, useState } from "react";

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
      <Dashboard2Content />
    </Suspense>
  );
}

function Dashboard2Content() {
  // God Mode leaves this flag right before the route swap so the desktop can
  // materialize in on arrival — the mirror of the dissolve it just watched on
  // /dashboard, rather than a plain page load.
  const [arrivedViaGodMode, setArrivedViaGodMode] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("luman_god_mode_entry") === "1") {
      sessionStorage.removeItem("luman_god_mode_entry");
      setArrivedViaGodMode(true);
    }
  }, []);

  return (
    <div className={cn("h-screen w-screen", arrivedViaGodMode && "god-mode-materializing")}>
      <Desktop />
    </div>
  );
}
