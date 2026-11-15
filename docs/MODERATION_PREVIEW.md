# Moderator review prototype — no live publishing

Based on Gemini's Nov 2026 Captain Profile Moderation, Approval & Publication specification, but deliberately narrower than its proposed live system.

## What is implemented

- `lib/moderation-review.ts`: deterministic typed diff and severity/queue-priority triage for already validated PR #40 captain fleet proposals (1–4 boats and 1–8 named seasonal trips).
- Compares `vessel.id` and `offering.id`, rather than array position, so reordering boats or packages cannot generate phantom changes.
- Treats fish-care option order, month order and species order as sets, not diffs.
- Summarizes added/removed boats/packages, field-by-field before/after values, boat assignment changes, season changes and waterway changes.
- Risk levels are reviewer attention hints: low (routine/amenity/month), medium (boats, packages, species, waters, vessel assignment), high (first-time proposal or unknown ownership). **Every tier requires explicit human approval.**
- Fails closed on invalid proposals, forged fields, bad vessel IDs, bad seasons or unsupported schema extensions.
- Local-only illustrative UI at `/admin/inbox` when running `npm run dev`, using **purely synthetic sample data**. In production `process.env.NODE_ENV !== 'development'` immediately returns Next.js `notFound()`. No links to the preview exist in public navigation.
- The UI has **no controls to approve, reject, or publish** and contains no database connection, credentials, captured identities or client-side auth token.

## What is NOT implemented

- No live moderation inbox, real admin roles, credential uploads, profile claimant changes, database revisions, API endpoints, anonymous/public submission read or production publication.
- No server-side admin authorization because the live Supabase schema and RLS have not been verified. Adding a fake login based on an email/domain/user_metadata would be a security bug. Future roles must be assigned in a protected store and enforced by server checks and RLS.
- No one-click publication. A later phase requires a reviewer-authorized, atomic database operation that writes an immutable revision/audit record and a clearly labeled published snapshot while leaving imported OSMB/WA sources untouched.
- No pricing edits, automatic credential expiry badges, universal license requirements or submission of personal documents. Gemini's regulatory and badge copy remains research, not approved legal text.
- No bulk auto-seeding from scraped websites. Public research summaries must be source-linked and independently editorially reviewed; captain self-report is a separate provenance tier.

## Next release gates

1. Inspect the actual deployed RateMyGuidePNW Supabase schema and live RLS in a non-mutating read. The project was previously inactive; do not reactivate or apply migrations without approval.
2. Use isolated local/staging Postgres and token-backed test users to prove anonymous, approved-owner, non-owner, expired/revoked claim, malicious metadata and service-role boundary cases. Code-level tests are insufficient for DB security.
3. Build a **server-only** protected moderator API using real admin authorization, rate limits, CSRF protection as appropriate for auth architecture, and an append-only audit trail. Do not trust risk tier, ownership, current snapshot or role supplied by the browser.
4. Publish captain-contributed details only through a separate admin-reviewed read model, leaving raw government/directory imports immutable.
5. Smoke-test UI on iPhone and Android with realistic long titles and 375px responsive layout, then obtain founder approval to merge and deploy.

Run:
```sh
npm run test:moderation
npm run typecheck
npm run build
```
