/**
 * Parses an `Authorization: Bearer <token>` header value.
 *
 * Deliberately dependency-free and in its own module: middleware runs in the
 * edge runtime and must not pull in `next/headers` or the Supabase server
 * client, which is what importing this from lib/supabase/server.ts would do.
 */
export function parseBearerToken(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match?.[1]?.trim() || null;
}
