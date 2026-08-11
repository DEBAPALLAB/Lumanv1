import {
  addMemberToOrganization,
  getOrganizationBySlug,
  getUserMembership,
  getUserOrganizations,
} from "@/lib/db/organizations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  // Set by the Electron shell when it re-enters this route with a handed-off
  // code, so error paths return to the desktop entry instead of web pages.
  const isDesktopClient = requestUrl.searchParams.get("desktop") === "1";
  const failureBase = isDesktopClient ? "/desktop" : "/org-login";
  const cookieStore = await cookies();

  // Get org slug from search params OR from cookie (pending_join_org takes precedence for invites)
  let orgSlug =
    cookieStore.get("pending_join_org")?.value ||
    requestUrl.searchParams.get("org") ||
    cookieStore.get("sb_org_slug")?.value;
  const isNewOrg = requestUrl.searchParams.get("new") === "true";
  const isInvite = !!cookieStore.get("pending_join_org")?.value;

  // Check for error and error_description from Supabase
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      `${requestUrl.origin}${failureBase}?error=oauth_error&details=${encodeURIComponent(errorDescription || error)}`,
    );
  }

  // Desktop handoff.
  //
  // Supabase uses the PKCE flow: `signInWithOAuth` stores a one-time code
  // verifier alongside the client that started sign-in. Sign-in starts in the
  // user's browser (this origin), so only this origin holds the verifier --
  // handing the raw `code` to the desktop app would fail there, because its
  // embedded server never had the matching verifier.
  //
  // So the exchange happens HERE, where the verifier lives, and the resulting
  // session tokens are handed to the app over the luman:// deep link. The app
  // installs them into its own cookie jar via /auth/desktop-session.
  const isDesktopClientFlow = requestUrl.searchParams.get("desktop") === "1";

  // If we have a code, exchange it for a session
  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        return NextResponse.redirect(
          `${requestUrl.origin}${failureBase}?error=exchange_failed&details=${encodeURIComponent(exchangeError.message)}`,
        );
      }

      if (!data?.session) {
        return NextResponse.redirect(`${requestUrl.origin}${failureBase}?error=no_session_after_exchange`);
      }

      const session = data.session;
      const user = session.user;

      // Clean up the org cookie
      cookieStore.delete("sb_org_slug");

      // Desktop: the session now exists in THIS browser, but it belongs in the
      // app. Hand the tokens over the deep link and stop here -- the app
      // installs them and does its own org resolution.
      if (isDesktopClientFlow) {
        const handoff = new URL(`${requestUrl.origin}/auth/desktop`);
        handoff.searchParams.set("access_token", session.access_token);
        handoff.searchParams.set("refresh_token", session.refresh_token);
        if (orgSlug) handoff.searchParams.set("org", orgSlug);
        return NextResponse.redirect(handoff.toString());
      }

      let organization = null;
      if (orgSlug) {
        // Verify specifically requested organization exists
        organization = await getOrganizationBySlug(orgSlug);
      }

      // If specific org not found or not provided, try to find ANY org the user belongs to
      if (!organization) {
        const userOrgs = await getUserOrganizations(user.id);
        if (userOrgs && userOrgs.length > 0) {
          // Default to the first organization
          organization = userOrgs[0];
          orgSlug = organization.slug;
        }
      }

      // If STILL no organization, user needs to create one or is in a weird state
      if (!organization) {
        if (isNewOrg) {
          // This shouldn't theoretically happen if isNewOrg is true but org slug is missing
          // but we can fallback to org registration
          return NextResponse.redirect(`${requestUrl.origin}/org-register`);
        }
        return NextResponse.redirect(`${requestUrl.origin}/org-register?error=no_org_found`);
      }

      // Check if user is already a member (redundant if we just fetched userOrgs, but good for safety)
      const membership = await getUserMembership(organization.id, user.id);

      if (membership) {
        return NextResponse.redirect(`${requestUrl.origin}/dashboard?org=${orgSlug}`);
      }

      // If we are here, user is authenticated but NOT a member of the target org.
      // This happens if they tried to log into 'lucidetech' but aren't a member.
      // In that case, we should probably check if they are a member of ANY org (again)
      // but if we are in 'isNewOrg' flow, we add them.

      // Redirect to role selection or dashboard
      if (isNewOrg) {
        await addMemberToOrganization(organization.id, user.id, "founder");
        return NextResponse.redirect(`${requestUrl.origin}/dashboard?org=${orgSlug}`);
      }

      // Check for valid invite
      if (isInvite) {
        await addMemberToOrganization(organization.id, user.id, "intern");
        // Clear the cookie
        cookieStore.delete("pending_join_org");
        return NextResponse.redirect(`${requestUrl.origin}/dashboard?org=${orgSlug}`);
      }

      // Fallback: User tried to join specific org but isn't a member.
      // STRICT MODE: Do NOT auto-assign. Redirect to register/join page.
      return NextResponse.redirect(`${requestUrl.origin}/register?error=needs_invite&org=${orgSlug}`);
    } catch (err) {
      return NextResponse.redirect(
        `${requestUrl.origin}${failureBase}?error=callback_exception&details=${encodeURIComponent(String(err))}`,
      );
    }
  } else {
    return NextResponse.redirect(`${requestUrl.origin}${failureBase}?error=missing_code`);
  }
}
