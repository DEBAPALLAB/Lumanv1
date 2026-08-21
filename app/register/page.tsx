"use client";

import { createSupabaseClient } from "@/lib/supabase/client";
import { ArrowLeft, Building2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org") || (typeof window !== "undefined" ? sessionStorage.getItem("selected_org_slug") : null);
  const isNewOrg = searchParams.get("new") === "true";
  const errorParam = searchParams.get("error");
  const urlInvite = searchParams.get("invite") || searchParams.get("code") || "";

  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] = useState(urlInvite);

  useEffect(() => {
    if (urlInvite) {
      setInviteCode(urlInvite.toUpperCase());
    }

    // Get organization name from session storage
    const storedOrgName = sessionStorage.getItem("selected_org_name");
    if (storedOrgName) {
      setOrgName(storedOrgName);
    }

    if (!orgSlug) {
      // No organization selected, redirect to org login
      router.push("/org-login");
    }

    if (errorParam === "needs_invite") {
      setError("You must have an invitation to join this organization.");
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
    <div className="min-h-screen flex items-center justify-center bg-background px-8 py-16">
      <div className="w-full max-w-2xl space-y-12">
        {/* Header */}
        <div className="space-y-6">
          <div className="flex items-center gap-6">
            <div className="p-6 border-brutal-thick bg-accent">
              <UserPlus className="h-16 w-16 text-accent-foreground" />
            </div>
            <div>
              <h1 className="font-black uppercase leading-none">
                CREATE
                <br />
                ACCOUNT
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xl font-bold uppercase border-l-4 border-foreground pl-6 flex-1">
              {isNewOrg ? "STEP 2: CREATE FOUNDER ACCOUNT" : `STEP 2: JOIN ${orgName.toUpperCase()}`}
            </p>
            {!isNewOrg && (
              <Link
                href="/org-login"
                className="px-4 py-2 text-sm font-black uppercase border-brutal hover-brutal bg-background flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                CHANGE ORG
              </Link>
            )}
          </div>
        </div>

        {/* Organization Badge */}
        {orgName && (
          <div className="border-brutal bg-muted p-6 flex items-center gap-4">
            <Building2 className="h-8 w-8" />
            <div>
              <p className="text-sm font-black uppercase opacity-70">ORGANIZATION</p>
              <p className="text-lg font-black uppercase">{orgName}</p>
            </div>
          </div>
        )}

        {/* Card */}
        <div className="border-brutal-thick shadow-brutal-lg bg-card p-12 space-y-8">
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <p className="text-lg font-bold uppercase">
                {isNewOrg ? "CREATE YOUR ACCOUNT WITH GOOGLE" : "JOIN WITH YOUR GOOGLE ACCOUNT"}
              </p>
              <p className="text-sm font-bold uppercase opacity-70">
                {isNewOrg ? "YOU'LL BE THE FOUNDER OF THIS ORGANIZATION" : "SELECT YOUR ROLE AFTER SIGNING IN"}
              </p>
            </div>

            {error && (
              <div className="px-6 py-4 text-sm font-black uppercase border-brutal bg-destructive text-destructive-foreground">
                {error.toUpperCase()}
                {error.includes("invitation") && (
                  <p className="mt-2">
                    <Link href="/join" className="underline hover:opacity-80">
                      ENTER INVITE CODE HERE
                    </Link>
                  </p>
                )}
              </div>
            )}
            {!isNewOrg && (
              <div className="space-y-4">
                <label className="text-sm font-black uppercase block text-left">INVITATION CODE</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="ENTER 6-CHARACTER INVITE CODE"
                  maxLength={6}
                  required
                  className="w-full px-6 py-4 text-xl font-bold uppercase border-brutal bg-background focus:outline-none focus:ring-4 focus:ring-accent tracking-widest text-center"
                />
                <p className="text-xs opacity-60 font-mono text-left">* Required to join an existing organization</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={loading}
              className="w-full px-8 py-6 text-xl font-black uppercase border-brutal shadow-brutal hover-brutal bg-white text-black disabled:opacity-50 flex items-center justify-center gap-4"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" role="img" aria-labelledby="google-icon-title">
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
              {loading ? "SIGNING UP..." : "SIGN UP WITH GOOGLE"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-lg font-bold uppercase">
          <p>
            ALREADY HAVE AN ACCOUNT?{" "}
            <Link
              href={`/login${orgSlug ? `?org=${orgSlug}` : ""}`}
              className="underline decoration-4 underline-offset-8 hover:bg-accent hover:text-accent-foreground px-2"
            >
              SIGN IN
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
