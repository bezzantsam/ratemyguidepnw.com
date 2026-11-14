# Captain-provided fleet and seasonal fishery intake (draft feature)

**Status:** Review-only branch following draft PR #38. No live database migration or public publication. Core factual fields are intended to be free; payments and review/ranking systems are separate.

## What the captain can contribute

- **1–4 different vessels**, each with human-readable boat label, class, optional capacity (1–30), covered/heated flags, and fish-care services. The same operation may have an ocean charter, a river sled, and a drift boat.
- **1–8 named seasonal trip packages**, each with a waterway, general launch region (not an address), 1–8 target species, 1–12 operating months, a specific **vessel reference**, that trip's booking style (seats, private boat or inquiry), and an optional duration.
- Trip windows are typical **self-reported availability**, not actual fishery openings, legal compliance, or current inventory.
- Captains may add separate packages to the same waterway if they have different trip names and offerings; keyword stuffing and duplicate name+waterway are rejected.
- No self-entered licenses, criminal/background information, payment state, verified badges, review scores, USCG certification, or proof documents.

## Why the vessel relationship matters

Suppose a guide offers a 28-foot heated sled at Buoy 10 and a 17-foot open drift boat on a North Coast winter steelhead river. A **global** heated/capacity toggle would mislead anglers about the drift trip. This implementation binds each fishery to an explicit boat ID; the UI blocks removing a boat while a trip still references it.

The initial PR #38 submitted a single global boat + booking mode. This child branch replaces that **unapplied** proposal with a single fleet+packages payload so the UI and backend can validate referential integrity together.

## Captain ownership and publication workflow

1. The visitor finds the imported directory listing and opens `/claim/[id]`.
2. The existing profile ownership request requires authenticated identity review. A public source registration number is not proof that the account is the captain.
3. A prospective captain can draft boat/trip information in browser-tab session storage, including incomplete drafts. No cloud save or live sync is claimed. `v2` session key deliberately separates the new fleet schema from incompatible `v1` drafts.
4. An independently **approved claimant** may submit only a **pending** proposal after the independently reviewed SQL intake is applied and the real project is online. The app returns errors when that is unavailable.
5. Database column-level INSERT grants permit only guide ID, authenticated submitter ID, vessels and offerings. Review status defaults to **pending**, and the browser has **no INSERT permission** for moderation state or audit timestamps. The **proposed, unapplied** `supabase/migrations/0003_pending_captain_fishery_proposals.sql` allows authenticated owner-scoped SELECT and INSERT only. Each proposed vessel/trip is server-validated by an allowlist, length bounds, enums, unique IDs, foreign-reference checks, nonzero months/species, and a valid 1–30 capacity.
6. A *separate* future administrator workflow must manually approve fields and deliberately publish a clearly labeled **Captain-provided · Self-reported** view. A proposal changing state to `approved` does not itself show anything publicly. Directory search never indexes proposals.

## Release gate / operational risks

- **Do not apply the SQL file** to the hosted RateMyGuidePNW Supabase project yet. The project was previously inactive; actual deployed schema, ownership policies, grants and moderator access were not inspected. The file is a proposed schema, not an applied migration.
- Reconcile this with existing deployed tables and run positive/negative row-level tests in a separate local/staging Postgres environment: anonymous, unapproved claimant, another captain's guide, forged `submitted_by`, attempted `review_state='approved'`, malformed JSON, unknown fields, missing boat reference, forged boat capacity, deleted owner claim, duplicate proposals, SQL role privileges.
- The code/CI tests are *contract and UI tests*. They do not prove the database enforcement, security, a deployed working form or a full moderation workflow.
- A reviewed app must add rate limits, spam controls, human moderation inbox, operational audit events, and safe corrections/appeals before accepting real user submissions.
- Captain-supplied fields must never supersede historical state-registration provenance, constitute license/USCG verification, affect search rank, or create paid ability to remove negative reviews.

## Local checks

```sh
npm run test:captain-fisheries
npm run typecheck
npm run build
```

## Implementation references

- `lib/captain-fisheries.ts`: v2 typed fleet+package model, strict allowlist and draft restore guards.
- `components/CaptainFisheryEditor.tsx`: multiple boats / per-fishery assignment / tab draft / approved-owner query.
- `supabase/migrations/0003_pending_captain_fishery_proposals.sql`: **unapplied** v2 private pending-only proposal and RLS template.
- `tests/captain-fisheries.test.mjs`: typed record and schema guard tests (not live database role tests).
