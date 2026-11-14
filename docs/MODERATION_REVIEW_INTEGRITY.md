# Moderator review completeness and claim-risk hints

This branch extends the integrated RateMyGuidePNW review candidate (draft PR #46). It responds to the Captain Profile Moderation specification without claiming its proposed backend is already implemented.

## Problem addressed

Previously the moderator diff displayed only **a name** when a new vessel or trip was added. The reviewer could miss the actual boat capacity, heated/covered description, target fish, operating season, advertised waters, vessel assignment and booking style. This is particularly important when an unclaimed business submits a completely new captain profile.

## Reviewer improvements

- Added/removed vessel entries display all currently supported **v2 contract fields**: name, boat type, covered, heated, max anglers, fish care.
- Added/removed trip packages display all supported details: title, waterway, general launch area, species, months, assigned vessel **including its label**, booking mode and duration.
- Existing fields still use stable-ID comparisons; reordering boats, trips, months or species is not a change.
- Captain-supplied phrases that appear to assert USCG/state licensing, 100-ton/other tonnage, insurance, bonding or relevant credentials are flagged **for independent evidence review** in new/changed free-text fields. This is not a legal determination, rejection, verified badge or an automatic publishing action. Ordinary use of 'Master Angler' does not by itself trigger a credential flag.
- Capacity changes are medium reviewer attention, rather than being grouped with cosmetic amenity corrections. **All** review priority levels still require human approval.
- The synthetic developer-only moderator UI shows flagged fields and the reason separately. Production remains 404, and there is no approve/reject endpoint.

## Differences between Gemini's design and implemented system

The current captain editor really supports **1–4 vessels**, **1–8 seasonal packages**, **1–30 maximum anglers per vessel**, and the fields in `lib/captain-fisheries.ts`. Gemini's suggested 1–40 anglers, boat length, custom corridors, crew roster, onboard toilet, pricing, credential uploads, paid tiers, current license expiration and approved-owner automated confirmation are **not implemented in this PR**. Nor is its proposed `profile_change_proposals` table: the repository contains an **unapplied** draft `guide_fishery_proposals` SQL design.

Avoid copying hypothetical captains, made-up prices or unlabeled imported web details into live profiles. Review source recency and provenance before adding any editorial summary.

## Release blockers

- Supabase project was last seen inactive. Never assume the schema/grants in checked-in migrations match live deployment.
- These are pure-code and CI tests, not real staged JWT/RLS tests.
- A server-side authenticated moderator API with protected roles, rate limits, append-only audit history, approval and rollback, and a separate public approved-profile read layer must exist before any real publication.
- No SQL is applied by this branch; no source/identity data is merged, no production changes made.

Run `npm run test:moderation`, `npm run test:integration`, `npm run typecheck`, `npm run build`.
