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
    const {
      data: { user },
    } = bearerToken ? await supabase.auth.getUser(bearerToken) : await supabase.auth.getUser();

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

  return await updateSession(request);
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
