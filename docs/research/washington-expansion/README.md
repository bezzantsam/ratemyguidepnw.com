# Washington market expansion — review-only audit

Snapshot captured 2026-11-17 UTC. The candidate queue is evidence for manual review; it is not an import, license check, recommendation, live availability claim, or approved publication. No production data was modified and no paid search API was used. The target of 200 net-new candidates was **not established**. A bounded public-source pass produced 79 business-level candidate rows. Fifty-six have no match under the checks below, but none has been independently established as net-new against all live identities and aliases; the verified net-new count is unknown, not 56.

## Baseline and data grain

The executable baseline reads the repository at parent `60afe401f035639ec4c2cec46143bbaffe80ee7f`:

| Measure | Snapshot | Interpretation |
| --- | ---: | --- |
| Raw Washington source rows | 163 | Imported source records, not a count of unique people |
| Displayed Washington-only rows | 158 | Five raw rows are excluded from that display by the existing cross-state list |
| Oregon registry rows | 1,027 | Historical import, not verified current registrations |
| Washington raw rows with a website field | 0 | Raw schema has no website; separate reconciliation code has a few links |
| Displayed WA rows with operator-site evidence in `guide-enrichment.json` | 0 / 158 | Does not prove the operators lack websites; reconciliation and unreviewed research are separate |
| Displayed WA rows with approved species attributes | 0 / 158 | Approved-attributes input is empty in this snapshot |
| Displayed WA rows with enrichment waterbodies | 0 / 158 | Does not imply those guides have no waters |
| Displayed WA rows with source notes | 52 / 158 | Notes are not validated geography or complete service areas |

No exact normalized same-person-name groups were found among the 158. Four same-business groups involve 10 listed rows: Riverdog Outfitters, Fish Intimidators, All Rivers & Saltwater Charters and All Star Fishing Charters. These are **shared-business signals, not proven duplicate people**. Name changes, abbreviations, cross-state records and ambiguous aliases can hide duplicates. The source loader explicitly preserves distinct captains at shared businesses; see `lib/washington-reconciled.ts` and `tests/washington-stable-ids.test.mjs`. The old WSGA source includes an In Memory section, which must never become an active-member import.

A read-only aggregate query of connected `rate-my-guides` on 2026-11-17 found 1,185 guide rows, all marked published; all 1,185 had null jurisdiction and no website in that table. This project’s staging/production role has not been established. State counts cannot be inferred from it. Repository data drives the public directory while reviews use a separate backend path; the populations and identity keys are not interchangeable. The user-provided 163/1,027 figures are historical source-import context, not evidence of a current Washington database count.

Fifteen of the 79 candidate rows matched a published hosted `outfit_name` under exact lowercase alphanumeric comparison; the corresponding candidate IDs and aggregate counts are in `hosted-aggregate-20261117.json`. The read did not fetch claim data or write to the database. Those matches are business-level flags, not identity resolution; the published WA slugs are known to differ from stable source IDs. No full hosted phone, alias, geographic or fuzzy comparison was possible from this aggregate query. A missing match does not prove novelty.

## Candidate review results

| Measure | Count | Meaning |
| --- | ---: | --- |
| Business-level candidate rows | 79 | Includes known and possible prior matches; not unique individual guides |
| Possible existing/other-candidate match | 23 | Name, business, source-site domain, phone or hosted exact-outfit signal; review, not automatic duplicate merge |
| No match found in inspected snapshot | 56 | Provisional unmatched businesses; not independently verified net-new |
| Operator page directly observed | 17 | Operator-site claims observed, not current license or availability |
| Other directory-linked websites | 37 | Link not independently checked; may be stale, shared or wrong |
| Species mentioned | 15 | Source claims, not a verified trip |
| Named waterbody mentioned | 11 | Not inferred from a city or fishing region |
| Both species and a named waterbody | 9 | Co-occurrence alone does not establish every species-water relationship |
| Manual review required | 79 | All rows are held |
| Verified net-new businesses or guides | Unknown | No complete identity-resolution or current operational verification |

`candidates.csv` is the working source-claim inventory; `review-sample.csv` is the full current review export with snapshot match IDs. Operator page observations and collection timestamps apply to the cited source, not to continuing operations. Directory-listed phones are public business contact **claims** and can be stale; do not use for outreach without checking. City is source-listed geographic context, not necessarily a home port or service boundary. `port` is recorded only when a source supports it. Contact values, names, species, waters and sites must be checked independently before use. `Olympic Wild` is based on a search excerpt; its page returned no readable text and its water/species claims were removed. Examples of source conflicts include two different MS Magoo phone numbers across directory and Westport tourism pages, and a directory pointing Pacific Salmon Charters to a different domain than the Port of Ilwaco. Neither is automatically resolved.

## Source inventory and method

