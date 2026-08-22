"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ErrorPill,
  FieldHint,
  FieldLabel,
  PillButton,
  PillInput,
  StepRail,
} from "@/components/auth/auth-controls";
import { AuthShell } from "@/components/auth/auth-shell";

function OrgLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const detailsParam = searchParams.get("details");

  const [orgSlug, setOrgSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (errorParam) {
      if (errorParam === "callback_exception") {
        setError(detailsParam ? `Sign-in failed: ${detailsParam}` : "Authentication error occurred during sign-in.");
      } else if (errorParam === "oauth_error") {
        setError(detailsParam ? `OAuth error: ${detailsParam}` : "OAuth authentication failed.");
      } else if (errorParam === "exchange_failed") {
        setError("Failed to exchange authentication code.");
      } else if (errorParam === "no_org_found") {
        setError("No organization found for your account.");
      }
    }
  }, [errorParam, detailsParam]);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Convert organization name to slug format
      const slug = orgSlug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      // Verify organization exists
      const res = await fetch(`/api/auth/org/${slug}`);
      const data = await res.json();

      if (res.ok && data.exists) {
        // Store organization info in session storage
        sessionStorage.setItem("selected_org_slug", data.slug);
        sessionStorage.setItem("selected_org_name", data.name);

        // Redirect to individual login
        router.push(`/login?org=${data.slug}`);
      } else {
        setError("Workspace not found. Check the name and try again.");
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
      title="Welcome Aboard, Friend!"
      subtitle="Step 1: Select your organization workspace"
      backHref="/"
      backLabel="Back Home"
      footer={
        <div className="space-y-3.5 text-center">
          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
            Need your own team workspace?
          </p>
          <Link
            href="/org-register"
            className="inline-flex w-full py-5 rounded-full border-[3px] border-black bg-black hover:bg-zinc-900 text-white text-center shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[5px_5px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[5px] hover:translate-y-[5px] transition-all justify-center items-center font-black uppercase text-xs tracking-wider"
          >
            Create Workspace Organization
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <StepRail step={1} labels={["Select workspace", "Sign in"]} />

        <form onSubmit={handleContinue} className="space-y-5">
          <div className="space-y-2">
            <FieldLabel htmlFor="orgSlug">Workspace Name</FieldLabel>
            <PillInput
              id="orgSlug"
              tone="pink"
              type="text"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
              placeholder="ENTER WORKSPACE SLUG"
              required
              autoFocus
            />
            <FieldHint>Enter the unique workspace ID provided by your administrator.</FieldHint>
          </div>

          {error && <ErrorPill>{error.toUpperCase()}</ErrorPill>}

          <PillButton type="submit" tone="gold" disabled={loading}>
            {loading ? "Searching..." : "Continue"}
            <ArrowRight className="h-4 w-4 stroke-[3]" />
          </PillButton>
        </form>

        <p className="text-[9px] font-black uppercase text-center text-muted-foreground tracking-wider">
          Have an invite code?{" "}
          <Link
            href="/join"
            className="text-foreground underline decoration-2 underline-offset-4 hover:text-[#D97706] transition-colors"
          >
            Redeem it here
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function OrgLoginPage() {
  return (
    <Suspense>
      <OrgLoginContent />
    </Suspense>
  );
}
