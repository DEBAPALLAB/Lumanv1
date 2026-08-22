"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ErrorPill,
  FieldHint,
  FieldLabel,
  GoogleMark,
  OrgBadge,
  PillButton,
  PillInput,
  StepRail,
} from "@/components/auth/auth-controls";
import { AuthShell } from "@/components/auth/auth-shell";
import { createSupabaseClient } from "@/lib/supabase/client";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug =
    searchParams.get("org") ||
    (typeof window !== "undefined" ? sessionStorage.getItem("selected_org_slug") : null);
  const isNewOrg = searchParams.get("new") === "true";
  const errorParam = searchParams.get("error");
  const urlInvite = searchParams.get("invite") || searchParams.get("code") || "";

  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] = useState(urlInvite.toUpperCase());

  useEffect(() => {
    // Get organization name from session storage or fetch if missing
    const storedOrgName = sessionStorage.getItem("selected_org_name");
    if (storedOrgName) {
      setOrgName(storedOrgName);
    } else if (orgSlug) {
      fetch(`/api/auth/org/${orgSlug}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.name) {
            setOrgName(data.name);
            sessionStorage.setItem("selected_org_name", data.name);
            sessionStorage.setItem("selected_org_slug", data.slug);
          }
        })
        .catch(() => {});
    }

    if (!orgSlug) {
      // No organization selected, redirect to org login
      router.push("/org-login");
    }

    if (errorParam === "needs_invite") {
      setError("You must have an invitation to join this organization.");
      const supabase = createSupabaseClient();
      supabase.auth.signOut().catch(() => {});
    }
  }, [orgSlug, router, errorParam]);

  async function handleGoogleSignUp() {
    setError("");

    // If joining an existing org, we must require and verify the invite code first
    if (!isNewOrg) {
      if (!inviteCode || inviteCode.trim().length !== 6) {
        setError("Please enter a valid 6-character invitation code.");
        return;
      }

      setLoading(true);
      try {
        const verifyRes = await fetch("/api/auth/verify-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgSlug, code: inviteCode.trim().toUpperCase() }),
        });

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.success) {
          setError(verifyData.error || "Invalid invitation code for this organization.");
          setLoading(false);
          return;
        }
        if (verifyData.loggedIn) {
          router.push(`/dashboard?org=${orgSlug}`);
          return;
        }
      } catch (err) {
        setError("Failed to verify invitation code. Please try again.");
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const supabase = createSupabaseClient();

      // Sign up with Google OAuth
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?org=${orgSlug}&new=${isNewOrg}`,
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
      // If successful, user will be redirected to Google
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow={isNewOrg ? "New Workspace Setup" : "Luman Workspace Gateway"}
      title={isNewOrg ? "Claim Founder Seat" : "Join The Team"}
      subtitle={
        isNewOrg ? "Step 2: Create your founder account" : `Step 2: Join ${orgName.toUpperCase() || "your workspace"}`
      }
      backHref={isNewOrg ? "/org-register" : "/org-login"}
      backLabel={isNewOrg ? "Back A Step" : "Change Org"}
      footer={
        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider text-center">
          Already have an account?{" "}
          <Link
            href={`/login${orgSlug ? `?org=${orgSlug}` : ""}`}
            className="text-foreground underline decoration-2 underline-offset-4 hover:text-[#D97706] transition-colors"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <div className="space-y-6">
        <StepRail step={2} labels={["Create organization", "Create founder account"]} />

        {orgName && <OrgBadge name={orgName} />}

        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-center text-foreground tracking-wider">
              {isNewOrg ? "Create your account with Google" : "Join with your Google account"}
            </p>
            <FieldHint>
              {isNewOrg
                ? "You'll be the founder of this organization"
                : "Select your role after signing in"}
            </FieldHint>
          </div>

          {/* Invite code is only required when joining an existing organization */}
          {!isNewOrg && (
            <div className="space-y-2">
              <FieldLabel htmlFor="inviteCode">Invitation Code</FieldLabel>
              <PillInput
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="6-CHARACTER CODE"
                maxLength={6}
                required
                className="tracking-[0.3em]"
              />
              <FieldHint>Required to join an existing organization</FieldHint>
            </div>
          )}

          <PillButton type="button" tone="white" onClick={handleGoogleSignUp} disabled={loading}>
            <GoogleMark />
            {loading ? "Signing up..." : "Sign up with Google"}
          </PillButton>

          {error && (
            <div className="space-y-2">
              <ErrorPill>{error.toUpperCase()}</ErrorPill>
              {error.includes("invitation") && (
                <p className="text-[9px] font-black uppercase text-center text-muted-foreground tracking-wider">
                  <Link
                    href="/join"
                    className="text-foreground underline decoration-2 underline-offset-4 hover:text-[#D97706] transition-colors"
                  >
                    Enter an invite code here
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
