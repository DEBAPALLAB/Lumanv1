"use client";

import type { Identity } from "@/lib/os/use-org-data";
import { useDesktopActions } from "@/lib/os/window-store";
import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LogOut, Moon, Settings, ShieldCheck, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

/** Initials from a name or email, for the avatar glyph. */
function initialsFor(identity: Identity) {
  const source = identity.fullName?.trim() || identity.email?.split("@")[0] || "?";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/** Role names as they read in the UI — the stored value is lowercase and
 *  terse ("founder", "admin"), which is fine as a database value but not as
 *  a label. */
function roleLabel(role: string | null) {
  if (!role) return "Member";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Who-am-I, parked in the corner the desktop otherwise leaves empty.
 *
 * A window would be the wrong shape for this: identity is not a document you
 * work in, it is a fact you glance at. So it follows the same pattern as the
 * dock's flyouts — a small button that opens a lightweight panel beside it,
 * rather than a window competing for a spot in the pill tray.
 */
export function ProfileBadge({ identity }: { identity: Identity }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const actions = useDesktopActions();

  // next-themes can't know the persisted theme until after mount (it reads
  // localStorage client-side only) — theme is undefined on the server and on
  // the client's first render, so rendering the toggle's active state before
  // mount would flash the wrong one and trip a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && theme === "dark";

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClickAway = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClickAway);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClickAway);
    };
  }, [open]);

  const signOut = async () => {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const displayName = identity.fullName?.trim() || identity.email?.split("@")[0] || "Signed in";

  return (
    <div ref={rootRef} className="fixed left-4 top-4 z-[9100]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        aria-expanded={open}
        className={cn(
          "flex h-10 items-center gap-2 rounded-[10px] border-[2.5px] border-black bg-white pl-1.5 pr-3",
          "transition-[transform,box-shadow] duration-150",
          "dark:border-[#EDE7DD] dark:bg-[#211e1a]",
          open
            ? "translate-x-[2px] translate-y-[2px] shadow-none"
            : "shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.9)]",
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border-[2px] border-black bg-[#FBBF24] text-[11px] font-bold text-black dark:border-[#EDE7DD]">
          {initialsFor(identity)}
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="max-w-[120px] truncate text-[11.5px] font-bold text-black dark:text-[#EDE7DD]">
            {displayName}
          </span>
          {identity.orgName && (
            <span className="max-w-[120px] truncate text-[9.5px] font-semibold text-black/40 dark:text-[#EDE7DD]/40">
              {identity.orgName}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-0 top-[calc(100%+8px)] w-[260px] overflow-hidden rounded-[13px] border-[2.5px] border-black bg-white",
            "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
            "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.9)]",
            "animate-pop-in",
          )}
        >
          <div className="flex items-center gap-3 border-b-[2px] border-black/10 px-3.5 py-3 dark:border-[#EDE7DD]/10">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border-[2px] border-black bg-[#FBBF24] text-[14px] font-bold text-black dark:border-[#EDE7DD]">
              {initialsFor(identity)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold text-black dark:text-[#EDE7DD]">{displayName}</p>
              {identity.email && (
                <p className="truncate text-[11px] text-black/45 dark:text-[#EDE7DD]/45">{identity.email}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5 px-3.5 py-3 text-[11.5px]">
            <Row label="Organization" value={identity.orgName ?? "—"} />
            <Row
              label="Role"
              value={
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-black/40 dark:text-[#EDE7DD]/40" strokeWidth={2.5} />
                  {roleLabel(identity.role)}
                </span>
              }
            />
          </div>

          <div className="border-t-[2px] border-black/10 p-1.5 dark:border-[#EDE7DD]/10">
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={cn(
                "flex w-full items-center justify-between gap-2.5 rounded-[8px] px-2.5 py-2 text-[12px] font-semibold text-black",
                "transition-colors duration-150 hover:bg-black/[0.06]",
                "dark:text-[#EDE7DD] dark:hover:bg-[#EDE7DD]/[0.08]",
              )}
            >
              <span className="flex items-center gap-2.5">
                {isDark ? (
                  <Moon className="h-4 w-4 text-black/50 dark:text-[#EDE7DD]/50" strokeWidth={2.25} />
                ) : (
                  <Sun className="h-4 w-4 text-black/50 dark:text-[#EDE7DD]/50" strokeWidth={2.25} />
                )}
                {isDark ? "Dark mode" : "Light mode"}
              </span>
              {/* A track-and-thumb switch rather than a second icon button —
                  this is a two-state setting, not a third launcher, and the
                  switch shape reads as "currently on/off" at a glance. */}
              <span
                className={cn(
                  "relative h-[18px] w-8 shrink-0 rounded-full border-[1.5px] border-black transition-colors duration-150",
                  "dark:border-[#EDE7DD]",
                  isDark ? "bg-[#FBBF24]" : "bg-black/10 dark:bg-[#EDE7DD]/15",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1/2 h-[12px] w-[12px] -translate-y-1/2 rounded-full bg-black transition-[left] duration-150 dark:bg-[#EDE7DD]",
                    isDark ? "left-[15px]" : "left-[2px]",
                  )}
                />
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                actions.open({ kind: "settings", title: "Settings", dedupeKey: "settings" });
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[12px] font-semibold text-black",
                "transition-colors duration-150 hover:bg-black/[0.06]",
                "dark:text-[#EDE7DD] dark:hover:bg-[#EDE7DD]/[0.08]",
              )}
            >
              <Settings className="h-4 w-4 text-black/50 dark:text-[#EDE7DD]/50" strokeWidth={2.25} />
              Settings
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[12px] font-semibold text-black",
                "transition-colors duration-150 hover:bg-red-500 hover:text-white",
                "dark:text-[#EDE7DD]",
              )}
            >
              <LogOut className="h-4 w-4" strokeWidth={2.25} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-black/35 dark:text-[#EDE7DD]/35">
        {label}
      </span>
      <span className="min-w-0 truncate font-semibold text-black dark:text-[#EDE7DD]">{value}</span>
    </div>
  );
}
