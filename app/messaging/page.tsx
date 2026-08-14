"use client";

import { ChatShell } from "@/components/messaging/chat-shell";
import { FloatingDock } from "@/components/ui/floating-dock";
import { Suspense } from "react";

function MessagingContent() {
  // Deliberately NOT wrapped in AppShell. Chat is a focus surface: it keeps
  // the app's floating dock for breadcrumb navigation, but replaces the
  // workspace tree with its own channel list rather than stacking two
  // navigation columns before the conversation ever starts.
  //
  // h-screen with overflow-hidden makes this the only scroll container on the
  // page — the transcript scrolls inside itself and the composer stays put,
  // which is the whole point of a chat layout.
  return (
    <div className="h-screen overflow-hidden bg-[#FDFBF7] dark:bg-zinc-950">
      {/* The dock is normally centred, which lands it straight on top of the
          channel header. Chat pins it to the right instead, where it sits over
          the transcript's empty upper area and clears the header entirely. */}
      <FloatingDock className="left-auto right-6 translate-x-0" />
      <ChatShell />
    </div>
  );
}

export default function MessagingPage() {
  // The boundary sits outside everything that reads useSearchParams — both
  // FloatingDock and ChatShell do — so the prerender cannot bail out above it.
  return (
    <Suspense
      fallback={
        // Matches the panel structure ChatShell renders, so the handoff from
        // this fallback to the real layout does not visibly reflow.
        <div className="flex h-screen overflow-hidden bg-[#FDFBF7] dark:bg-zinc-950" aria-busy="true">
          <div className="w-[76px] shrink-0 border-r-[3px] border-black dark:border-stone-100" />
          <div className="w-60 shrink-0 border-r-[3px] border-black bg-white dark:border-stone-100 dark:bg-zinc-900" />
          <div className="flex-1">
            <div className="h-[56px] border-b-[3px] border-black bg-white dark:border-stone-100 dark:bg-zinc-900" />
          </div>
        </div>
      }
    >
      <MessagingContent />
    </Suspense>
  );
}
