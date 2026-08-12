import { NextResponse } from "next/server";

/**
 * Scoped CORS allowance for the small set of pre-auth lookup routes the
 * desktop app calls directly against the deployed origin (org existence,
 * invite code verification) — before a session exists, so these can't ride
 * on the app's own embedded server. The desktop app's embedded server binds
 * an arbitrary loopback port each launch, so there's no fixed origin to
 * allowlist; a wildcard is safe here specifically because neither route is
 * credentialed (no cookies read or set) and both only ever disclose
 * non-sensitive existence/validity facts (an org's name/slug, whether a
 * code matches) — never membership data or anything else.
 */
export function withCors<T>(response: NextResponse<T>) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

export function corsPreflight() {
  return withCors(new NextResponse(null, { status: 204 }));
}
