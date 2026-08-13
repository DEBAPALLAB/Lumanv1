import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Runtime configuration for the desktop shell.
 *
 * `NEXT_PUBLIC_*` names are substituted with string literals by the bundler --
 * including inside server code like this route -- so reading one here bakes
 * whatever value was present at BUILD time into every distributed copy. The
 * Electron main process cannot override it at launch, and pointing a build at
 * a different environment would require rebuilding it.
 *
 * So the non-public `SITE_URL` is read first: it survives as a real runtime
 * lookup, which lets the Electron main process inject it at launch (see
 * RUNTIME_SECRET_KEYS in electron/main.js) and lets one binary target staging
 * or production. `NEXT_PUBLIC_SITE_URL` remains a build-time fallback so
 * existing web deployments keep working unchanged.
 *
 * The trailing slash is stripped because callers compose paths as
 * `${siteUrl}/api/...`; a trailing slash yields a double slash, which Vercel
 * answers with a 308 redirect that carries no CORS headers, failing the
 * cross-origin request before it is ever followed.
 *
 * Only non-secret, publishable values belong in this response.
 */
export function GET() {
  const siteUrl = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null;

  return NextResponse.json({
    siteUrl: siteUrl ? siteUrl.replace(/\/+$/, "") : null,
  });
}
