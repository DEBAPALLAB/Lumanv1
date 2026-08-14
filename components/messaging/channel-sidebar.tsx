"use client";

import type { Channel } from "@/lib/db/messaging";
import { cn } from "@/lib/utils";
import { Building2, ChevronRight, Hash, Layers, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FOCUS_RING, FRAME, SHADOW_SM } from "./chrome";

export type WorkspaceSummary = { id: string; owner_name: string };

/**
 * Inline "new channel" field.
 *
 * Replaces window.prompt(), which could not be styled, could not show a
 * validation message, and on desktop reads as a browser artefact rather than
 * part of the app. Committing on Enter and dismissing on Escape or blur keeps
 * it as cheap to use as the prompt was.
 */
/** Matches the `length(trim(name)) between 1 and 80` CHECK on public.channels.
 *  Enforced here too so an over-long name is prevented rather than round-
 *  tripping into a constraint violation the reader cannot interpret. */
const CHANNEL_NAME_MAX = 80;

function NewChannelField({
  onCommit,
  onCancel,
  busy,
}: {
  onCommit: (name: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    const name = value.trim();
    if (!name) {
      onCancel();
      return;
    }
    onCommit(name.slice(0, CHANNEL_NAME_MAX));
  };

  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      <Hash className="h-3.5 w-3.5 shrink-0 text-black/35 dark:text-stone-100/35" strokeWidth={2.5} />
      <input
        ref={inputRef}
        value={value}
        disabled={busy}
        maxLength={CHANNEL_NAME_MAX}
        onChange={(e) => setValue(e.target.value.replace(/\s+/g, "-").toLowerCase())}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setValue("");
            onCancel();
          }
        }}
        placeholder="channel-name"
        aria-label="New channel name"
        className={cn(
          "min-w-0 flex-1 rounded-[5px] border-[1.5px] bg-white px-1.5 py-1 text-[12px] font-medium",
          "border-black/30 text-black placeholder:text-black/30",
          "dark:border-stone-100/30 dark:bg-zinc-950 dark:text-stone-100 dark:placeholder:text-stone-100/30",
          "outline-none focus:border-black dark:focus:border-stone-100 disabled:opacity-50",
        )}
      />
    </div>
  );
}

/**
 * Channel list, split the two ways the product splits them: one organisation
 * section everybody shares, then a section per workspace. Workspaces with no
 * channel yet still appear, so creating the first one is a visible action
 * rather than something a user has to know is possible.
 */
