import { getUserOrganizations } from "@/lib/db/organizations";
import { type CookieOptions, createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Installs a session handed to the desktop app over the `luman://` deep link.
 *
 * Sign-in runs in the user's browser because that is where the PKCE code
 * verifier lives, so the browser performs the code exchange. The resulting
 * tokens are passed here, to the app's own embedded server, so the session
 * cookie is written into the desktop window's cookie jar.
 *
 * Only reachable on the loopback server the desktop shell runs.
 *
 * Cookies from `setSession()` must be written directly onto the redirect
 * response's `Set-Cookie` header. The shared `createSupabaseServerClient()`
 * helper stages cookie writes through `next/headers`' `cookies()` store,
 * which only flushes for responses Next.js builds *for* the current render —
 * a fresh `NextResponse.redirect()` built here doesn't pick those writes up,
 * so the session would silently fail to persist. Building the response first
 * and handing Supabase a cookie adapter bound to *that* response (mirroring
 * lib/supabase/middleware.ts) is the only way both survive together.
 *
 * The redirect target is pinned to 127.0.0.1 rather than echoing the
 * request's Host header — Electron's BrowserWindow always loads
 * 127.0.0.1:<port>, but a request can arrive as `localhost`, and cookies set
 * for one hostname are invisible on the other even on the same machine.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = `http://127.0.0.1:${requestUrl.port}`;
  const accessToken = requestUrl.searchParams.get("access_token");
  const refreshToken = requestUrl.searchParams.get("refresh_token");
  const orgSlug = requestUrl.searchParams.get("org");

  if (!accessToken || !refreshToken) {
    return NextResponse.redirect(`${origin}/desktop?error=missing_session`);
  }

  let response = NextResponse.redirect(`${origin}/desktop?authorized=1`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options, maxAge: 345600 });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error || !data?.session) {
      return NextResponse.redirect(
        `${origin}/desktop?error=session_install_failed&details=${encodeURIComponent(
          error?.message ?? "no_session",
        )}`,
      );
    }

    // Route onward the same way the desktop entry screen would, preserving
    // the cookies already staged on `response`.
    if (orgSlug) {
      response = NextResponse.redirect(`${origin}/dashboard?org=${orgSlug}`, {
        headers: response.headers,
      });
      return response;
    }

    const orgs = await getUserOrganizations(data.session.user.id);
    if (orgs && orgs.length === 1) {
      response = NextResponse.redirect(`${origin}/dashboard?org=${orgs[0].slug}`, {
        headers: response.headers,
      });
      return response;
    }

    // No org, or several - let the desktop entry route decide. `response`
    // already redirects to /desktop?authorized=1 with cookies attached.
    return response;
  } catch (err) {
    return NextResponse.redirect(
      `${origin}/desktop?error=session_install_exception&details=${encodeURIComponent(String(err))}`,
    );
  }
}
