# Washington and cross-state guide identity safeguards

**Status:** Draft feature extending source-backed directory PR #36. This is a conservative response to Gemini's Nov 2026 15-record audit. It does **not** establish current legal licensing, independent identity verification, present employment, actual availability or jurisdictional compliance.

## Identity and outfitter are separate concepts

A person may be listed under the same outfitter as another person while remaining a separate guide profile, public review history, browser-local Saved Guides entry, and claim permission. A brand, similar domain, surname, shared boat or shared business address is **not sufficient** to unify captain identities.

### Curated public grouping, NOT people merging

- River Dog Outfitters: Andy Lockey (`wa-005`) and Neils Humphries (`wa-062`). Both names appear separately on [River Dog's operator page](https://riverdog-outfitters.com/).
- All Rivers & Saltwater Charters: Mark Coleman (`wa-050`) and Mitchell Coleman (`wa-059`), distinct imported WSGA/CAPS names sharing the business string. No employment or ownership verification.
- Fishers Catch Outfitters: Tony Fisher (`OG.0003043`) and Miles Fisher (`OG.0003998`), distinct Oregon registration rows with related business names. No license-status inference.

### Specific non-merge examples

- **Brand collision:** Washington Paul Lewis (`wa-141`, [fastactionfishingseattle.com](https://www.fastactionfishingseattle.com/)) vs Oregon Marvin Henkel (`OG.0000315`, [fastactionfishing.com](https://www.fastactionfishing.com/)). They independently advertise services under a similar brand but are not the same guide.
- **Surname collision:** Shea Fisher (`OG.0000050`), Lance Fisher (`OG.0000989`), Tony Fisher (`OG.0003043`), and Miles Fisher (`OG.0003998`) must remain separate people.
- **Roster captain:** Andy Lockey vs Neils Humphries and Mark Coleman vs Mitchell Coleman must not inherit each other's account claims, review histories, or trip evidence.
- **Nearby fishing businesses:** Mark Lytle (`OG.0000329`) and Joseph Hay (`OG.0000726`) are separate registration records. Similar Oregon Coast coverage is not a match.
- **Future research-only:** Gemini warns that Dan Ponciano (`wa-113`, columbiariverfishing.com) is distinct from Christian Witt (columbiariverfishingguide.com). **Christian Witt is not currently in this imported dataset.** Do not invent a profile ID or silently add a merge case before a real source record is reviewed.

`lib/guide-identity.ts` stores exact, testable public-ID pairs plus explicitly bounded shared-outfitter grouping. It is **not** a fuzzy identity engine. Any future reconciliation/import code must invoke `isExplicitlyDistinctCaptain` before *proposing* an identity merge; it must additionally require positive independent evidence and human review before merging any existing profiles. This blocklist is a floor, not complete protection.

### Cross-state possible matches still requiring human review

- WA Lance Fisher (`wa-117`) ↔ OR Lance Fisher (`OG.0000989`)
- WA Robert (RJ) Bennett (`wa-065`) ↔ OR Robert Bennett (`OG.0002805`)

Both are strong-looking name/business matches in imported data, but we **do not** automatically suppress or change public URLs, move reviews/claims, or mark these as verified. `PENDING_CROSS_STATE_REVIEW` provides an internal reviewer queue seed only.

### Earlier curated OR/WA linking

`lib/washington-reconciled.ts` already links several WA source records to Oregon registrations. Some notes explicitly call the match uncertain. Their original imported WA rows are omitted from the 158 separate Washington profile URLs. This PR does **not** change those historical decisions, as doing so could disrupt saved URLs and claim references. The Oregon profile now correctly describes that linkage as an **unverified imported-source matching hypothesis**, rather than verified person identity. A separate migration/review ticket should audit those legacy links before any true data consolidation.

## Imported Washington source categories

`lib/washington-provenance.ts` maps the nine source-code families currently found in `washington-raw.json`. Every one is a third-party/association/website **directory**, not a recent WDFW registry export. The source code (e.g. `WSGA`, `CAPS`, `NW Fishing`) remains visible on profile pages, alongside a clear category description.

An imported Oregon `OG.XXXXXXX` string is a historical record field, **not** a claim of active 2026 license validation. Public trust explainer and account claim process keep this distinction.

## Test and release gate

```sh
npm run test:identities
npm run check
```

No production deployment, GitHub merge, direct outreach, background auto-merge, Supabase mutation, or current license/USCG badge is authorized here. The grouping and identity guards are intentionally **read-only directory metadata**.