- [WSGA professional members](https://waguidesassociation.org/our-members/) names specific guides and businesses; it also has a clearly separate memorial section. The current imported data already draws from it. WSGA's general licensing statements are not independent current verification. A separate untracked WSGA review script existed in another worktree and was not modified.
- [CAPS members](https://capscharters.com/members/) supplies named captains, businesses and home marinas; several shared businesses have multiple captains. The import already contains many of these. An association's statements do not validate each current license.
- [LocalFishingGuides Washington](https://localfishingguides.com/Washington-fishing-guides) lists businesses repeatedly by water; the existing raw data includes many names. Repeated water rows are not new people. Source claims require identity and freshness review.
- [Angling Hubs Washington](https://anglinghubs.com/anglers/washington) advertises 47 records on its state page; it supplies a discovery lead, not independent proof of licenses, reviews or that a species is offered in every water. It was inspected, not harvested into this queue.
- [State Fishing Spots](https://statefishingspots.com/washington/guides-and-charters/) says its business list derives from Yellow Pages read October 31, 2026 and explicitly does not contain license status. It lists 54 businesses. Entries were manually transcribed as review claims; some may be shops, historical, Alaska-focused, or non-fishing businesses. No derived directory link is treated as an observed operator site.
- The [Port of Ilwaco business guide](https://www.portofilwaco.com/business-guide) and [Experience Westport charter list](https://www.experiencewestport.com/westport-charter-boats) supply local business and port evidence. Operator pages are separately cited in rows where inspected. A directory listing and operator page may not be independent identity evidence.
- [WDFW guide and charter requirements](https://wdfw.wa.gov/licenses/commercial/fishing-charter-guide-requirements) was available in search excerpts, but direct retrieval returned HTTP 403. No access controls were bypassed and no WDFW license roster was scraped. Agency publications describe fisheries or requirements, not proof that an individual offers or is licensed for a specific trip.

Discovery used the built-in web search and bounded page views, not Google result-page scraping. No automated site crawling was run; `robots.txt` could not be retrieved for several domains, so automated collection remains disabled until each source's access terms and robots policy are checked. Collection completion timestamps are UTC. Directory entries are public facts transcribed for review; confirm reuse rights and freshness before publication. URLs, not ratings, prices or review counts, are retained. No operator's personal name is invented to fill a business-only row.

## Search and geographic work matrix

The species below are **search targets**, not claims that an individual offers them or that fishing is open. Coverage gaps are qualitative: the sampled source set is incomplete and there is no defensible total number of operators by region.

| Area / waters | Priority searches | Remaining gap |
| --- | --- | --- |
| Lower and mid Columbia, Cowlitz, Kalama, Lewis, Klickitat | salmon, steelhead, sturgeon, walleye; Vancouver, Longview, Kalama | High: independent operator review, cross-state matches and current service waters |
| Olympic Peninsula, Hoh, Sol Duc, Bogachiel, Calawah | steelhead, salmon, trout; Forks | High: resolve existing guides, individual-business affiliations and seasonal closures |
| Puget Sound, Seattle, Edmonds, Everett, Bellingham | salmon, lingcod, halibut; port and captain | High: multi-captain fleets and aliases need person-level reconciliation |
| Westport, Ilwaco and coastal ports | salmon, halibut, rockfish, lingcod, albacore | Medium-high: business/fleet reconciliation and current operating evidence |
| Yakima River / Ellensburg / Cle Elum | rainbow and cutthroat trout, fly fishing | High: connect operator names to individual profiles and explicit fishery claims |
| Snake River / Clarkston | steelhead, salmon, sturgeon, walleye | High: Washington vs Idaho waters and shared operator identities |
| Eastern lakes, Lake Chelan, Banks, Moses, Potholes | kokanee, lake trout, walleye, bass | High: lake-specific business and species corroboration |

Further searches should use a provider's authorized API if available, within terms/rate limits and without paid usage unless separately approved. Track query, page, exact claim, timestamp and source type; do not turn listings, lake habitat, regional associations, boat names or sports-angler memberships into guide identities.

## Reproduce / integrate

```sh
python3 scripts/washington_expansion_audit.py --out /tmp/wa-review
python3 scripts/washington_expansion_audit.py --out /tmp/wa-search --query 'walleye banks'
python3 -m unittest discover -s tests -p 'test_washington_expansion_audit.py' -v
```

The offline audit uses the saved hosted aggregate only when its input SHA matches. A fresh hosted comparison requires an independently authorized, read-only rerun: group all `public.guides` by count, published status, null jurisdiction and empty `website_url`; for published outfit comparison, compare each candidate's lowercase ASCII alphanumeric business key (minimum six characters) to `regexp_replace(lower(coalesce(outfit_name,'')), '[^a-z0-9]', '', 'g')`. Return candidate IDs and aggregate match counts, never assume slug identity. Recompute after candidate changes. This is not a full deduplication against hosted records. The standalone review search matches terms in name, business, aliases, species, waters, city and port; it is not connected to the site.

Public directory search already indexes names, businesses, approved aliases, source zones, advertised water and approved species via `lib/directory-query.ts`. Its claim/review submissions are intentionally disabled in this branch pending safe identity mapping. Before integration: review each entity and source claim; resolve the unique person/business and any multiple-captain relationships; allocate a stable ID under existing tests; map only explicitly approved per-attribute provenance through `lib/guide-attributes.ts`; add verified geographic terms via an appropriate reviewed contract; and retain the disabled claim workflow and unverified license status until the separately required identity/security approvals. Business-only rows cannot satisfy the current person-profile contract without inventing a name. Do not feed this queue into production or deploy it merely by merging a research PR.

The branch's `vercel.json` disables automated deployment **only for this review branch**, because Vercel creates previews for Git pushes by default. It does not change settings for `main` or another branch; review this guard before any future integration. No project settings were changed.
