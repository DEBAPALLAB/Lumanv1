"use client";

import { OsConfirmDialog } from "@/components/os/os-confirm-dialog";
import type { Identity } from "@/lib/os/use-org-data";
import { useDesktop, useDesktopActions } from "@/lib/os/window-store";
import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Check, Copy, LayoutGrid, type LucideIcon, LogOut, Moon, Shield, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type OrgSummary = { name: string; slug: string; invitation_code?: string } | null;

/**
 * Settings, open as a window.
 *
 * Everything that touches account, appearance or organisation now lives here
 * rather than at the standalone /settings page — that page renders inside
 * AppShell, normal mode's chrome, so opening it from the desktop silently
 * dropped you out of GodMode with no way back. A window has no such problem:
 * it opens and closes on the same desktop everything else lives on.
 */
export function SettingsWindow({
  identity,
  orgId,
  orgSlug,
}: {
  identity: Identity;
  orgId: string | null;
  orgSlug: string | null;
}) {
  const desktop = useDesktop();
  const actions = useDesktopActions();
  const { theme, setTheme } = useTheme();

  const [fullName, setFullName] = useState(identity.fullName ?? "");
  const [saving, setSaving] = useState(false);
  const [org, setOrg] = useState<OrgSummary>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && theme === "dark";

  const canManageOrg = identity.role === "founder" || identity.role === "admin";

  useEffect(() => {
    if (!canManageOrg || !orgId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/session");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      const match = data.user?.organizations?.find((o: { slug: string }) => o.slug === orgSlug) ?? data.user?.organizations?.[0];
      if (!cancelled && match) setOrg(match);
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageOrg, orgId, orgSlug]);

  async function saveProfile() {
    const trimmed = fullName.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: trimmed }),
      });
      if (res.ok) {
        toast.success("Profile updated");
      } else {
        const error = await res.json().catch(() => ({}));
        toast.error(error.error || "Could not update profile");
      }
    } finally {
      setSaving(false);
    }
  }

  function copyInviteLink() {
    if (!org?.slug || !org.invitation_code) return;
    const link = `${window.location.origin}/join?org=${org.slug}&code=${org.invitation_code}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    toast.success("Invite link copied");
    setTimeout(() => setCopiedLink(false), 2000);
  }

  async function signOut() {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto os-scroll">
        <div className="divide-y-[1.5px] divide-black/[0.08] dark:divide-[#EDE7DD]/[0.08]">
          <Section title="Profile">
            <Field label="Email">
              <div className="rounded-[8px] bg-black/[0.04] px-2.5 py-2 text-[12.5px] text-black/50 dark:bg-[#EDE7DD]/[0.06] dark:text-[#EDE7DD]/50">
                {identity.email ?? "—"}
              </div>
            </Field>
            <Field label="Display name">
              <div className="flex gap-2">
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveProfile();
                  }}
                  placeholder="Your name"
                  className={cn(
                    "min-w-0 flex-1 rounded-[8px] bg-black/[0.04] px-2.5 py-2 text-[12.5px] text-black outline-none",
                    "placeholder:text-black/35 focus:bg-black/[0.07]",
                    "dark:bg-[#EDE7DD]/[0.06] dark:text-[#EDE7DD] dark:placeholder:text-[#EDE7DD]/35 dark:focus:bg-[#EDE7DD]/[0.1]",
                  )}
                />
                <button
                  type="button"
                  onClick={() => void saveProfile()}
                  disabled={saving || !fullName.trim() || fullName.trim() === identity.fullName}
                  className={cn(
                    "shrink-0 rounded-[8px] bg-[#FBBF24] px-3 py-2 text-[12px] font-bold text-black",
                    "transition-opacity duration-150 hover:opacity-85 disabled:opacity-30",
                  )}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </Field>
          </Section>

          <Section title="Appearance">
            <ToggleRow
              icon={isDark ? Moon : Sun}
              label={isDark ? "Dark mode" : "Light mode"}
              checked={isDark}
              onToggle={() => setTheme(isDark ? "light" : "dark")}
            />
            <ToggleRow
              icon={LayoutGrid}
              label="Desktop grid"
              checked={desktop.theme.grid}
              onToggle={() => actions.theme({ grid: !desktop.theme.grid })}
            />
          </Section>

          {canManageOrg && (
            <Section title="Organization">
              <Field label={org?.name ?? "Organization"}>
                {org?.invitation_code ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-[8px] bg-black/[0.04] px-2.5 py-2 dark:bg-[#EDE7DD]/[0.06]">
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-black/40 dark:text-[#EDE7DD]/40">
                        Invite code
                      </span>
                      <span className="font-mono text-[12px] font-bold text-black dark:text-[#EDE7DD]">
                        {org.invitation_code}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className={cn(
                        "flex w-full items-center justify-center gap-1.5 rounded-[8px] bg-black/[0.04] px-3 py-2 text-[12px] font-semibold text-black",
                        "transition-colors duration-150 hover:bg-black/[0.07]",
                        "dark:bg-[#EDE7DD]/[0.06] dark:text-[#EDE7DD] dark:hover:bg-[#EDE7DD]/[0.1]",
                      )}
                    >
                      {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedLink ? "Copied" : "Copy invite link"}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-[8px] bg-black/[0.04] px-2.5 py-2 text-[12px] text-black/40 dark:bg-[#EDE7DD]/[0.06] dark:text-[#EDE7DD]/40">
                    Loading…
                  </div>
                )}
              </Field>
              <a
                href={`/dashboard/admin?org=${orgSlug ?? ""}`}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-[8px] border-[1.5px] border-black/15 px-3 py-2 text-[12px] font-bold text-black",
                  "transition-colors duration-150 hover:bg-black/[0.04]",
                  "dark:border-[#EDE7DD]/15 dark:text-[#EDE7DD] dark:hover:bg-[#EDE7DD]/[0.06]",
                )}
              >
                <Shield className="h-3.5 w-3.5" />
                Open admin panel
              </a>
            </Section>
          )}

          <Section title="Account">
            <button
              type="button"
              onClick={() => setConfirmingSignOut(true)}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-[12px] font-bold text-[#B4636A]",
                "transition-colors duration-150 hover:bg-red-500 hover:text-white",
                "dark:text-[#E8B4B8]",
              )}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </Section>
        </div>
      </div>

      <OsConfirmDialog
        open={confirmingSignOut}
        title="Sign out?"
        body="You'll need to sign back in to reach your organization's desktop."
        confirmLabel="Sign out"
        onConfirm={() => void signOut()}
        onCancel={() => setConfirmingSignOut(false)}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 px-4 py-4">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.09em] text-black/35 dark:text-[#EDE7DD]/35">
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[11px] font-semibold text-black/50 dark:text-[#EDE7DD]/50">{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onToggle,
}: {
  icon: LucideIcon;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-between gap-2.5 rounded-[8px] px-2.5 py-2 text-[12px] font-semibold text-black",
        "transition-colors duration-150 hover:bg-black/[0.06]",
        "dark:text-[#EDE7DD] dark:hover:bg-[#EDE7DD]/[0.08]",
      )}
    >
      <span className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-black/50 dark:text-[#EDE7DD]/50" strokeWidth={2.25} />
        {label}
      </span>
      <span
        className={cn(
          "relative h-[18px] w-8 shrink-0 rounded-full border-[1.5px] border-black transition-colors duration-150",
          "dark:border-[#EDE7DD]",
          checked ? "bg-[#FBBF24]" : "bg-black/10 dark:bg-[#EDE7DD]/15",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-[12px] w-[12px] -translate-y-1/2 rounded-full bg-black transition-[left] duration-150 dark:bg-[#EDE7DD]",
            checked ? "left-[15px]" : "left-[2px]",
          )}
        />
      </span>
    </button>
  );
}

