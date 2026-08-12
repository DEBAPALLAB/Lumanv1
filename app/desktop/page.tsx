"use client";

import { DesktopOnboarding } from "@/components/onboarding/desktop-onboarding";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type SessionUser = {
  ownerName: string;
  organizations?: { slug: string }[];
};

type Status = "checking" | "signed-out" | "ready";

function DesktopEntry() {
  const params = useSearchParams();
  const errorParam = params.get("error");

  const [status, setStatus] = useState<Status>("checking");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | undefined>();

  useEffect(() => {
    let active = true;

    async function resolve() {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          if (active) setStatus("signed-out");
          return;
        }
        const data = await res.json();
        if (!active) return;

        const orgs: { slug: string; id?: string }[] = data.user?.organizations ?? [];
        if (orgs.length === 0) {
          setUser(data.user);
          setStatus("ready");
          return;
        }

        // Has a team already — check whether it has a workspace yet.
        const slug = orgs[0].slug;
        const wsRes = await fetch(`/api/workspaces?orgId=${orgs[0]?.id ?? ""}`);
        const workspaces = wsRes.ok ? await wsRes.json() : [];

        if (!active) return;

        if (Array.isArray(workspaces) && workspaces.length > 0) {
          window.location.replace(`/dashboard?org=${slug}`);
          return;
        }

        // Team exists but no workspace yet — resume onboarding at that step.
        setUser(data.user);
        setOrgSlug(slug);
        setStatus("ready");
      } catch {
        if (active) setStatus("signed-out");
      }
    }

    resolve();
    return () => {
      active = false;
    };
  }, []);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {errorParam && (
        <p className="mx-auto mt-4 w-fit rounded-lg bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive">
          Sign-in failed: {errorParam.replace(/_/g, " ")}. Please try again.
        </p>
      )}
      <DesktopOnboarding
        user={user}
        initialOrgSlug={orgSlug}
        isAuthenticated={status === "ready" && user !== null}
      />
    </div>
  );
}

export default function DesktopPage() {
  return (
    <Suspense fallback={null}>
      <DesktopEntry />
    </Suspense>
  );
}
