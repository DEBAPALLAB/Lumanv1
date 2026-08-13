import { parseBearerToken } from "@/lib/auth/bearer";
import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

/**
 * Reads an `Authorization: Bearer <jwt>` access token off the incoming
 * request, if one was sent.
 *
 * Browsers never attach this header on their own, so its presence means the
 * caller is a non-browser client — in practice the desktop app delegating a
 * request to the deployed backend (see lib/server/delegate.ts). Cookie-based
 * sessions are untouched by this and remain the default everywhere else.
 */
export async function getBearerToken(): Promise<string | null> {
  try {
    const headerStore = await headers();
    return parseBearerToken(headerStore.get("authorization"));
  } catch {
    // `headers()` is unavailable outside a request scope.
    return null;
  }
}

/**
 * Per-request Supabase client. Always respects RLS as the signed-in user —
 * this is the default and near-exclusive way server code (routes, layouts,
 * server components) talks to the database.
 *
 * Two ways a caller can prove who they are, in priority order:
 *
 *   1. `Authorization: Bearer <access_token>` — used by requests the desktop
 *      app forwards to the deployed backend. The token is pinned as a global
 *      header so every PostgREST call runs as that user; supabase-js only
 *      fills in its own `Authorization` when one is absent, so this wins.
 *   2. The session cookie — every browser request, on web and inside the
 *      desktop window alike.
 *
 * See lib/supabase/admin.ts for the narrow, explicitly-justified exception
 * that bypasses RLS entirely.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const bearerToken = await getBearerToken();

  if (bearerToken) {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    });
  }

  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options, maxAge: 345600 });
        } catch {
          // Called from a Server Component with no writable cookie store;
          // middleware's session refresh covers this case instead.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Same as above.
        }
      },
    },
  });
}
