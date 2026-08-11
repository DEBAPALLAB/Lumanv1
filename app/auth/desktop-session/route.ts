import { getUserOrganizations } from "@/lib/db/organizations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const accessToken = requestUrl.searchParams.get("access_token");
  const refreshToken = requestUrl.searchParams.get("refresh_token");
  const orgSlug = requestUrl.searchParams.get("org");

  if (!accessToken || !refreshToken) {
    return NextResponse.redirect(`${requestUrl.origin}/desktop?error=missing_session`);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error || !data?.session) {
      return NextResponse.redirect(
        `${requestUrl.origin}/desktop?error=session_install_failed&details=${encodeURIComponent(
          error?.message ?? "no_session",
        )}`,
      );
    }

    // Route onward the same way the desktop entry screen would.
    if (orgSlug) {
      return NextResponse.redirect(`${requestUrl.origin}/dashboard?org=${orgSlug}`);
    }

    const orgs = await getUserOrganizations(data.session.user.id);
    if (orgs && orgs.length === 1) {
      return NextResponse.redirect(`${requestUrl.origin}/dashboard?org=${orgs[0].slug}`);
    }

    // No org, or several - let the desktop entry route decide.
    return NextResponse.redirect(`${requestUrl.origin}/desktop?authorized=1`);
  } catch (err) {
    return NextResponse.redirect(
      `${requestUrl.origin}/desktop?error=session_install_exception&details=${encodeURIComponent(
        String(err),
      )}`,
    );
  }
}
