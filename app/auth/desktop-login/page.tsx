"use client";

import { createSupabaseClient } from "@/lib/supabase/client";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Browser-side OAuth entry point for the desktop app.
 *
 * The desktop app opens this page in the user's real browser (via
 * shell.openExternal) instead of running signInWithOAuth inside its own
 * embedded server. Supabase's PKCE flow stores a one-time code verifier
 * against the origin that starts the flow, and only a stable, publicly
 * reachable origin can be registered as an OAuth redirect target — the
 * desktop app's local server runs on an arbitrary loopback port that
 * Google/Supabase have never heard of. So sign-in has to start HERE, on the
 * deployed site, and hand the resulting session back to the app via the
 * /auth/callback?desktop=1 -> /auth/desktop -> luman:// deep-link relay.
 *
 * org/new are forwarded from the desktop app's own pre-auth org selection
 * (DesktopOnboarding) so /auth/callback can assign founder/intern the
 * moment the session is created, exactly like the web login/register flow.
 */
function DesktopLoginContent() {
  const params = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    async function start() {
      try {
        const orgSlug = params.get("org");
        const isNewOrg = params.get("new") === "true";
        const inviteCode = params.get("invite");

        const callback = new URL(`${window.location.origin}/auth/callback`);
        callback.searchParams.set("desktop", "1");
        if (orgSlug) callback.searchParams.set("org", orgSlug);
        if (isNewOrg) callback.searchParams.set("new", "true");
        if (inviteCode) callback.searchParams.set("invite", inviteCode);

        const supabase = createSupabaseClient();
        const { error: authError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: callback.toString(),
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
          },
        });

        if (authError) setError(authError.message);
      } catch {
        setError("Couldn't start sign-in. Please try again.");
      }
    }

    start();
  }, [params]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md border-4 border-foreground bg-card p-8 text-center shadow-[8px_8px_0px_0px_hsl(var(--foreground))]">
        <div className="mx-auto mb-6 grid size-14 place-items-center border-4 border-foreground bg-accent">
          <MonitorSmartphone className="size-7" strokeWidth={2.5} />
        </div>

        {error ? (
          <>
            <h1 className="mb-3 text-2xl font-black uppercase tracking-tight">Sign-in failed</h1>
            <p className="text-sm font-medium text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <h1 className="mb-3 text-2xl font-black uppercase tracking-tight">
              Opening Google sign-in
            </h1>
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Redirecting you now…
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function DesktopLoginPage() {
  return (
    <Suspense fallback={null}>
      <DesktopLoginContent />
    </Suspense>
  );
}
