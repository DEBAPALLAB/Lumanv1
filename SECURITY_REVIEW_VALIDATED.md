# Security & Scalability Review — VALIDATED

**Scope:** Organization → Employee workflow (invites, roles, membership, workspaces)
**Method:** Every claim below was checked against the actual files in this repo on 2026-08-19, not taken on faith from the source review. Verdicts: **CONFIRMED** (verified true as described), **CONFIRMED — CORRECTED** (true, but the original review got a file/mechanism wrong), **PARTIALLY TRUE — ALREADY MITIGATED** (real but weaker than claimed because a later migration already fixed part of it), or **NEW** (found during validation, not in the original review).

---

## 0. New Critical Finding (not in the original review)

### 0.1 `POST /api/auth/set-role` — unauthenticated self-promotion to Founder — **CRITICAL, NEW**

[app/api/auth/set-role/route.ts](app/api/auth/set-role/route.ts)

```ts
export async function POST(req: Request) {
  const { orgSlug, role } = await req.json();
  if (!["founder", "admin", "intern"].includes(role)) return apiError("Invalid role", 400);
  const session = await requireUser();
  if (!session) return apiError("Not authenticated", 401);
  const organization = await getOrganizationBySlug(orgSlug);
  await addMemberToOrganization(organization.id, user.id, role as "founder" | "admin" | "intern");
  return apiSuccess({ success: true });
}
```

Any authenticated user (any account on the platform, in any organization) can call this route with `{ orgSlug: "<any org>", role: "founder" }` and be inserted into `organization_members` as Founder of an organization they were never invited to. There is:
- no invite-code check,
- no existing-membership check,
- no check that the org has zero members,
- no role-based gate at all.

This is a straight org-takeover primitive — worse than the invite-code brute-force issue (§2 below), because it requires no guessing at all. `role` is taken verbatim from the request body and handed to `addMemberToOrganization`, which does a plain insert.

**Fix:** Delete this route, or restrict it to the "first member becomes founder" case with the same zero-member check `register` uses, gated additionally by an invite/verification step. Given `register`'s own founder-assignment already covers the legitimate use case (§2.3), the simplest fix is to delete `set-role` entirely unless something depends on it — check callers first.

---

## 1. Member Directory Lookup (`getUserSummaries`) — 🚨 Critical — **CONFIRMED**

[lib/supabase/admin.ts](lib/supabase/admin.ts)

The function pages through `adminClient.auth.admin.listUsers({ page, perPage: 1000 })` up to 10 pages (10,000 users), scanning **every user in the entire Supabase project** — not scoped to the calling organization — to resolve names/emails for the org's member list.

Confirmed consequences:
- **Cross-tenant cost leak**: an org with 5 members still triggers a scan sized by total platform users, not org size.
- **Hard ceiling**: users beyond the 10,000th (by whatever order `listUsers` returns) can never be resolved; the code already defensively falls back to `{ full_name: "Unknown", email: "Unknown" }` for anyone not found — so today this fails soft (shows "Unknown") rather than crashing, but it's still wrong data at scale.
- Called from [app/api/organization/members/route.ts](app/api/organization/members/route.ts), which also drives the desktop **secret delegation** path (`delegateIfSecretMissing`) — every member-list load on desktop round-trips to the deployed backend specifically because of this admin-API dependency.

**One correction to the original framing:** the in-code docstring shows this *is already* an intentional optimization over an even worse prior version (per-user `getUserById()` calls, one Admin API round-trip per member). The `listUsers` batch approach was a deliberate improvement, just not the fix that actually solves the tenant-scoping problem. The `public.profiles` table fix proposed in the original review is still correct and necessary — it replaces a project-wide admin scan with an indexed, RLS-scoped join.

**Fix:** as originally proposed — `public.profiles` table + `handle_new_user` trigger + RLS policy scoping visibility to shared-org membership. This also removes the desktop delegation dependency for this route.

---

## 2. Invitation & Onboarding — 🚨 Critical — **CONFIRMED, with one file correction**

### 2.1 Weak invite code generation — **CONFIRMED — CORRECTED (wrong file cited)**

