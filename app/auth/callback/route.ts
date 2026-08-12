import {
  addMemberToOrganization,
  getOrganizationBySlug,
  getUserMembership,
  getUserOrganizations,
  verifyOrganizationCode,
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
  // Desktop's invite code travels through the OAuth redirect itself rather
  // than a cookie — a cross-origin pre-auth call from the app's arbitrary
  // localhost port can't persist a cookie onto this origin. Re-verified
  // here (not just trusted) since it crossed the network as a plain param.
  const desktopInviteCode = requestUrl.searchParams.get("invite");

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
  const isDesktopClientFlow = isDesktopClient;

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

      // Desktop hands off the session over the luman:// deep link either
      // way — the app installs it and /desktop resolves org/workspace state
      // itself. Web redirects straight to the resolved destination.
      const finish = (destinationOrgSlug?: string) => {
        if (isDesktopClientFlow) {
          const handoff = new URL(`${requestUrl.origin}/auth/desktop`);
          handoff.searchParams.set("access_token", session.access_token);
          handoff.searchParams.set("refresh_token", session.refresh_token);
          if (destinationOrgSlug) handoff.searchParams.set("org", destinationOrgSlug);
          return NextResponse.redirect(handoff.toString());
        }
        return NextResponse.redirect(
          destinationOrgSlug
            ? `${requestUrl.origin}/dashboard?org=${destinationOrgSlug}`
            : `${requestUrl.origin}/org-register?error=no_org_found`,
        );
      };

      // If STILL no organization, user needs to create one or is in a weird state
      if (!organization) {
        if (isDesktopClientFlow) {
          return NextResponse.redirect(`${requestUrl.origin}/desktop?error=no_org_found`);
        }
        return finish(undefined);
      }

      // Check if user is already a member (redundant if we just fetched userOrgs, but good for safety)
      const membership = await getUserMembership(organization.id, user.id);

      if (membership) {
        return finish(orgSlug);
      }

      // If we are here, user is authenticated but NOT a member of the target org.
      // This happens if they tried to log into 'lucidetech' but aren't a member.
      // In that case, we should probably check if they are a member of ANY org (again)
      // but if we are in 'isNewOrg' flow, we add them.

      // New org created pre-auth (web: /org-register, desktop: the
      // create-team onboarding step) — the creator becomes founder here,
      // the first moment a session exists to attach the membership to.
      if (isNewOrg) {
        await addMemberToOrganization(organization.id, user.id, "founder");
        return finish(orgSlug);
      }

      // Check for valid invite (web: cookie set by the same-origin
      // pre-auth check; desktop: code carried through the redirect itself)
      if (isInvite) {
        await addMemberToOrganization(organization.id, user.id, "intern");
        // Clear the cookie
        cookieStore.delete("pending_join_org");
        return finish(orgSlug);
      }

      if (desktopInviteCode) {
        const verifiedOrg = await verifyOrganizationCode(organization.slug, desktopInviteCode);
        if (verifiedOrg) {
          await addMemberToOrganization(organization.id, user.id, "intern");
          return finish(orgSlug);
        }
      }

      // Fallback: User tried to join specific org but isn't a member.
      // STRICT MODE: Do NOT auto-assign. Redirect to register/join page.
      if (isDesktopClientFlow) {
        return NextResponse.redirect(`${requestUrl.origin}/desktop?error=needs_invite`);
      }
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
