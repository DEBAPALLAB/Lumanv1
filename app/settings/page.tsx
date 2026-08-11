"use client";

import AppShell from "@/components/layouts/app-shell";
import { isRoleTier } from "@/types/role";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsContent />
    </AppShell>
  );
}

function SettingsContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string; full_name?: string } | null>(null);
  const [fullName, setFullName] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser({
              id: data.user.userId,
              email: data.user.email,
              full_name: data.user.ownerName,
            });
            setFullName(data.user.ownerName || "");
            setUserRole(data.user.role || null);

            const params = new URLSearchParams(window.location.search);
            const slugFromUrl = params.get("org");
            const slug = slugFromUrl || data.user.organizations?.[0]?.slug || null;
            setOrgSlug(slug);
          }
        }
      } catch (err) {
        console.error("Failed to fetch user:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });

      if (res.ok) {
        toast.success("Profile updated!");
        router.refresh();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to update profile");
      }
    } catch (err) {
      toast.error("An error occurred");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  if (loading) {
    return (
      <div className="relative min-h-screen bg-[#FDFBF7] dark:bg-zinc-950 overflow-hidden pt-16 lg:pt-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] opacity-70 pointer-events-none z-0" />
        <div className="relative px-8 pt-4 pb-8 md:px-12 md:pt-6 md:pb-12 max-w-7xl mx-auto z-10">
          <div className="text-lg font-bold uppercase animate-pulse">LOADING SETTINGS...</div>
        </div>
      </div>
    );
  }

  const canManageOrg = userRole !== null && isRoleTier(userRole) && (userRole === "founder" || userRole === "admin");

  return (
    <div className="relative min-h-screen bg-[#FDFBF7] dark:bg-zinc-950 overflow-hidden pt-16 lg:pt-20">
      {/* Technical grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] opacity-70 pointer-events-none z-0" />

      {/* Ambient Glows */}
      <div className="pointer-events-none absolute top-12 left-1/4 h-96 w-96 rounded-full bg-[#FBBF24]/10 blur-[120px] dark:opacity-20 z-0" />
      <div className="pointer-events-none absolute bottom-24 right-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px] dark:opacity-20 z-0" />

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-4 pb-8 md:pt-6 md:pb-12 z-10">
        <h1 className="text-4xl font-black uppercase mb-12 border-l-8 border-foreground pl-6">SETTINGS</h1>

      <div className="space-y-12">
        {/* Profile Section */}
        <section className="space-y-6">
          <h2 className="text-2xl font-black uppercase border-b-4 border-foreground pb-2">PROFILE</h2>

          <div className="border-brutal-thick bg-card p-8">
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-black uppercase opacity-70">EMAIL ADDRESS</label>
                <div className="font-mono text-lg p-3 bg-muted border-brutal w-full opacity-60 cursor-not-allowed">
                  {user?.email}
                </div>
                <p className="text-xs opacity-50 uppercase">Email cannot be changed.</p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-black uppercase opacity-70">DISPLAY NAME</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-3 font-bold text-lg bg-background border-brutal focus:ring-2 focus:ring-accent"
                  placeholder="YOUR NAME"
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-8 py-4 bg-foreground text-background font-black uppercase border-brutal hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "SAVING..." : "SAVE CHANGES"}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Organization Section */}
        {canManageOrg && (
          <section className="space-y-6">
            <h2 className="text-2xl font-black uppercase border-b-4 border-foreground pb-2">ORGANIZATION</h2>

            <div className="border-brutal-thick bg-card p-8 space-y-4">
              <p className="font-bold uppercase text-sm">
                Manage members, update team roles (Founder, Admin, Intern), and configure organization parameters.
              </p>
              <div className="pt-2">
                <Link
                  href={`/dashboard/admin?org=${orgSlug || ""}`}
                  className="inline-block px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase border-brutal transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                >
                  Go to Admin Panel
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Account Section */}
        <section className="space-y-6">
          <h2 className="text-2xl font-black uppercase border-b-4 border-foreground pb-2">ACCOUNT</h2>

          <div className="border-brutal-thick bg-card p-8">
            <p className="font-bold uppercase text-sm mb-4">
              Logout of your current active session on this device.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="px-8 py-4 bg-[#FBBF24] hover:opacity-95 text-black font-black uppercase border-brutal transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
            >
              LOGOUT
            </button>
          </div>
        </section>
      </div>
      </div>
    </div>
  );
}