The original review attributes `Math.random()` generation to `003_add_invitation_code.sql`. That migration does contain a SQL-side generator (`generate_invitation_code()`, using Postgres `random()`), but it's a vestigial/unused utility — **the actual code path the app uses** is in [lib/db/organizations.ts](lib/db/organizations.ts) `createOrganization()`:

```ts
const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
let invitationCode = "";
for (let i = 0; i < 6; i++) {
  invitationCode += chars.charAt(Math.floor(Math.random() * chars.length));
}
```

This runs in Node.js, using `Math.random()` (not cryptographically secure, though the practical issue here is keyspace size, not PRNG predictability). 36^6 ≈ 2.18 × 10^9 possibilities — large in isolation, but combined with finding 2.2 below, brute-forceable.

### 2.2 No rate limiting anywhere in the codebase — **CONFIRMED — and worse than stated**

A full-repo search for any rate-limiting library or middleware (`rate-limit`, `ratelimit`, `upstash`, etc.) turned up **zero results** outside of an unrelated match in `app/api/generate/route.ts`. There is no rate limiting on **any** route in this application, not just `verify-invite`. [app/api/auth/verify-invite/route.ts](app/api/auth/verify-invite/route.ts) reads `{ orgSlug, code }` from the body and calls `verifyOrganizationCode` with no throttling, no attempt counter, no lockout. This is a genuine unbounded brute-force surface.

### 2.3 Zero-member founder takeover — **CONFIRMED**

[app/api/auth/register/route.ts](app/api/auth/register/route.ts):

```ts
const members = await getOrganizationMembers(organization.id);
const assignedRole = members.length === 0 ? "founder" : "intern";
```

And [app/api/auth/org/route.ts](app/api/auth/org/route.ts) `POST` confirmed **does not require authentication** — `getSession()` result is optional (`creatorUserId = session ? session.user.id : undefined`), and `createOrganization` happily creates an org with zero members when `creatorUserId` is undefined. Any anonymous request can create an orphaned, member-less org; the next person to register against that slug becomes Founder with no invite code needed. Confirmed exploitable end-to-end by reading both files together.

### 2.4 Unsigned cookie trust — **CONFIRMED**

`pending_join_org` is a plain `httpOnly` cookie holding the org slug, set by `verify-invite` and checked by `register` with `pendingOrg !== orgSlug`. It is not signed or bound to the invited email — it only proves *some* request to `verify-invite` supplied the correct code at some point in the last 10 minutes, not that the registering user is the invited person. Given `verify-invite` currently has CORS wide open (`Access-Control-Allow-Origin: *`, see §2.5), this is easier to abuse than an ordinary same-origin cookie would be, though the cookie itself is `httpOnly`/only settable by the server after a real code check — so this is a design weakness (no email binding) rather than a forgeable cookie.

### 2.5 Wildcard CORS on pre-auth routes — **NEW, informational**

[lib/cors.ts](lib/cors.ts) sets `Access-Control-Allow-Origin: *` for `verify-invite` and org-lookup routes, deliberately, to support the desktop app's dynamic loopback port. The code comments this is intentional and scoped to non-credentialed, non-sensitive routes. This is a reasonable tradeoff as implemented today, but it does mean §2.2's brute-force surface is reachable from any origin in a browser, not just server-to-server — slightly widens the practical attack surface for that finding.

**Fix (as originally proposed, still correct):** replace the static per-org code with `organization_invitations` — email-scoped, hashed token, TTL, single-use — and add real rate limiting on any code-verification endpoint.

---

## 3. Dual Role System — 🔴 High — **CONFIRMED**

[supabase/migrations/008_flexible_role_hierarchy_and_note_visibility.sql](supabase/migrations/008_flexible_role_hierarchy_and_note_visibility.sql), function `sync_member_roles()`:

```sql
IF LOWER(v_role_name) = 'founder' THEN NEW.role := 'founder';
ELSIF LOWER(v_role_name) = 'admin' THEN NEW.role := 'admin';
ELSE NEW.role := 'intern';  -- any custom role collapses to 'intern'
END IF;
```

Confirmed: any custom role beyond hierarchy level 2 (e.g. "Engineering Director" at level 3) gets its legacy `organization_members.role` text column forced to `'intern'`.

