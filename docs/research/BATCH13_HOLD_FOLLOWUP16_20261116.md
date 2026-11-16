# Remaining sixteen held guide records: additive evidence recheck

Reviewed November 16, 2026. This adds evidence to the existing research; it does not clear a hold, approve an identity or publish a profile.

## Result

All sixteen final-41 holds not covered by the earlier ten-record follow-up were rechecked. Together the two follow-ups cover all 26 held records in that selection. The full Batch 13 manifest remains 111 records, not 127. This is not resolution of the 59 holds reported across the consolidated manifest.

Three previously unreadable operator sources now provide parsed offering evidence: Tone Trout, Reel Therapy and Big River Outfitters. They supply **21 pending species/method/trip-type entries, six separate waterway entries and four explicit relationships**. These 31 entries remain blocked by their original holds and are not necessarily net-new product facts.

The catalog contains **24 source observations across 23 distinct URLs**: 19 parsed observations and five indexed-only observations. Thirteen records have parsed evidence, two have indexed-only evidence, and one has unsuccessful attempts only. A single Winding Waters URL has two conflicting representations, which are preserved separately.

## Recovered offerings

- **OG.0003191 / Anthonie Stewart / Tonetrout Guiding LLC:** the [www operator page](https://www.tonetrout.com/) is now readable. It supplies business-level fly-fishing species, half/full-day trips, named rivers and one explicit Rogue River/steelhead relationship. The page names Tonie; it does not establish that this is the imported Anthonie Stewart. No automatic nickname decision is made.
- **OG.0003468 / Scott Kenney / Reel Therapy SportFishing LLC:** the [bare operator domain](https://reeltherapyllc.com/) is readable and advertises Tuna. The inspected page does not identify Scott Kenney. Tuna stays broad; it is not expanded to albacore. A season heading is not live availability.
- **OG.0003540 / Christopher Calcagno / Big River Outfitters LLC Guide Service:** the [home](https://bigriveroutfittersnw.com/) and [About](https://bigriveroutfittersnw.com/pages/about-us) pages are readable. Business-scoped species, methods, trip types and separate waters are recorded. Columbia salmon/crab relationships are explicit; independent lists are not multiplied into invented trips. The site names Chris, not an approved Chris/Christopher association. Credential self-claims are excluded.

## Record-level handoff

| Registration | Imported person | Evidence outcome | Decision or evidence still required |
| --- | --- | --- | --- |
| OG.0002938 | Greg Morse | Third-party profile links the imported business/person and describes a taxi business. Operator access remains unavailable. | Operator-controlled fishing-offering evidence. A directory category is not proof no fishing service exists. |
| OG.0003154 | Shelley Myers | Operator representation names Bryan Myers. | Establish Shelley's role before attaching the business offerings personally. |
| OG.0003191 | Anthonie Stewart | Tone Trout operator source recovered; Tonie name remains unresolved. | Explicit name/business and individual-scope review. |
| OG.0003288 | John Kaiser | Operator still names John Kaiser Jr. | Explicit suffix/individual decision; preserve existing registry comparison exception. |
| OG.0003361 | Matthew Fairbank | Matt Fairbank and actual guided-trip product reconfirmed. | Explicit name-variant review; tackle products do not establish trip technique. |
| OG.0003468 | Scott Kenney | Readable Oregon operator page advertises Tuna, without naming captain. | Establish Scott's role; retain original registry URL and broad species label. |
| OG.0003538 | Brady Johnson | Fishing appears in policy/shuttle text, while inspected products emphasize paddling/nature tours. | Actual guided-fishing product evidence; transport is not guiding expertise. |
| OG.0003540 | Christopher Calcagno | Readable Big River operator pages name Chris and describe offerings. | Explicit name-variant and business-scope review. |
| OG.0003606 | James Sens | Operator and association still name Jim Sens. | Explicit Jim/James linkage, not inferred equivalence. |
| OG.0003634 | John Vogl | Alternate accessible-fishing operator page names Captain Scott. | Establish a link to the imported person and registered domain before transferring claims. |
| OG.0003691 | Steven Laing | Association supplies a Steve Laing Facebook lead; operator access unsuccessful. | Readable primary offering evidence and explicit name linkage. |
| OG.0003716 | Gerald Goulet | Alternate Shortbus site has indexed trips and JT Goulet biography; direct retrieval returned 502. | Primary page access and JT/Gerald linkage. Indexed offerings remain outside candidates. |
| OG.0003834 | Michael Bode | Registered URL variants/searches yielded no usable matching evidence. | Readable professional source linking person and business. No closure inference. |
| OG.0003842 | Robin Pace | Rafting-associated fishing plus an unavailable older dedicated trip and conflicting indexed text. | Current dedicated-trip scope; do not transfer other guides' expertise to Robin. |
| OG.0003868 | Tyler Blevin | Alternate .net operator page explicitly names Tyler Vaughn. | Establish any actual association before transferring claims; names alone do not prove people are different. |
| OG.0004090 | David Ellington | Indexed operator offerings; marketplace names Matt. Direct operator response had no readable text. | Primary identity evidence; no Matt-to-David transfer. |

Source locators, exact URLs, retrieval outcomes and record-specific searches are in the companion JSON. No private contacts, reviews, ratings, prices or sensitive biography were imported.

## Important boundaries

The [TNT .net site](https://www.tntsportfishing.net/) now supplies Tyler Vaughn's full name. This strengthens the reason not to merge it automatically with Tyler Blevin; it is not proof of distinct legal identities.

The [Winding Waters fishing page](https://www.windingwatersrafting.com/fish-five-plus) had a parsed representation describing a five-day trip with no available trips, and indexed text describing a shift toward rafting. Neither is silently treated as an authoritative current booking state. Fishing between rapids on another page is not the same product as a dedicated guided-fishing trip.

The [Shortbus guided-trips](https://shortbusflashers.com/guided-trips/) and [JT biography](https://shortbusflashers.com/about-jt-goulet/) observations are indexed-only because direct requests failed. Their trip details do not feed candidate facts. The registered domain is not replaced.

## Integration contract

This is an additive evidence package, not a drop-in population input. The previous population bundle, approved attributes and baseline records remain unchanged.

Baseline commit: `5345d06473e0f8a508b5cc134b27399ca392cf68`.

Baseline file: `docs/research/BATCH13_REMAINING41_SOURCE_REVIEW_20261115.json`.

Baseline SHA-256: `78ffa2ea837d5481bcb002080107ec7a153ef03ccb6fb3e6145628b4c026c3ec`.

Prior follow-up commit: `8a9500f2c8cb9b85020a1cdd86dd8a784ea5461b`.

Prior follow-up file: `docs/research/BATCH13_HOLD_FOLLOWUP10_20261115.json`.

Prior follow-up SHA-256: `d29d9258ff1a91217a8654c437fe90d812c33216665a48156baa4f0544f7beab`.

The new candidates are `editorial_status=pending`, `publication_approved=false`, and `blocked_by_baseline_hold=true`. Any later release must reference the new evidence and an explicit decision that addresses the original hold. Recovering source access alone does not resolve individual identity. Business offerings must not become personal expertise.

## Validation

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_batch13_hold_followup16.py' -v
```

Twenty-four offline tests passed locally against the exact pinned baseline and earlier follow-up. They validate identity preservation, disjoint coverage, count reconciliation, source classes and pointers, unchanged approvals, allowed candidate facts, distinct waterways and relationships, and refusal of alias, indexed-source, category and unsupported-species promotion.

These tests protect the evidence contract, not source truth, credentials, legal identity or current availability. Local testing used the research subset; no local full-app or hosted-service execution is claimed. The focused research workflow includes this test file. CI completion must be checked for the final commit separately.

## Retrieval limits

Sources were inspected through parsed or indexed web responses; raw source bytes were not archived. Parsed and indexed representations can be cached. Review date is not publication or direct-server capture time. Failed requests and absent readable text describe the research tool's result, not business closure. No original research, registry, application, authorization or live database data were changed by this recheck.
