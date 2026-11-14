# Captain-provided fisheries intake — engineering review

This is the **free factual profile information** path. Captains can state the actual fisheries they target, normal operating months, typical launch area, vessel type, maximum group size, fish-care services, and seat/boat booking styles. None of these fields are an active-license check, proof of captain ownership, safety certification, a forecast, or an independently verified trip.

## User flow

1. Find the historical directory listing and visit `/claim/[id]`.
2. Request a **free** independent ownership review through the existing claim process.
3. Draft up to eight fisheries in the structured editor while the claim is pending. Session storage is limited to that tab/browser, not cloud sync; there is no offline background publishing.
4. **Only after the claimed owner is approved**, the browser may submit a structured proposal to `guide_fishery_proposals`, if the backend is online and the proposed SQL schema was separately reviewed and applied.
5. SQL enforces approved-claim ownership, `auth.uid()=submitted_by`, `review_state='pending'`, strict JSONB field bounds, no client update/delete permission, no public SELECT.
6. A future authorized moderator must review the proposal, check factual accuracy and clearly label any approved **Captain-provided** information before publishing in a **separate** public data layer. No auto-publishing or changing raw registry records.

A free profile claim and factual corrections should **not** require paying. Future paid products may include enhanced media, analytics, booking widgets and support, but never influence ratings, organic sorting, review deletion, owner legitimacy, or official-agency evidence.

## Deployment safety gates

- **DO NOT RUN** `supabase/migrations/0003_pending_captain_fishery_proposals.sql` on the user's hosted project from this PR. It is a proposed script, not applied or integration-tested in a real database.
- RateMyGuidePNW Supabase was previously reported inactive; actual schema, default table grants, claim RLS, auth and data API settings remain unverified. Existing migrations are historical scaffolds and may not reflect deployed columns. Review any naming conflicts before migration.
- CI runs static contract and code-level tests; these **do not replace** Supabase `test db` / live-policy testing. Test with a local/staging database and real impersonated JWT sessions before launching, including owner, non-owner, anonymous, revoked claim, malformed JSON, forgery, excessive input and attempt to set `approved`.
- RLS inserts do not serve as production abuse protection. Add per-user throttling, moderator inbox, spam/rate-limit controls, retention rules, approval history and appeals before enabling real intake.
- An approved owner claim is **not** a verified license or USCG credential. Public UI must display every source tier independently.
- No personal IDs, home addresses, government credential photos, payment information or exact private trip details are collected in this editor.
- This feature does not expose the unapproved contributions to directory search or public guide pages.

## Local verification

```sh
npm run test:captain-fisheries
npm run typecheck
npm run build
```

## Technical reference

- `lib/captain-fisheries.ts`: typed field taxonomy, validation and canonical pending payload.
- `components/CaptainFisheryEditor.tsx`: responsive draft-first editor, guarded Supabase submission.
- `supabase/migrations/0003_pending_captain_fishery_proposals.sql`: proposed intake schema with invoker RLS on `guide_claims`, pending proposal table and SQL validation.
- `tests/captain-fisheries.test.mjs`: pure validation, pending-only mapper, UI guard and SQL access-contract checks.