Confirmed downstream impact in [app/api/workspaces/route.ts](app/api/workspaces/route.ts) `GET`:

```ts
const userRole = membership.role; // reads the legacy text column
if (ws.role === "founder") return userRole === "founder";
if (ws.role === "admin") return userRole === "founder" || userRole === "admin";
return true;
```

This hardcodes against the legacy string, so a custom-hierarchy "Engineering Director" is treated identically to an intern for workspace visibility — exactly as the original review states. Confirmed real and unchanged.

---

## 4. Role Reordering Race Condition — 🔴 High — **CONFIRMED**

[app/api/organization/[orgId]/roles/route.ts](app/api/organization/[orgId]/roles/route.ts) `PUT`:

```ts
const promises = body.roles.map(async (r) =>
  supabase.from("roles").update({ hierarchy_level: r.hierarchy_level }).eq("id", r.id).eq("organization_id", orgId)
);
const results = await Promise.all(promises);
```

Confirmed: `roles` table has `UNIQUE(organization_id, hierarchy_level)` (from migration 008, not deferred). Swapping two roles' levels concurrently will hit the constraint mid-batch on whichever update lands second. `Promise.all` also does not guarantee ordering, so this isn't just a theoretical constraint violation — it's a race even in the "should be sequential" case. The route does correctly surface the DB error (`firstError`) rather than silently failing, but the user still sees a 500 on an ordinary drag-and-drop reorder.

**Fix:** as proposed — make the constraint `DEFERRABLE INITIALLY DEFERRED`, or move the reorder into a single Postgres RPC/transaction.

---

## 5. Unauthenticated Org Spawning — 🟠 Medium — **CONFIRMED** (see §2.3, same root cause)

Already verified above: `POST /api/auth/org` has no `requireUser()` call. This is the same code path that enables §2.3's founder-takeover race, so these two findings share one fix.

---

## 6. Workspace Filtering in JavaScript — 🟠 Medium — **CONFIRMED**

[app/api/workspaces/route.ts](app/api/workspaces/route.ts) `GET` confirmed: fetches `getWorkspaces(orgId, user.id)` (all workspaces the base query returns) then applies role-visibility logic in a JS `.filter()` after the data has already crossed the network. Confirmed this is application-layer enforcement, not RLS-layer — meaning any other code path that queries `workspaces` directly (a client-side Supabase call, a different route, a future admin tool) would not inherit this filtering unless it also remembers to reimplement it. This is a real defense-in-depth gap, not just a performance issue.

**Fix:** as proposed — move the visibility logic into an RLS policy on `workspaces` using a `get_user_hierarchy_level`-style helper, so the row-level restriction holds regardless of query path.

---

## 7. Offboarding & Orphaned Orgs — 🟠 Medium — **CONFIRMED, and narrower than described**

