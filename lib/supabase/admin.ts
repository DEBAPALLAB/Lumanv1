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

/** Display fields for one user, resolved from auth metadata. */
export type UserSummary = { id: string; full_name: string; email: string };

const summarise = (user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): UserSummary => ({
  id: user.id,
  full_name:
    (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "Unknown",
  email: user.email || "Unknown",
});

/**
 * Resolves display names and emails for many users at once.
 *
 * The obvious implementation — getUserById() per id — costs one Admin API
 * round trip per member, which is what made the members list (and therefore
 * chat's author directory) slow enough to notice. listUsers() pages through
 * the whole directory instead, so the cost is a function of org size rather
 * than of how many ids were asked for.
 *
 * Returned as a Map keyed by id: callers are always joining these back onto
 * rows they already hold, and a Map makes that a lookup rather than a scan.
 */
export async function getUserSummaries(userIds: string[]): Promise<Map<string, UserSummary>> {
  const wanted = new Set(userIds);
  const found = new Map<string, UserSummary>();
  if (wanted.size === 0) return found;

  // listUsers is paginated and caps well below 1000 per page in practice.
  // Stop as soon as every requested id is accounted for so a large directory
  // does not cost more than the query needs.
  const PER_PAGE = 1000;
  const MAX_PAGES = 10;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error || !data?.users?.length) break;

    for (const user of data.users) {
      if (wanted.has(user.id)) found.set(user.id, summarise(user));
    }

    if (found.size === wanted.size || data.users.length < PER_PAGE) break;
  }

  // Anyone still unresolved (deleted account, or beyond the page cap) gets a
  // placeholder, so callers can rely on every requested id being present.
  for (const id of wanted) {
    if (!found.has(id)) found.set(id, { id, full_name: "Unknown", email: "Unknown" });
  }

  return found;
}
