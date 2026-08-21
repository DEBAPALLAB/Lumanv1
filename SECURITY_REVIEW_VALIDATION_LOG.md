# Validation Log — Org/Employee Workflow Security Review

Internal record of how each claim in the source review was checked. Not for distribution — see `SECURITY_REVIEW_VALIDATED.md` for the reader-facing findings.

## Method
For every claim in the pasted review, read the actual file(s) cited (or the correct file, if the citation was wrong) rather than trusting the review's code excerpts. Where the review referenced a mechanism (e.g. "no rate limiting"), ran a repo-wide grep to confirm absence rather than assuming. Cross-checked migrations in numeric order — this codebase has a pattern of a migration introducing a bug and a later migration silently fixing it (006→008→009, 016→017), so any claim about a migration's behavior needed the *latest* migration touching that object, not just the one cited.

## Files actually read (not just grepped)
- `lib/supabase/admin.ts` — full read
- `app/api/auth/verify-invite/route.ts`, `app/api/auth/register/route.ts`, `app/api/auth/org/route.ts`, `app/api/auth/set-role/route.ts` — full read
- `app/api/organization/members/route.ts`, `app/api/organization/[orgId]/roles/route.ts` — full read
- `lib/db/organizations.ts`, `app/api/workspaces/route.ts` — full read
- `supabase/migrations/003, 006, 008, 009, 016, 017` — full read
- `lib/server/delegate.ts`, `lib/cors.ts`, `lib/auth/session.ts` — partial read (enough to confirm auth model)

## Corrections made to the source review
1. **Invite code generator file**: review cited `003_add_invitation_code.sql` for the `Math.random()` generator. That SQL function exists but is unused by app code. The real path is `lib/db/organizations.ts::createOrganization()`, which independently generates the code in Node using `Math.random()`. Confirmed by reading both files — the SQL function is never called from any TS file (grepped `generate_invitation_code` — zero hits outside the migration itself).
2. **`is_org_member` shadowing bug**: migration 017's own comment claims this function still has a parameter-shadowing bug and that policies depend on the broken behavior. Read migration 009 and confirmed this was already fixed there (parameters renamed to `p_org_id`/`p_user_id`). The review didn't mention this function at all — I found it while chasing the review's dual-role-system claim and it turned out to be a red herring worth flagging as "stale comment," not a live bug. Almost included this as a live critical finding before catching that 009 postdates and fixes 008 — worth noting since it's the kind of miss the user is explicitly asking me to guard against.
3. **Last-founder / offboarding section**: review describes risk as if member removal is a working, reachable flow. Grepped every route file for `removeMemberFromOrganization` — it's defined but never called. Downgraded the "realtime channels stay open" and "workspaces orphaned on removal" sub-claims to unverified/plausible rather than confirmed, since there's no live code path to actually trigger removal today.

## New finding not in the source review
`POST /api/auth/set-role` ([app/api/auth/set-role/route.ts](app/api/auth/set-role/route.ts)) — takes `{ orgSlug, role }` from any authenticated user, validates only that `role` is one of the three legacy strings, and inserts the caller into that org with the requested role, including `"founder"`. No membership check, no invite check, no zero-member check. Found this while tracing all callers of `addMemberToOrganization` to see how many entry points there were (register, verify-invite, org-create, and this one) — this was the one entry point the source review never looked at, and it's the most severe issue in the whole review. Flagged as §0.1 / top of the fix-order list in the validated doc.

## Claims confirmed as-is (no correction needed)
- `getUserSummaries` project-wide `listUsers()` scan — confirmed, though the code shows this was already an improvement over a worse prior version (per-user `getUserById` calls), which the original review's framing didn't acknowledge.
- Zero rate limiting — confirmed via repo-wide grep (`rate.limit|ratelimit|upstash`), and found it applies to the *entire app*, not just the invite-verification route as the review implied.
- Zero-member founder takeover race — confirmed end-to-end by reading `org/route.ts` (no auth required) + `register/route.ts` (first registrant becomes founder).
- Dual role system collapsing custom roles to `'intern'` in the legacy column, and `workspaces/route.ts` hardcoding against that legacy column — confirmed verbatim, matches review's code excerpts closely.
- Role-reorder `Promise.all` race against a non-deferrable unique constraint — confirmed verbatim.
- Workspace filtering happening in JS after a wide Postgres query, not in RLS — confirmed verbatim.
- No last-founder deletion trigger anywhere in migrations — confirmed via grep across all migration files.

## Confidence notes
- Everything marked CONFIRMED in the validated doc was verified by reading the actual current file content in this session, not from the review's excerpts.
- The "realtime channels stay open on removal" and "workspace/notes orphaned on removal" sub-claims remain unverified — there's no removal endpoint to exercise, so this is inference about what *would* happen if `removeMemberFromOrganization` were wired up, not an observed behavior.
- Did not check `DEPLOYMENT_READINESS.md`'s "Migration 011" claim (RLS on tasks/events) in depth — out of scope for this org/employee-workflow review, flagged in original review's remediation plan but not re-verified here.