export function ChannelSidebar({
  organizationChannels,
  workspaceChannels,
  workspaces,
  activeChannelId,
  onSelect,
  onCreate,
  creating,
}: {
  organizationChannels: Channel[];
  workspaceChannels: Record<string, Channel[]>;
  workspaces: WorkspaceSummary[];
  activeChannelId: string | null;
  onSelect: (channelId: string) => void;
  onCreate: (scope: "organization" | "workspace", name: string, workspaceId?: string) => void;
  creating: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Which section currently has its inline field open — at most one.
  const [composingIn, setComposingIn] = useState<string | null>(null);

  const toggle = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const renderChannel = (channel: Channel) => {
    const active = activeChannelId === channel.id;
    return (
      <button
        key={channel.id}
        type="button"
        onClick={() => onSelect(channel.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group/channel relative flex w-full items-center gap-2 rounded-[6px] px-2.5 py-[7px] text-left",
          "transition-[background-color,transform] duration-150",
          FOCUS_RING,
          active
            ? cn("border-[2px] bg-[#FBBF24] font-bold text-black", FRAME, SHADOW_SM)
            : "border-[2px] border-transparent text-black/65 hover:bg-black/[0.045] dark:text-stone-100/65 dark:hover:bg-stone-100/[0.07]",
        )}
      >
        <Hash
          className={cn("h-3.5 w-3.5 shrink-0", active ? "text-black" : "text-black/35 dark:text-stone-100/35")}
          strokeWidth={2.5}
        />
        <span className={cn("truncate text-[12.5px]", active ? "font-bold" : "font-medium")}>{channel.name}</span>
      </button>
    );
  };

  const sectionHeader = (key: string, label: string, icon: React.ReactNode, onAdd?: () => void) => {
    const isCollapsed = collapsed[key];
    return (
      <div className="group/header mb-1 mt-5 flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => toggle(key)}
          aria-expanded={!isCollapsed}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded-[4px] py-0.5",
            "text-black/45 transition-colors duration-150 hover:text-black dark:text-stone-100/45 dark:hover:text-stone-100",
            FOCUS_RING,
          )}
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 transition-transform duration-200",
              !isCollapsed && "rotate-90",
            )}
            strokeWidth={2.75}
          />
          {icon}
          <span className="truncate text-[10.5px] font-semibold tracking-[0.08em] uppercase">{label}</span>
        </button>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            disabled={creating}
            aria-label={`New channel in ${label}`}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]",
              "text-black/40 opacity-0 transition-all duration-150 dark:text-stone-100/40",
              "hover:bg-black/[0.07] hover:text-black dark:hover:bg-stone-100/10 dark:hover:text-stone-100",
              "group-hover/header:opacity-100 focus-visible:opacity-100 disabled:opacity-30",
              FOCUS_RING,
            )}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
          </button>
        )}
      </div>
    );
  };

  const emptyNote = (text: string) => (
    <p className="px-2.5 py-1 text-[11px] italic text-black/30 dark:text-stone-100/30">{text}</p>
  );

  return (
    <aside
      className={cn(
        "flex w-60 shrink-0 flex-col overflow-y-auto border-r-[3px] px-2.5 pb-4 pt-5 scrollbar-thin",
        FRAME,
        "bg-white dark:bg-zinc-900",
      )}
      aria-label="Channels"
    >
      <h2 className="px-1.5 text-[15px] font-bold tracking-[-0.02em] text-black dark:text-stone-100">Channels</h2>

      {sectionHeader("org", "Organization", <Building2 className="h-3 w-3 shrink-0" strokeWidth={2.5} />, () =>
        setComposingIn("org"),
      )}
      {!collapsed.org && (
        <div className="space-y-[3px]">
          {organizationChannels.length === 0 && composingIn !== "org" && emptyNote("No channels yet")}
          {organizationChannels.map(renderChannel)}
          {composingIn === "org" && (
            <NewChannelField
              busy={creating}
              onCancel={() => setComposingIn(null)}
              onCommit={(name) => {
                onCreate("organization", name);
                setComposingIn(null);
              }}
            />
          )}
        </div>
      )}

      {sectionHeader("workspaces", "Workspaces", <Layers className="h-3 w-3 shrink-0" strokeWidth={2.5} />)}
      {!collapsed.workspaces && (
        <div className="space-y-1">
          {workspaces.length === 0 && emptyNote("No workspaces yet")}
          {workspaces.map((workspace) => {
            const channels = workspaceChannels[workspace.id] ?? [];
            const key = `ws:${workspace.id}`;
            return (
              <div key={workspace.id}>
                {sectionHeader(
                  key,
                  workspace.owner_name,
                  <span className="h-3 w-3 shrink-0" aria-hidden="true" />,
                  () => setComposingIn(key),
                )}
                {!collapsed[key] && (
                  <div className="space-y-[3px] border-l-[1.5px] border-black/10 pl-2 dark:border-stone-100/10">
                    {channels.length === 0 && composingIn !== key && emptyNote("No channels yet")}
                    {channels.map(renderChannel)}
                    {composingIn === key && (
                      <NewChannelField
                        busy={creating}
                        onCancel={() => setComposingIn(null)}
                        onCommit={(name) => {
                          onCreate("workspace", name, workspace.id);
                          setComposingIn(null);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
