"use client";

import { CheckCircle2, MonitorSmartphone } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Browser-side handoff page for the desktop sign-in flow.
 *
 * OAuth completes in the user's real browser (where they are already signed in
 * to their provider). This page immediately forwards the one-time auth code to
 * the desktop app through the `luman://` protocol, where the app exchanges it
 * on its own local server. Nothing is exchanged here - the code is single use.
 */
function DesktopHandoff() {
  const params = useSearchParams();
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const org = params.get("org");
  const [launched, setLaunched] = useState(false);

  const hasSession = Boolean(accessToken && refreshToken);

  const deepLink = (() => {
    if (!hasSession) return null;
    const url = new URL("luman://auth/callback");
    url.searchParams.set("access_token", accessToken as string);
    url.searchParams.set("refresh_token", refreshToken as string);
    if (org) url.searchParams.set("org", org);
    return url.toString();
  })();

  useEffect(() => {
    if (!hasSession || !deepLink) return;

    // If this page renders inside the desktop shell, install the session here
    // rather than re-firing the deep link against ourselves.
    if (window.electronAPI?.isDesktop) {
      const install = new URL("/auth/desktop-session", window.location.origin);
      install.searchParams.set("access_token", accessToken as string);
      install.searchParams.set("refresh_token", refreshToken as string);
      if (org) install.searchParams.set("org", org);
      window.location.replace(install.toString());
      return;
    }

    // Browser: hand off to the desktop app.
    window.location.href = deepLink;
    setLaunched(true);
  }, [hasSession, deepLink, accessToken, refreshToken, org]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md border-4 border-foreground bg-card p-8 text-center shadow-[8px_8px_0px_0px_hsl(var(--foreground))]">
        <div className="mx-auto mb-6 grid size-14 place-items-center border-4 border-foreground bg-accent">
          {launched ? (
            <CheckCircle2 className="size-7" strokeWidth={2.5} />
          ) : (
            <MonitorSmartphone className="size-7" strokeWidth={2.5} />
          )}
        </div>

        {!hasSession ? (
          <>
            <h1 className="mb-3 text-2xl font-black uppercase tracking-tight">
              Missing sign-in code
            </h1>
            <p className="text-sm font-medium text-muted-foreground">
              This link is incomplete or has already been used. Return to the Luman desktop app and
              start the sign-in again.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-3 text-2xl font-black uppercase tracking-tight">
              Desktop app authorized
            </h1>
            <p className="mb-6 text-sm font-medium text-muted-foreground">
              You&apos;re signed in. Luman Desktop is opening now — you can close this tab and
              continue in the app.
            </p>

            {deepLink && (
              <a
                href={deepLink}
                className="inline-flex w-full items-center justify-center border-4 border-foreground bg-accent px-6 py-3 text-sm font-black uppercase tracking-wide text-accent-foreground transition-transform hover:translate-x-[2px] hover:translate-y-[2px]"
              >
                Open Luman Desktop
              </a>
            )}

            <p className="mt-4 text-xs font-medium text-muted-foreground">
              Nothing happened? Click the button above to launch the app.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function DesktopHandoffPage() {
  return (
    <Suspense fallback={null}>
      <DesktopHandoff />
    </Suspense>
  );
}
