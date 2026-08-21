"use client";

import { createSupabaseClient } from "@/lib/supabase/client";
import { ArrowLeft, ArrowRight, Building2, Check, KeyRound, Loader2, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlOrg = searchParams.get("org") || searchParams.get("orgSlug") || searchParams.get("slug") || "";
  const urlCode = searchParams.get("code") || searchParams.get("invite") || searchParams.get("invitationCode") || "";

  const [orgInput, setOrgInput] = useState(urlOrg);
  const [invitationCode, setInvitationCode] = useState(urlCode);
  const [loading, setLoading] = useState(false);
  const [verifyingParam, setVerifyingParam] = useState(Boolean(urlOrg && urlCode));
  const [error, setError] = useState("");
  const [verifiedOrg, setVerifiedOrg] = useState<{
    slug: string;
    name: string;
    code: string;
    loggedIn: boolean;
  } | null>(null);

  // Auto-verify if org and code were provided in the URL query params
  useEffect(() => {
    if (urlOrg && urlCode) {
      async function autoVerify() {
        setVerifyingParam(true);
        setError("");
        try {
          const res = await fetch("/api/auth/verify-invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgSlug: urlOrg.trim(), code: urlCode.trim().toUpperCase() }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            setVerifiedOrg({
              slug: data.slug,
              name: data.name || urlOrg,
              code: urlCode.trim().toUpperCase(),
              loggedIn: Boolean(data.loggedIn),
            });
            toast.success(`Invitation to ${data.name || urlOrg} verified!`);
          } else {
            setError(data.error || "Invalid invitation link or code.");
          }
        } catch (err) {
          setError("Failed to verify invitation. Please try again.");
        } finally {
          setVerifyingParam(false);
        }
      }

      autoVerify();
    }
  }, [urlOrg, urlCode]);

  async function handleVerify(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Try direct slug first, then fallback to slugified string
      const slug = orgInput.includes(" ") ? slugify(orgInput) : orgInput.toLowerCase().trim();
      const code = invitationCode.trim().toUpperCase();

      const res = await fetch("/api/auth/verify-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgSlug: slug, code }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setVerifiedOrg({
          slug: data.slug,
          name: data.name || orgInput,
          code,
          loggedIn: Boolean(data.loggedIn),
        });
        toast.success(`Invitation to ${data.name || orgInput} verified!`);
      } else {
        setError(data.error || "Invalid Organization Name or Invitation Code");
      }
    } catch (err) {
      console.error("Verification error:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleJoin() {
    if (!verifiedOrg) return;
    setLoading(true);

    try {
      const supabase = createSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?org=${verifiedOrg.slug}`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
      }
    } catch (err) {
      setError("Failed to start Google sign-in. Please try again.");
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
              {verifiedOrg ? "STEP 2: ACCEPT & SIGN IN" : "STEP 1: VERIFY INVITATION"}
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
        <div className="border-brutal-thick shadow-brutal-lg bg-card p-8 sm:p-12 space-y-8">
          {verifyingParam ? (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-foreground" />
              <p className="text-sm font-black uppercase tracking-wider">Verifying your invite link...</p>
            </div>
          ) : verifiedOrg ? (
            /* Verified Invitation Card */
            <div className="space-y-8">
              <div className="border-brutal bg-[#A7F3D0] p-6 text-black space-y-2">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#065F46]">
                  <Check className="h-4 w-4 stroke-[3]" /> Verified Invitation
                </div>
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
                  You've been invited to join {verifiedOrg.name}
                </h2>
                <p className="text-xs font-bold uppercase opacity-80">
                  Workspace: <span className="font-mono">{verifiedOrg.slug}</span> | Code:{" "}
                  <span className="font-mono">{verifiedOrg.code}</span>
                </p>
              </div>

              {error && (
                <div className="px-6 py-4 text-sm font-black uppercase border-brutal bg-destructive text-destructive-foreground">
                  {error.toUpperCase()}
                </div>
              )}

              <div className="space-y-4">
                {verifiedOrg.loggedIn ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard?org=${verifiedOrg.slug}`)}
                    className="w-full px-8 py-6 text-xl font-black uppercase border-brutal shadow-brutal hover-brutal bg-[#FBBF24] text-black flex items-center justify-center gap-3"
                  >
                    <span>ACCEPT & ENTER DASHBOARD</span>
                    <ArrowRight className="h-6 w-6 stroke-[3]" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoogleJoin}
                    disabled={loading}
                    className="w-full px-8 py-6 text-xl font-black uppercase border-brutal shadow-brutal hover-brutal bg-white text-black disabled:opacity-50 flex items-center justify-center gap-4"
                  >
                    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" role="img" aria-labelledby="google-icon-title">
                      <title id="google-icon-title">Google Icon</title>
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    {loading ? "SIGNING IN..." : "SIGN IN WITH GOOGLE TO JOIN"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setVerifiedOrg(null);
                    setError("");
                  }}
                  className="w-full text-center text-xs font-black uppercase text-muted-foreground hover:underline pt-2"
                >
                  Use a different invitation code
                </button>
              </div>
            </div>
          ) : (
            /* Manual Entry Form */
            <form onSubmit={handleVerify} className="space-y-6">
              <div className="space-y-4">
                <label className="text-lg font-bold uppercase block">ORGANIZATION NAME OR SLUG</label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 opacity-50" />
                  <input
                    type="text"
                    value={orgInput}
                    onChange={(e) => setOrgInput(e.target.value)}
                    placeholder="ACME INC OR ACME-INC"
                    required
                    className="w-full pl-14 pr-6 py-4 text-xl font-bold uppercase border-brutal bg-background focus:outline-none focus:ring-4 focus:ring-accent"
                  />
                </div>
                <p className="text-sm opacity-60 font-mono">* Enter your organization's display name or slug</p>
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
                    required
                    className="w-full pl-14 pr-6 py-4 text-xl font-bold uppercase border-brutal bg-background focus:outline-none focus:ring-4 focus:ring-accent tracking-widest text-center"
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
                type="submit"
                disabled={loading || !orgInput.trim() || invitationCode.trim().length < 3}
                className="w-full px-8 py-6 text-xl font-black uppercase border-brutal shadow-brutal hover-brutal bg-foreground text-background disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {loading ? "VERIFYING..." : "VERIFY & CONTINUE"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}

