import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Refreshes the Supabase auth cookie on every request and redirects an
 * already-authenticated user away from public-only pages. Route *protection*
 * (blocking unauthenticated access to private routes) is a separate concern,
 * layered on top in middleware.ts via lib/auth/session.ts — kept out of here
 * so "refresh the cookie" and "decide if this route requires auth" don't
 * collapse back into one function.
 */
export async function updateSession(request: NextRequest, knownUser?: { id: string } | null) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
            maxAge: 345600,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: "",
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: "",
            ...options,
          });
        },
      },
    },
  );

  // Refreshing the session cookie is this function's real job, and it is the
  // one thing local JWT verification cannot do: getClaims() reads a token, it
  // never renews one. getSession() refreshes when the access token is expired
  // or close to it, and is a no-op (no network) when it is still comfortably
  // valid — so the common request pays nothing and a stale one still gets a
  // fresh cookie written by the handlers above.
  //
  // Its return value is deliberately ignored for identity: values read from
  // request cookies are not authenticated, which is exactly why the caller
  // passes `knownUser` down from a verified check.
  await supabase.auth.getSession();

  // `knownUser` is the result middleware.ts already verified for protected
  // routes. Reusing it keeps identity to one verification per request.
  //
  // `undefined` means "no check has run" (public route), which still needs the
  // lookup below. `null` means "checked, nobody is signed in".
  let user: { id: string } | null;
  if (knownUser !== undefined) {
    user = knownUser;
  } else {
    // Local JWT verification rather than a round trip to the auth server; see
    // the note in middleware.ts for why this is a real verification and what
    // it trades away. Public routes only use the result to decide whether to
    // redirect a signed-in visitor away from a marketing page.
    const { data } = await supabase.auth.getClaims();
    user = data?.claims?.sub ? { id: data.claims.sub } : null;
  }

  // Logged-in users shouldn't land back on public-only auth/marketing pages.
  const hasOrgParam = request.nextUrl.searchParams.has("org");
  if (
    user &&
    !hasOrgParam &&
    (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/register")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  const landingPages = ["/", "/about", "/pricing", "/features", "/support"];
  if (user && landingPages.includes(request.nextUrl.pathname)) {
    let orgSlugToUse = request.nextUrl.searchParams.get("org");

    if (!orgSlugToUse) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organizations(slug)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const orgObj = membership?.organizations as any;
      if (orgObj?.slug) {
        orgSlugToUse = orgObj.slug;
      }
    }

    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    if (orgSlugToUse) {
      url.searchParams.set("org", orgSlugToUse);
    }
    return NextResponse.redirect(url);
  }

  return response;
}
