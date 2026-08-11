"use client";

import { Building2, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function JoinPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleVerify() {
    setError("");
    setLoading(true);

    try {
      const slug = slugify(orgName);

      const res = await fetch("/api/auth/verify-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgSlug: slug, code: invitationCode }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (data.loggedIn) {
          router.push(`/dashboard?org=${data.slug}`);
        } else {
          router.push(`/login?org=${data.slug}`);
        }
      } else {
        setError(data.error || "Invalid Organization Name or Code");
      }
    } catch (err) {
      console.error("Verification error:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-8 py-16">
      <div className="w-full max-w-2xl space-y-12">
        {/* Header */}
        <div className="space-y-6">
          <div className="flex items-center gap-6">
            <div className="p-6 border-brutal-thick bg-accent">
              <KeyRound className="h-16 w-16 text-accent-foreground" />
            </div>
            <div>
              <h1 className="font-black uppercase leading-none">
                JOIN
                <br />
                ORGANIZATION
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xl font-bold uppercase border-l-4 border-foreground pl-6 flex-1">
              STEP 1: VERIFY INVITATION
            </p>
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-black uppercase border-brutal hover-brutal bg-background flex items-center gap-2"
            >
              BACK TO LOGIN
            </Link>
          </div>
        </div>

        {/* Card */}
        <div className="border-brutal-thick shadow-brutal-lg bg-card p-12 space-y-8">
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-lg font-bold uppercase block">ORGANIZATION NAME</label>
              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 opacity-50" />
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="ACME INC"
                  className="w-full pl-14 pr-6 py-4 text-xl font-bold uppercase border-brutal bg-background focus:outline-none focus:ring-4 focus:ring-accent"
                />
              </div>
              <p className="text-sm opacity-60 font-mono">* Must match the organization name exactly</p>
            </div>

            <div className="space-y-4">
              <label className="text-lg font-bold uppercase block">INVITATION CODE</label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 opacity-50" />
                <input
                  type="text"
                  value={invitationCode}
                  onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                  placeholder="ABCD12"
                  maxLength={6}
                  className="w-full pl-14 pr-6 py-4 text-xl font-bold uppercase border-brutal bg-background focus:outline-none focus:ring-4 focus:ring-accent tracking-widest"
                />
              </div>
              <p className="text-sm opacity-60 font-mono">* 6-character code provided by admin</p>
            </div>

            {error && (
              <div className="px-6 py-4 text-sm font-black uppercase border-brutal bg-destructive text-destructive-foreground">
                {error.toUpperCase()}
              </div>
            )}

            <button
              type="button"
              onClick={handleVerify}
              disabled={loading || !orgName || invitationCode.length < 3}
              className="w-full px-8 py-6 text-xl font-black uppercase border-brutal shadow-brutal hover-brutal bg-foreground text-background disabled:opacity-50"
            >
              {loading ? "VERIFYING..." : "VERIFY & CONTINUE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
