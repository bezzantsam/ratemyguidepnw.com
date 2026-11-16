# Batch 13: second set of ten source reviews

Reviewed November 15, 2026. These ten records were outside the previous 60 checked IDs. Coverage is now **70 of 111 checked or attempted, with 41 unchecked**. Four records have candidate operator offerings; six remain held. Eight records have readable evidence and two remain retrieval-limited. The source catalog contains 14 pages, supporting six candidate fact groups and ten explicit relationships. Checked does not mean approved, current or published.

| Registration | Imported person | Result | Finding |
|---|---|---|---|
| OG.0001599 | Jason Mitzner | Supported, pending editorial review | [Koffler's supplier directory](https://kofflerboats.com/fishing-guides/fishing-guides-drift-boats/) associates Jason with Home Waters and its domain. [Operator trips](https://homewatersflyfishing.com/pages/guided-trips-test) support McKenzie/Middle Fork offerings and an explicit Middle Fork summer-steelhead/spey relationship. Current ownership is not independently verified. |
| OG.0001660 | Shane Tyner | Supported, pending editorial review | [Keys to the Outdoors](https://keystotheoutdoors.com/) names Shane and describes taking over from Shannon Keys. Source river sections support nine salmon/steelhead associations; old testimonials about Shannon are excluded. |
| OG.0001821 | Michael Jenkins | Name-variant hold | [Biography](https://upfrontoutfitters.com/about-us) uses Mike. A [fishing division](https://upfrontoutfitters.com/oregon-fishing) exists, so a hunting-focused homepage must not be treated as proof the business does not offer fishing. Individual association requires review. |
| OG.0001973 | Randy Bales | Supported, pending editorial review | [Named operator biography](https://www.luredbythebead.com/meet-randy.html) and [boat-trip offerings](https://www.luredbythebead.com/rates.html) support drift-boat/sled trips. A boat named Columbia is not a Columbia River location; tackle categories are not trip species. |
| OG.0002044 | Daniel Young | Identity/domain hold | Imported domain variants were unavailable. [Alternate business site](https://buoy10fish.com/) has relevant services, but domain and person association remain unresolved without relying on testimonial material. |
| OG.0002062 | Jacob Mikoleit | Supported, pending editorial review | [Named homepage](https://www.mikoleitsguideservice.com/) and [trip page](https://www.mikoleitsguideservice.com/rates-1) provide operator evidence. Generic bottomfish/crab labels remain generic; no named tributary or ocean-steelhead combination is inferred. |
| OG.0002276 | David Simpson | Retrieval limited | www variant unavailable; bare domain returned a tool-reported 404. Neither outcome establishes closure. |
| OG.0002413 | Steven Brinkley | Retrieval limited | Both registry-domain variants were unavailable; a Guidefitter profile returned 403. Search snippets are leads, not accepted offering evidence. |
| OG.0002470 | Joel Gibson | Identity hold | [Operator homepage](https://www.joelsfishing.com/) and [Umpqua page](https://www.joelsfishing.com/south-umpqua-river-fishing-guide/) are readable. Inspected primary pages do not independently establish the full person name; a contact-address string is not identity verification. Useful trip evidence is retained as held notes. |
| OG.0002606 | Timothy Cornelison | Historical-source hold | The [homepage](https://cornelisonfishing.com/) and [restoration disclosure](https://cornelisonfishing.com/archive-notes.html) identify a historical copy with non-submitting forms and retained source inconsistencies. Current operation and Timothy/TJ identity equivalence remain unverified. |

## Scope and reproducibility

`BATCH13_NEXT10B_SELECTION_20261115.json` preserves the original 111-ID manifest lineage from PR #99 and pins the prior ten-record review at `60afe401f035639ec4c2cec46143bbaffe80ee7f`. It hashes the prior review and selection files, combines their 60 checked IDs and selects the first ten sorted remaining IDs. Original names, businesses and website strings are unchanged. As in the earlier snapshot, an absent registry business is represented by an empty string; this does not invent a business name.

`BATCH13_NEXT10B_SOURCE_REVIEW_20261115.json` contains page locators, review dates, candidate facts, independent lists, explicitly sourced relationships, held observations and retrieval outcomes. Its 14 catalog entries are pages actually read, not a count of all attempted requests or search hits. The parser may return cached pages; raw bytes were not archived. Review date is not publication date or current availability. No reviews, ratings, contacts, family details, prices, credentials or current fishing regulations are copied into the candidate facts.

The validator now accepts explicit batch parameters while preserving its original defaults. The second-batch wrapper validates the original ten first, checks the prior checkpoint and enforces the 60-ID selection. Industry-directory evidence may support identity attribution; restored historical pages may explain a hold. Only operator-site evidence can supply candidate facts. Original proposals and public data are unchanged.

```bash
python3 scripts/batch13_next10b_review.py
python3 -m unittest discover -s tests -p 'test_batch13_next10*.py' -v
python3 scripts/batch13_next10_candidates.py --check
npm run test:mvp
```

Structural checks do not independently verify a business's claims. These findings are pending research. Do not feed this batch directly into the original next-ten converter: its default selection is pinned to the earlier 50-ID checkpoint. A later explicit integration must preserve the additional hold statuses and distinguish historical/directory identity sources from operator offering evidence. All publication and credential-verification flags remain false; application submissions remain disabled.
