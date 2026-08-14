import { parseBearerToken } from "@/lib/auth/bearer";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/workspace", "/calendar", "/settings"];
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/config"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Requests the desktop app delegates to this deployment identify themselves
  // with a bearer token instead of a cookie (see lib/server/delegate.ts).
  // Browsers never send this header, so its presence changes nothing for web.
  const bearerToken = parseBearerToken(request.headers.get("authorization"));

  const needsAuth =
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    (pathname.startsWith("/api/") && !PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p)));

  // Carried into updateSession below so the auth server is asked who this is
  // once per request rather than twice. `undefined` distinguishes "never
  // looked" (public route) from "looked, nobody there" (null).
  let authedUser: { id: string } | null | undefined;

  if (needsAuth) {
    // Lightweight check, independent of updateSession's cookie-writing
    // response chain below — just need to know if a user is present.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => request.cookies.get(name)?.value,
          set: () => {},
          remove: () => {},
        },
      },
    );
    // getClaims() verifies the JWT's signature locally with the WebCrypto API
    // against this project's published JWKS, which is cached after first use.
    // getUser() instead asks the auth server on every call — a ~200ms round
    // trip that every protected request in the app was paying before anything
    // else ran.
    //
    // This is a real verification, not a decode: a forged or tampered token
    // fails the signature check, and an expired one fails the exp check, both
    // without trusting the cookie's contents. It is only equivalent to
    // getUser() because this project signs with asymmetric keys (ES256) —
    // with legacy symmetric keys getClaims() falls back to a network call and
    // simply behaves as before, so this is safe either way.
    //
    // What it does NOT catch is a token revoked mid-life (sign-out elsewhere,
    // password change) before it expires. Access tokens are short-lived and
    // every route still runs its own authorisation against RLS, so the window
    // is small and bounded — worth it for removing a round trip from the path
    // of every single request.
    const { data: claimsData } = await supabase.auth.getClaims(bearerToken ?? undefined);
    const claims = claimsData?.claims;
    const user = claims?.sub ? { id: claims.sub } : null;

    authedUser = user;

    if (!user) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
  }

  // A bearer-authenticated API call carries no cookies, so there is no session
  // to refresh and none of updateSession's redirects can apply. Skipping it
  // avoids a second pointless round-trip to the auth server.
  if (bearerToken && pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  return await updateSession(request, authedUser);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|org-login|api/auth/org|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
