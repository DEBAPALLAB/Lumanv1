"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ErrorPill,
  FieldHint,
  FieldLabel,
  GoogleMark,
  PillButton,
  PillInput,
  StepRail,
} from "@/components/auth/auth-controls";
import { AuthShell } from "@/components/auth/auth-shell";
import { createSupabaseClient } from "@/lib/supabase/client";

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
  const urlCode =
    searchParams.get("code") || searchParams.get("invite") || searchParams.get("invitationCode") || "";

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
            toast.success(`Invitation to ${data.name || urlOrg} verified`);
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
        toast.success(`Invitation to ${data.name || orgInput} verified`);
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
    <AuthShell
      eyebrow="Invitation Gateway"
      title={verifiedOrg ? "You're Invited" : "Redeem Invite"}
      subtitle={verifiedOrg ? "Step 2: Accept and sign in" : "Step 1: Verify your invitation"}
      backHref="/org-login"
      backLabel="Back To Login"
      footer={
        !verifiedOrg ? (
          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider text-center">
            Starting a new team instead?{" "}
            <Link
              href="/org-register"
              className="text-foreground underline decoration-2 underline-offset-4 hover:text-[#D97706] transition-colors"
            >
              Create a workspace
            </Link>
          </p>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <StepRail step={verifiedOrg ? 2 : 1} labels={["Verify invitation", "Accept and sign in"]} />

        {verifyingParam ? (
          /* Auto-verifying an invite link */
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-foreground" />
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Verifying your invite link...
            </p>
          </div>
        ) : verifiedOrg ? (
          /* Verified Invitation */
          <div className="space-y-5">
            <div className="border-[3px] border-black bg-[#D1FAE5] text-black p-5 rounded-2xl space-y-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[#065F46]">
                <Check className="h-3.5 w-3.5 stroke-[3]" /> Verified Invitation
              </div>
              <p className="text-base font-black uppercase tracking-tight leading-tight">
                Join {verifiedOrg.name}
              </p>
              <p className="text-[9px] font-black uppercase opacity-70 font-mono">
                {verifiedOrg.slug} · code {verifiedOrg.code}
              </p>
            </div>

            {error && <ErrorPill>{error.toUpperCase()}</ErrorPill>}

            {verifiedOrg.loggedIn ? (
              <PillButton
                type="button"
                tone="gold"
                onClick={() => router.push(`/dashboard?org=${verifiedOrg.slug}`)}
              >
                Accept &amp; Enter Dashboard
                <ArrowRight className="h-4 w-4 stroke-[3]" />
              </PillButton>
            ) : (
              <PillButton type="button" tone="white" onClick={handleGoogleJoin} disabled={loading}>
                <GoogleMark />
                {loading ? "Signing in..." : "Sign in with Google to join"}
              </PillButton>
            )}

            <button
              type="button"
              onClick={() => {
                setVerifiedOrg(null);
                setError("");
              }}
              className="w-full text-center text-[9px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground hover:underline underline-offset-4 transition-colors"
            >
              Use a different invitation code
            </button>
          </div>
        ) : (
          /* Manual Entry */
          <form onSubmit={handleVerify} className="space-y-5">
            <div className="space-y-2">
              <FieldLabel htmlFor="orgInput">Organization Name Or Slug</FieldLabel>
              <PillInput
                id="orgInput"
                tone="pink"
                type="text"
                value={orgInput}
                onChange={(e) => setOrgInput(e.target.value)}
                placeholder="ACME INC OR ACME-INC"
                required
                autoFocus
              />
              <FieldHint>Your organization&apos;s display name or workspace slug</FieldHint>
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="invitationCode">Invitation Code</FieldLabel>
              <PillInput
                id="invitationCode"
                type="text"
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                placeholder="ABCD12"
                maxLength={6}
                required
                className="tracking-[0.3em]"
              />
              <FieldHint>6-character code provided by your admin</FieldHint>
            </div>

            {error && <ErrorPill>{error.toUpperCase()}</ErrorPill>}

            <PillButton
              type="submit"
              tone="gold"
              disabled={loading || !orgInput.trim() || invitationCode.trim().length < 3}
            >
              {loading ? "Verifying..." : "Verify & Continue"}
              <ArrowRight className="h-4 w-4 stroke-[3]" />
            </PillButton>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] dark:bg-zinc-950">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
