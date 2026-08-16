"use client";

import { useDesktop, useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  CheckSquare,
  LayoutGrid,
  type LucideIcon,
  MessageSquare,
  PenTool,
  Phone,
  Search,
  Settings,
  StickyNote,
} from "lucide-react";

/** Icon per window kind, shared by the launcher and the minimised pills. */
export const KIND_ICON: Record<string, LucideIcon> = {
  note: StickyNote,
  chat: MessageSquare,
  tasks: CheckSquare,
  calendar: CalendarDays,
  workspace: LayoutGrid,
  whiteboard: PenTool,
  voice: Phone,
  settings: Settings,
  search: Search,
};

/**
 * The floating left rail — the single go-to surface.
 *
 * Launchers only. Minimised windows are draggable blobs on the desktop
 * (minimized-blobs.tsx) rather than pills in here: a minimised window is still
 * an object you placed, and burying eight of them in fixed furniture turns
 * them into a list you scan instead.
 */
export function Dock({ onSpotlight }: { onSpotlight: () => void }) {
  const desktop = useDesktop();
  const actions = useDesktopActions();

  // Two kinds of dock button, and the difference is the whole interaction
  // model: a *browser* opens a picker beside the dock, an *app* opens straight
  // onto the desktop. Workspaces and Chats are browsers — you open them to
  // choose a note or a channel, not to look at a list of them.
  const launchers: {
    kind: keyof typeof KIND_ICON;
    label: string;
    run: () => void;
    /** True when this button opens the flyout rather than a window. */
    browser?: "workspaces" | "chats" | "boards" | "calls";
  }[] = [
    {
      kind: "workspace",
      label: "Workspaces",
      browser: "workspaces",
      run: () => actions.toggleFlyout("workspaces"),
    },
    {
      kind: "chat",
      label: "Channels",
      browser: "chats",
      run: () => actions.toggleFlyout("chats"),
    },
    {
      kind: "whiteboard",
      label: "Whiteboards",
      browser: "boards",
      run: () => actions.toggleFlyout("boards"),
    },
    {
      kind: "voice",
      label: "Voice calls",
      browser: "calls",
      run: () => actions.toggleFlyout("calls"),
    },
    { kind: "tasks", label: "My tasks", run: () => actions.open({ kind: "tasks", title: "My tasks" }) },
    { kind: "calendar", label: "Calendar", run: () => actions.open({ kind: "calendar", title: "Calendar" }) },
  ];

  return (
    <nav
      aria-label="Dock"
      className={cn(
        // The titlebar in the Electron app shrinks the space below it without
        // moving the fixed containing block, so a bare 50% centres against the
        // full OS window instead of the visible desktop — offset by half the
        // titlebar's height to land on the true visual centre either way.
        "fixed left-4 top-[calc(50%_+_var(--titlebar-h)/2)] z-[9000] -translate-y-1/2",
        "flex flex-col items-center gap-2 rounded-[16px] border-[3px] border-black bg-[#FDFBF7] p-2",
        "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
        "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.9)]",
      )}
    >
      {/* Spotlight sits at the top and is visually distinct — it is the one
          control that is about everything rather than about one app. */}
      <DockButton icon={Search} label="Search  ⌘K" onClick={onSpotlight} accent />

      <div className="my-0.5 h-px w-7 bg-black/15 dark:bg-[#EDE7DD]/15" />

      {launchers.map((item) => (
        <DockButton
          key={item.label}
          icon={KIND_ICON[item.kind]}
          label={item.label}
          onClick={item.run}
          // The open browser stays lit while its flyout is beside it, so the
          // panel reads as belonging to that button rather than floating free.
          active={Boolean(item.browser) && desktop.flyout === item.browser}
        />
      ))}
    </nav>
  );
}

function DockButton({
  icon: Icon,
  label,
  onClick,
  accent,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  accent?: boolean;
  active?: boolean;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-expanded={active}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-[10px] border-[2.5px] border-black",
          "transition-[transform,box-shadow,background-color] duration-150",
          "dark:border-[#EDE7DD]",
          active
            ? // Pressed in: the shadow is gone and the button has moved into it,
              // the same affordance the rest of the app uses for an active press.
              "translate-x-[2px] translate-y-[2px] bg-[#FBBF24] text-black shadow-none"
            : cn(
                "shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none",
                "dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.9)]",
                accent ? "bg-[#FBBF24] text-black" : "bg-white text-black dark:bg-[#2a2621] dark:text-[#EDE7DD]",
              ),
        )}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </button>

      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 translate-x-[-4px]",
          "whitespace-nowrap rounded-[6px] border-[2px] border-black bg-black px-2.5 py-1",
          "text-[10.5px] font-semibold text-[#FBBF24] opacity-0",
          "transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100",
          "dark:border-[#EDE7DD] dark:bg-[#EDE7DD] dark:text-black",
        )}
      >
        {label}
      </span>
    </div>
  );
}
