"use client";

import { cn } from "@/lib/utils";
import { Calendar, CheckSquare, Home, Layers, MessageSquare, Settings } from "lucide-react";
import Link from "next/link";
import { FOCUS_RING, FRAME } from "./chrome";

/**
 * The narrow app-level icon column, kept so chat's focus mode does not become
 * a dead end — the workspace tree is gone, but Dashboard, Tasks and Calendar
 * are still one click away.
 *
 * A trimmed copy of the rail in workspace-sidebar.tsx rather than an import:
 * that component owns workspace/folder/note state and a workspaces toggle,
 * none of which exist here. Sharing it would mean parameterising it against
 * two quite different surfaces for the sake of six links.
 */
export function AppRail({ orgSlug }: { orgSlug: string | null }) {
  const suffix = orgSlug ? `?org=${orgSlug}` : "";

  const items = [
    { label: "Dashboard", icon: Home, href: `/dashboard${suffix}` },
    { label: "Workspaces", icon: Layers, href: `/dashboard${suffix}` },
    { label: "My Tasks", icon: CheckSquare, href: `/dashboard/tasks${suffix}` },
    { label: "All Events", icon: Calendar, href: `/calendar${suffix}` },
    { label: "Team Chat", icon: MessageSquare, href: `/messaging${suffix}`, active: true },
    { label: "Settings", icon: Settings, href: `/settings${suffix}` },
  ];

  return (
    <nav
      className={cn(
        "flex w-[76px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r-[3px] py-4 scrollbar-none",
        FRAME,
        "bg-[#FDFBF7] dark:bg-zinc-950",
      )}
      aria-label="Sections"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="group relative">
            <Link
              href={item.href}
              prefetch
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-[10px] border-[2.5px]",
                "transition-[transform,box-shadow,background-color] duration-150",
                FOCUS_RING,
                item.active
                  ? cn(
                      "bg-[#FBBF24] text-black",
                      FRAME,
                      "shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2.5px_2.5px_0px_0px_rgba(255,255,255,1)]",
                    )
                  : cn(
                      "border-transparent bg-transparent text-black/45 dark:text-stone-100/45",
                      "hover:border-black/15 hover:bg-black/[0.05] hover:text-black",
                      "dark:hover:border-stone-100/15 dark:hover:bg-stone-100/[0.07] dark:hover:text-stone-100",
                    ),
              )}
            >
              <Icon className="h-[19px] w-[19px]" strokeWidth={item.active ? 2.5 : 2} />
            </Link>

            {/* Tooltip. Fades and slides rather than snapping, and stays
                pointer-events-none so it can never intercept a click meant for
                the icon behind it. */}
            <span
              role="tooltip"
              className={cn(
                "pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 translate-x-[-4px]",
                "whitespace-nowrap rounded-[6px] border-[2px] px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.02em]",
                FRAME,
                "bg-black text-[#FBBF24] dark:bg-stone-100 dark:text-black",
                "opacity-0 transition-[opacity,transform] duration-150",
                "group-hover:translate-x-0 group-hover:opacity-100",
              )}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
