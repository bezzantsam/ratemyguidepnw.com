# Batch 13: next ten source reviews

Reviewed November 15, 2026. This batch adds **ten previously unchecked records** to the 50 checked in PR #99: **60 of 111 checked or attempted, 51 remaining**. Checked includes retrieval-limited attempts; it does not mean verified or published.

Four records have attributable candidate business offerings; six remain held. Fourteen readable operator pages support seven candidate fact groups and eight explicitly stated water/species/method relationships. No public enrichment, approved attributes, identities, booking links, reviews, claims or database records were changed.

## Results

| Registration | Imported person | Result | Evidence and boundary |
|---|---|---|---|
| OG.0001077 | Steven Morris | Category/identity hold | [Wallowa biography](https://www.wallowamountainoutfitters.com/aboutwmo) names Steve; [pack trips](https://www.wallowamountainoutfitters.com/full-service-trips) include access to fishing. Angling instruction, species and Steven/Steve identity equivalence are not established. |
| OG.0001103 | Michael Williams | Retrieval limited | Both variants of the registry domain could not be inspected. No candidate trip attributes; failure does not establish closure. |
| OG.0001106 | James Szemenyei | Category/identity hold | [Wild Times](https://wildtimesguides.com/) names Jim Szemenyei and Phil Brown. General fishing wording is insufficient to turn hunting refuge descriptions into fishing waters. |
| OG.0001208 | Ian Premo | Retrieval limited | Both variants of the registry domain could not be inspected. No candidate trip attributes or invented business name. |
| OG.0001277 | Kelsey Helfrich | Supported, pending editorial review | [Named team biography](https://www.helfrichoutfitter.com/meet-the-team/), [McKenzie rainbow-trout fly fishing](https://www.helfrichoutfitter.com/drift-boat-fly-fishing/) and [Rogue steelhead fly fishing](https://www.helfrichoutfitter.com/helfrich-rogue-river-steelhead-fishing-and-lodging-trips/). These are operator offerings, not proof Kelsey guides every trip. |
| OG.0001298 | Steven Crisler | Name/domain hold | [Southern Oregon Sport Fishing](https://southernoregonsportfishing.com/) names Steve Crisler. Preserve the misspelled imported domain; do not infer Rogue River from a Gold Beach banner. |
| OG.0001340 | Thomas Treadway | Category/identity hold | [Guide resource page](https://www.oregonfishing.com/Oregon-Fishing-Guide-Resource) is unfinished within a tackle store. Product categories do not establish this person's guiding specialties. |
| OG.0001344 | Kevin Newell | Supported, pending editorial review | [Total Fisherman](https://www.totalfisherman.com/) names Kevin separately from other captains. Keep broad species/water lists independent; only Buoy 10 Chinook and coho associations are recorded explicitly. |
| OG.0001429 | Dustin Paul | Supported, pending editorial review | [Business identity](https://umpquarivers.com/contact-us-north-umpqua-booking-contact/), [winter steelhead](https://umpquarivers.com/fishing-on-the-legendary-north-umpqua-river/) and [summer trout](https://umpquarivers.com/summer-cutthroat-and-rainbow-trout-fishing/). Summer fly-rod evidence must not become a winter steelhead method. |
| OG.0001545 | Casey Kelly | Supported, pending editorial review | [Homepage](https://columbiariverfishingtrip.com/) has independent water/species lists; [biography](https://columbiariverfishingtrip.com/casey-kelly/) explicitly connects Columbia spring Chinook and trolling. |

## Provenance and limitations

`BATCH13_NEXT10_SELECTION_20261115.json` pins PR #99 at commit `3d8c90dbc415f32355a187fb413503204446ea8f`, hashes its three source files, lists all 111 manifest IDs and the prior 50 checked IDs, and selects the first ten sorted remaining IDs. The pinned Git objects, checksums and selected original fields were compared locally. The registry uses null for Ian Premo's absent business; the prior manifest uses an empty string. Neither representation establishes a business name.

`BATCH13_NEXT10_SOURCE_REVIEW_20261115.json` stores exact imported fields, review statuses, source URLs, page-section locators, candidate facts, held narrative observations and retrieval limits. Source content was read through a page parser and may be cached. The review date is not a publication date or direct-server capture timestamp; raw page bytes were not archived. Availability, legal identity, current licensing and individual expertise were not verified. No contact details, third-party reviews, ratings, prices or promotional performance claims were copied.

## Integration handoff

Keep this review separate from the earlier enrichment proposal generators. The new file includes explicit relationships and held narrative observations; its schema is not a drop-in input to those generators. A later mapper must understand these distinctions.

Only the four `source_supported_pending_editorial` records have candidate `facts`. All approvals remain false. Review each claim and identity before mapping to the approved-attribute schema. Preserve original registry URLs, including typos; an evidence URL is not automatically an approved replacement booking link. Do not convert `held_observations` into candidates or multiply independent water/species/method lists into invented trip combinations. Company offerings must retain their company scope.

This branch adds its own research files and checks on top of the evidence-discovery branch. It does not integrate the old PR #99 application stack or alter its previous 50 reviews.

## Reproduce the offline checks

```bash
python3 scripts/batch13_next10_review.py
python3 -m unittest discover -s tests -p 'test_batch13_next10_review.py' -v
npm run test:mvp
```

The validator checks snapshot integrity, exact registry identity (with the documented absent-business normalization), non-overlap, attributed sources, hold boundaries, approval flags, relationship membership within each fact group and honest counts. Tests include deliberately incorrect identities, leaked held facts, missing attribution, inflated totals and transfer of a summer method into a winter offering. These structural checks do not independently establish the truth, currency or identity semantics of a website's claims. CI validates the checked-in selection snapshot; the separate historical PR #99 Git objects are not required in a shallow checkout.
