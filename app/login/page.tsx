"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ErrorPill,
  FieldHint,
  GoogleMark,
  OrgBadge,
  PillButton,
  StepRail,
} from "@/components/auth/auth-controls";
import { AuthShell } from "@/components/auth/auth-shell";
import { createSupabaseClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org");

  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    } else {
      // No organization selected, redirect to org login
      router.push("/org-login");
      return;
    }

    // Check if user is already logged in
    async function checkExistingSession() {
      if (!orgSlug) return;
      try {
        const res = await fetch(`/api/auth/session?org=${orgSlug}`);
        if (res.ok) {
          // User is logged in and belongs to this organization, redirect to dashboard
          router.push(`/dashboard?org=${orgSlug}`);
        } else if (res.status === 403) {
          // User is logged in but is NOT a member of this organization.
          // Sign them out of the incorrect account so they can log in clean!
          const supabase = createSupabaseClient();
          await supabase.auth.signOut();
        }
      } catch (err) {
        // Ignore - user stays on login page and can retry.
      }
    }

    checkExistingSession();
  }, [orgSlug, router]);

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);

    try {
      const supabase = createSupabaseClient();

      // Store org slug in a cookie that expires in 10 minutes
      document.cookie = `sb_org_slug=${orgSlug}; path=/; max-age=600; SameSite=Lax`;

      // Sign in with Google OAuth
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?org=${orgSlug}`,
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
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Luman Workspace Gateway"
      title="Welcome Back!"
      subtitle={`Step 2: Sign in to ${orgName.toUpperCase() || "your workspace"}`}
      backHref="/org-login"
      backLabel="Change Org"
      footer={
        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider text-center">
          New to this workspace?{" "}
          <Link
            href={`/register${orgSlug ? `?org=${orgSlug}` : ""}`}
            className="text-foreground underline decoration-2 underline-offset-4 hover:text-[#D97706] transition-colors"
          >
            Create an account
          </Link>
        </p>
      }
    >
      <div className="space-y-6">
        <StepRail step={2} labels={["Select workspace", "Sign in"]} />

        {orgName && <OrgBadge name={orgName} />}

        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-center text-foreground tracking-wider">
              Sign in with your Google account
            </p>
            <FieldHint>One click to access your workspace</FieldHint>
          </div>

          <PillButton type="button" tone="white" onClick={handleGoogleSignIn} disabled={loading}>
            <GoogleMark />
            {loading ? "Signing in..." : "Sign in with Google"}
          </PillButton>

          {error && <ErrorPill>{error.toUpperCase()}</ErrorPill>}
        </div>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

