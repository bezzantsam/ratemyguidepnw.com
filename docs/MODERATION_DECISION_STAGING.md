# Moderator review decisions — staging-only design, not live moderation

**Current project state: INACTIVE.** This draft contains no production SQL execution, moderator enrollment, review publication, authenticated web moderation endpoint, Supabase project restoration, merge, deployment or new paid service.

## Why this matters

The directory needs to let real anglers submit cash-friendly firsthand reviews **without receipts** while giving captains confidence that one rival cannot flood ratings or convince the platform to suppress honest criticism. Pending reviews cannot become published until an independent moderator makes a recorded decision. A captain or paying advertiser must not get to choose which genuine reviews appear or change the score.

PR #67 introduced a proposed atomic captain claim and pending review submission contract. It intentionally had no moderator publication flow. This branch adds the **next stage of the design** while leaving the production moderation page a development-only mock.

## Three layers

1. `lib/review-moderation-decision.ts` is a pure, tested model of allowed transitions: **pending → published** or **pending → rejected**. It rejects repeat approvals, inactive moderators, review authors moderating themselves, moderators who own the reviewed guide, unsupported decisions and missing internal reasons. It requires firsthand *attestation* and 40–500 characters for publication, never banking evidence or a claim that a trip was verified. It has **no authority by itself** because any caller can supply the booleans.
2. `supabase/proposals/review_moderation_decisions_staging_only.sql` proposes a protected `private.review_moderators` table (all inactive by default, no public enrollment) and an append-only `private.review_decision_events` ledger. The `public.decide_angler_review` procedure is **SECURITY INVOKER** and executable **only by `service_role`**, never from an ordinary signed-in browser. It checks actual protected moderator membership, row-locks the pending review, rejects self-moderation/owned-guide conflicts, applies the status/timestamp, and inserts one private audit event **within the same transaction**. A failure rolls back both.
3. Future approved server handler: a **server-only** Next.js endpoint must independently call Supabase Auth's `getUser(access_token)` on the supplied JWT, validate account/session as needed, derive the moderator's real UUID from that server result (NOT caller-provided JSON or `user_metadata`), and call the RPC using a **server-only service-role key**. Never prefix that secret with `NEXT_PUBLIC_` or embed it in a client component. Configure rate limits and a neutral, private reviewer reason. **There is no live endpoint in this PR.**

## Trust and operational rules

- Every registered moderator starts inactive; only an explicitly reviewed human admin action can appoint/activate one. No captain claim, review author, account preference, subscription tier, sponsor purchase, email domain, or client-side `is_admin` flag qualifies.
- Positive and negative reviews are judged by the **same content and abuse standards**. The moderator's reason must be 12–500 characters and be stored privately, not shown to rival guides, public users or searchable analytics.
- A guide must be currently published to publish a review. A historical or retracted listing still needs independent editorial checks. A pending review about a suspended guide is not public.
- Private reviewers may be recognizable to trip companions based on their story, even when their account ID is hidden. Do not reveal trip month, contact data, private claim evidence or reviewer account IDs to guides. Do not require receipts, guide confirmation, financial paperwork, payment method, or tax records.
- **No auto-approval:** Even low-risk reviews need an explicit independent decision. Prior decisions are locked; appeals should create separately audited review/reconsideration events, **not overwrite or delete the old decision**. Revisions, right of reply, takedown and appeals need their own approved workflows.
- The private decision log is **append-only to normal app roles**, but it is **not cryptographically tamper-evident** against privileged project admins. Database administrators and holders of service credentials can potentially bypass the intended procedure; restrict and monitor all privileged credentials, review off-path mutations, and use an external immutable audit anchor if stronger guarantees become necessary.
- A real moderator inbox must show what evidence the reviewer actually supplied, content-policy flags, duplicate/brigade signals and the full decision history. The existing `/admin/inbox` mock MUST continue returning 404 in production until real authenticated access and moderation publication are tested. Never let a public API expose the private ledger or roster.

## Remaining review and security blockers

1. **Owner approves restoring the INACTIVE Supabase project** and reviews costs/permissions. Until then **do not execute** any SQL from `supabase/proposals/`. The project's actual existing tables, policies, triggers and grants are UNKNOWN; `0001_initial.sql` is only a scaffold.
2. Read-only inspect real schema, grants, `auth` / admin roles, published-review view, write policies, and existing `moderation_events`. This staged draft uses a new private ledger to avoid silently trusting the old, public-schema moderation table.
3. Check current Supabase changelog for breaking changes and latest RLS/grant/security guidance. In particular, Supabase CLI v3 changed local-vs-hosted defaults in November 2026: do not improvise a production CLI sequence. Reconcile SQL in an approved disposable **staging** database first.
4. Run **real JWT** tests for signed-out/anonymous, ordinary account, rejected claimant, approved captain, competing guide, reviewer-as-moderator, inactive moderator, active moderator and service backend. Verify role grants and RPC exposure as well as RLS. Run simultaneous decisions to prove row locking and unique audit entries, and force an audit insert failure to prove rollback (no published-without-audit state).
5. Validate existing published-review ratings trigger updates mean/count on publish; verify a rejected review does not contribute. Ensure public reviews never disclose author ID, private evidence, `private.review_decision_events` or other protected fields. Add an authorization-and-audit design for manual appeals and right-of-reply separately.
6. Review moderation capacity and fairness for hostile reviews, conflicts of interest, false allegations, threats, doxxing and fishing-spot disclosures without arbitrary reviewer-proof quotas or paid suppression.

## Important scope limitations

This is **reviewable code design only**. Tests execute the pure transition rules and inspect the proposed SQL, **not a live Postgres database**. They cannot prove actual grants, constraints, session security, transactional isolation, external audit immutability or production readiness. There is no production API endpoint, login, intake activation, direct Supabase write, recurring monitoring, payment or publication here. The previously documented strict backend readiness gate continues to report BLOCKED.

See also:
- `docs/ATOMIC_CLAIMS_STAGING_REVIEW.md`
- `docs/ANGLER_REVIEW_POLICY.md`
- `supabase/proposals/claim_review_pending_staging_only.sql`

**Recommendation:** do not expand more app features until the founder decides when to restore the backend for read-only schema inventory and an isolated staged permission test.
