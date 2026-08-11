import { createClient } from "@supabase/supabase-js";

/**
 * The single legitimate service-role client in this app. Every ordinary
 * read/write goes through lib/supabase/server.ts and is RLS-governed —
 * this file exists only for the narrow set of operations the Admin API
 * exposes that RLS cannot (e.g. resolving a user's email from their id,
 * which requires auth.admin.getUserById and no amount of RLS grants a
 * regular client that capability).
 *
 * Export only named, purpose-specific functions here — never the raw
 * client — so every elevated-privilege call site in the app is visible
 * from this file's export list.
 */
const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function getUserById(userId: string) {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return data.user;
}