- **No last-founder guard**: confirmed — grepped all migrations for `BEFORE DELETE`/`trg_ensure_founder`/`verify_founder_remains`; none exist. A sole founder can be removed (or can remove themselves) with no DB-level protection, matching the original review.
- **`removeMemberFromOrganization` is dead code**: [lib/db/organizations.ts](lib/db/organizations.ts) defines this function, but grepping every route under `app/api/organization/` confirms **no route currently calls it**. There is no working member-removal/"kick" endpoint at all today. This changes the finding's shape: the immediate risk isn't "founder gets kicked and org is orphaned" (there's no kick endpoint to trigger that), it's that when this endpoint eventually gets wired up (an obviously-missing feature), the guard needs to exist *before* that happens, not after.
- Orphaned workspace ownership on removal, and realtime channels staying open post-removal, were not independently verified in this pass (no removal code path exists yet to test) — treat as **plausible, unverified** rather than confirmed.

---

## 8. Additional finding from validation: stale comment in migration 017 — **NEW, informational, no action needed**

[supabase/migrations/017_fix_org_members_select_recursion.sql](supabase/migrations/017_fix_org_members_select_recursion.sql) contains a comment claiming `is_org_member()` still has a parameter-shadowing bug (`user_id = user_id` always true) inherited from migration 008, and that "three other policies already depend on its current behaviour" so it wasn't reused.

Cross-checked against [supabase/migrations/009_fix_function_parameter_conflicts.sql](supabase/migrations/009_fix_function_parameter_conflicts.sql): **this bug was already fixed three migrations earlier.** Migration 009 dropped and recreated all five affected functions (`is_org_member`, `get_user_role_id`, `get_user_hierarchy_level`, `is_top_level_authorized`, `check_note_visibility`) with `p_`-prefixed parameters specifically to eliminate the column/parameter name collision. The currently-deployed `is_org_member(p_org_id, p_user_id)` does **not** have this bug.

This isn't a live vulnerability — it's a stale/incorrect code comment that could mislead a future developer into either re-introducing the bug or avoiding a safe-to-reuse function. Worth a one-line comment fix in migration 017, no functional change needed.

---

## Severity Ranking (revised)

| # | Finding | Severity | Status |
|---|---|---|---|
| 0.1 | `set-role` unauthenticated founder self-promotion | 🚨 Critical | **NEW** |
| 1 | `getUserSummaries` project-wide admin scan | 🚨 Critical | Confirmed |
| 2.2 | Zero rate limiting anywhere in the app | 🚨 Critical | Confirmed, broader than stated |
| 2.3 / 5 | Unauthenticated org creation → founder takeover race | 🚨 Critical | Confirmed |
| 2.1 | Weak 6-char invite code | 🔴 High | Confirmed, file corrected |
| 3 | Dual role system collapse to legacy strings | 🔴 High | Confirmed |
| 4 | Role reorder race condition (500 on drag-drop) | 🔴 High | Confirmed |
| 6 | Workspace filtering in JS, not RLS | 🟠 Medium | Confirmed |
| 7 | No last-founder guard | 🟠 Medium | Confirmed (but no kick endpoint exists yet) |
| 2.4 | Unsigned/unbound invite cookie | 🟠 Medium | Confirmed |
| 2.5 | Wildcard CORS on pre-auth routes | 🔵 Low | Confirmed, intentional tradeoff |
| 8 | Stale comment in migration 017 | 🔵 Low | Informational only |

---

## Recommended Order of Fixes

**Done (2026-08-19):**
1. ✅ Deleted `POST /api/auth/set-role` (§0.1) — confirmed zero callers anywhere in the app before removal.
2. ✅ `POST /api/auth/org` — kept anonymous creation (it's the intentional "create org, then register" flow used by `app/org-register/page.tsx`), but closed §2.3/§5's race: creating an org anonymously now issues a signed, 10-minute `founder_claim` cookie (`lib/db/organizations.ts::issueFounderClaim`/`verifyFounderClaim`, HMAC'd with the service-role key). `register/route.ts` now only grants Founder to a zero-member org if the caller holds a matching claim; anyone else registering against that slug falls through to `intern`, which correctly requires an invite code they won't have.
3. ✅ Role reorder race (§4): added `supabase/migrations/018_defer_roles_hierarchy_unique.sql` — makes `UNIQUE(organization_id, hierarchy_level)` `DEFERRABLE INITIALLY DEFERRED` **and** adds a `reorder_roles(p_org_id, p_roles)` RPC that does the whole batch as one `UPDATE ... FROM` statement. The deferrable constraint alone wasn't sufficient — the old code issued one independent PostgREST call per role via `Promise.all`, each its own auto-committed transaction, so nothing was ever deferred within a shared transaction. `app/api/organization/[orgId]/roles/route.ts`'s `PUT` now calls the RPC instead. **Needs the migration applied to the Supabase project before this takes effect** — file is written but not yet run against any database from this session.

**Do next (require new tables/infra):**
4. `public.profiles` + trigger + RLS, replacing `getUserSummaries`'s admin scan (§1).
5. `organization_invitations` table + real rate limiting middleware (§2).
6. Last-founder deletion trigger (§7) — cheap insurance even before a kick endpoint exists.

**Do after (architecture cleanup, larger diffs):**
7. Unify role system — drop legacy string column reliance in `workspaces` route (§3).
8. Move workspace visibility into RLS (§6).
