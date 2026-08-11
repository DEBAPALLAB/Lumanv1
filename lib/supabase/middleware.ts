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
export async function updateSession(request: NextRequest) {
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

  // Refreshes the session if expired — essential for SSR.
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
