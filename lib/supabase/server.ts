import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Per-request, cookie-bound Supabase client. Always respects RLS as the
 * signed-in user — this is the default and near-exclusive way server code
 * (routes, layouts, server components) talks to the database. See
 * lib/supabase/admin.ts for the narrow, explicitly-justified exception.
 */
export async function createSupabaseServerClient() {
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
