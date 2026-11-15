# Batch 13 sibling-PR reconciliation audit (2026-11-15)

**Status: research-only, no editorial publication approval.** Source: the complete machine-readable Batch 13 research JSON files from draft PR [#96](https://github.com/bezzantsam/ratemyguidepnw.com/pull/96) and draft PR [#97](https://github.com/bezzantsam/ratemyguidepnw.com/pull/97), both based on [#95](https://github.com/bezzantsam/ratemyguidepnw.com/pull/95). This document does **not** verify any external business site, credential, species, or fishery claim.

## Quantified overlap

- PR #96 research records: **100** distinct Oregon registration IDs.
- PR #97 research records: **100** distinct Oregon registration IDs.
- Registration IDs in both: **89**.
- IDs unique to PR #96: **11**.
- IDs unique to PR #97: **11**.
- Distinct IDs in their combined research sets: **111**, **not 200**.
- The 89 overlapping IDs have no differing imported-name strings after case/whitespace normalization. This does not establish operator identity or present-day license status.
- Among each PR's 100 new records, PR #96 supplies an additional public-evidence URL for **8**, and PR #97 supplies a public-source URL for **12**. **None of those new-record evidence IDs overlaps across the two source-bearing subsets.** These URLs are *research leads*, not independently rechecked sources.
- PR #96 additionally researches **26** source profiles including **18 previously held** records; do not confuse those with 26 new unique Batch 13 identities. PR #97 reports **37** waterway claims in its own draft.

## Eleven IDs only in PR #96

| Registration ID | Imported name |
|---|---|
| OG.0001340 | Thomas Treadway |
| OG.0000519 | Charles Ireland |
| OG.0002074 | John Klar |
| OG.0000707 | Silas Stardance |
| OG.0000854 | John Bowles |
| OG.0001298 | Steven Crisler |
| OG.0001429 | Dustin Paul |
| OG.0002727 | Don Myers |
| OG.0000665 | Timothy Pickett |
| OG.0000691 | Mark Lottis |
| OG.0000729 | Robert Grubb |

## Eleven IDs only in PR #97

| Registration ID | Imported name |
|---|---|
| OG.0000415 | Timothy Barnett |
| OG.0000741 | Robert Rees |
| OG.0001116 | Neal Burrell |
| OG.0002329 | John Plughoff |
| OG.0004090 | David Ellington |
| OG.0003361 | Matthew Fairbank |
| OG.0002938 | Greg Morse |
| OG.0003842 | Robin Pace |
| OG.0001077 | Steven Morris |
| OG.0001344 | Kevin Newell |
| OG.0000419 | John Elder |

## Editorial and engineering decisions

1. **Do not merge #96 and #97 blindly.** They are sibling branches, share 89 of 100 selected IDs, and both edit `lib/guide-enrichment.json`, tests, and CI. Treat the 111 distinct research identities as the deduplicated candidate universe, not as 200 new guides.
2. **Preserve exact registration IDs** as identity keys. Compare each guide's imported business name and any source-supported operator identity before attaching a source. Never infer that a registry website is currently live or operator-owned.
3. **Keep statuses separate:** historical registry website, researched external source, and independently approved public claim. A website string alone must not count as verified expertise, current registration, or a booking link.
4. **Stage source-backed attributes individually.** For each proposed species, method, waterway, alias, or booking URL, preserve source URL, observation date, exact identity match, and claim scope. Source-stated fishing specialties are not automatically captain-verified.
5. **Choose a single integration branch** based on #95. Reconcile the 11+11 unique IDs and the source-backed evidence from both siblings in a deliberate, testable patch. Avoid replacing the entire enrichment JSON with either sibling's file.
6. **Block publication until QA:** run unique-registration-ID checks, no accidental loss of existing enrichment, source/provenance checks, deterministic search-filter tests, and manual editorial review of externally sourced claims. Do not enable review/claim writes or touch live Supabase.

## Limitations

This is a deterministic cross-branch **data-overlap audit**, not an external-source validation. No business website was independently fetched here; no tests, TypeScript checks, builds, or Supabase queries were executed. Both sibling PRs remain separate and unmerged. This file records reconciliation requirements without changing application data.
