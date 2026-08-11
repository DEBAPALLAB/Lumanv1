import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Runtime configuration for the desktop shell.
 *
 * `NEXT_PUBLIC_*` values are inlined when the bundle is built, so a packaged
 * app built without them cannot recover them client-side. The Electron main
 * process injects the same variables into the embedded server's environment at
 * launch, so reading them here lets the renderer resolve them at runtime.
 *
 * Only non-secret, publishable values belong in this response.
 */
export function GET() {
  return NextResponse.json({
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
  });
}
