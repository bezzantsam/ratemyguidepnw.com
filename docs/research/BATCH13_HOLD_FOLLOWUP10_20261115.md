# Ten held guide records: additive source recheck

Reviewed November 15, 2026. This adds evidence to the completed Batch 13 research; it does not replace that research, remove a hold, or publish a profile.

## Result

Ten existing held records were rechecked. Seventeen source observations cover sixteen distinct URLs: thirteen parsed-page observations and four indexed-page observations. Eight records have parsed evidence in this pass; Brian Hansen has indexed evidence only, and Dale Strand has unsuccessful retrieval/search attempts only.

**One record has recovered operator evidence:** Marc Bush / Twisted Waters. Its operator page supports two additional pending candidate species facts, Salmon and Steelhead. These two facts are still explicitly blocked by the original source-access hold until an editor reviews the new evidence. No holds were removed and no facts were approved.

The 111-record manifest remains 111 records, not 121. This pass does not establish current licensing, ownership, legal identity or availability. Some evidence repeats earlier observations; these are not seventeen new websites.

## Record-level handoff

| Registration | Imported person | New result or remaining limit | Required decision/evidence |
| --- | --- | --- | --- |
| OG.0002727 | Don Myers | Tourism still links Performance Outdoors; operator requests remained unavailable. | Readable operator-controlled offering or operator confirmation. |
| OG.0002817 | Quint McDonald | The guide association links directly to a readable FishingBooker listing naming Quint. | Confirm operator control or obtain primary evidence; do not silently replace capnquint.com. |
| OG.0003060 | Marc Bush | WSGA links the exact operator domain, which yielded readable salmon/steelhead guiding text. | Explicit editorial reconsideration of the access hold; no cross-state identity approval is implied. |
| OG.0003609 | Trever Adams | Costa Rica charter sites name Trever Adams, but neither inspected page connects to Meat Without Feet or this Oregon registration. | Prove the business/registration link before transferring any foreign trip information. The people are not asserted to be different. |
| OG.0003633 | Dale Strand | Registered site unavailable; bounded searches provided no usable operator evidence. | Current professional source connecting the imported name and business. |
| OG.0003701 | Brian Hansen | Search-index homepage text names Brian; a direct readable page was not obtained. | Inspect primary page; do not promote indexed text into a direct capture. |
| OG.0003817 | Shannon Powell | Parsed Two Oceans trip cards conflict with an indexed Coming Soon representation. West Coast Adventures identity lead does not establish this association. | Dated operator identity and offering evidence; no opening or closure inference. |
| OG.0003836 | Kirk Jenson | Marketplace listings support a name/business lead; operator domain remains unavailable. | Primary offering evidence or explicit review of operator control. Platform badges are not our verification. |
| OG.0003837 | Jeffrey Johnson | Tourism names Jeff Johnson; direct operator/social access was unavailable. | Explicit Jeff/Jeffrey linkage; no automatic alias or public URL replacement. |
| OG.0003960 | Zohrab Kirakossian | Operator About names Zory; marketplace names Zory Kirakossian. | Explicit Zory/Zohrab linkage before attaching the business offerings to this person. |

## Two facts available for editorial reconsideration

The [Twisted Waters operator page](https://twistedwaters-gs.com/) introduces Marc and advertises salmon and steelhead guiding. The [WSGA member entry](https://waguidesassociation.org/our-members/) links Marc Bush, Twisted Waters and that exact domain.

The two JSON candidate facts are business-scoped `species=Salmon` and `species=Steelhead`. Both remain `editorial_status=pending`, `publication_approved=false`, and `blocked_by_baseline_hold=true`.

Do not import Columbia River or Walleye from the [event organizer's seminar entry](https://www.cosportsmensshow.com/show-features/seminar-speakers): a seminar subject is not a guided-trip offering. Do not interpret biographical references to Puget Sound or New York as current trip locations. No named waters, methods, trip combinations or credential claims are added.

## New identity leads are not automatic approvals

The [McKenzie guide association](https://mckenzieguides.com/guides-and-outfitters/) points to [Quint's marketplace listing](https://fishingbooker.com/charters/view/28955). That is an inspectable cross-reference, not a claim that a marketplace page satisfies the existing operator-source rule.

The [Be Wild About page](https://www.bewildfishing.com/about) names Zory; the [marketplace identity field](https://fishingbooker.com/charters/view/46044) gives Zory Kirakossian. The registry name remains Zohrab Kirakossian. Neither nickname equivalence nor ownership was established here.

[Aluminati](https://aluminatifishing.com/) and [Hermanos Del Mar](https://hdmcharters.com/) name Trever Adams in Costa Rica. Their own cross-link establishes an association between those sites, not between those sites and the Oregon registration. Their tropical species and locations stay outside this record's candidate facts.

## Integration contract

Baseline commit: `5345d06473e0f8a508b5cc134b27399ca392cf68`.

Baseline file: `docs/research/BATCH13_REMAINING41_SOURCE_REVIEW_20261115.json`.

Baseline SHA-256: `78ffa2ea837d5481bcb002080107ec7a153ef03ccb6fb3e6145628b4c026c3ec`.

Baseline Git blob: `746b89885f3c5a2750c3d18d09cf9916e173be54`.

New evidence file: `docs/research/BATCH13_HOLD_FOLLOWUP10_20261115.json`.

This addendum is NOT a drop-in population input. The existing 146-row final-batch population bundle and original hold records remain unchanged. A later, explicit decision must reference this addendum, preserve the original hold history and separately authorize any field publication. Merely merging the research cannot satisfy that decision.

## Validation

Run from the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_batch13_hold_followup10.py' -v
```

Twenty offline tests passed locally against the actual pinned 41-record baseline and this addendum. The tests check exact identities, baseline bytes, selected IDs, provenance classes, approval flags, source pointers, count reconciliation, broad species labels, held alias/namesake evidence, and refusal of seminar-trip or other unsupported fields. They do not verify source truth or authenticate the operator. The local workspace contains the research subset, not the full application; no local whole-app or hosted-service test is claimed.

The research CI workflow runs these tests in addition to the existing final-batch checks. Check the run for the actual new commit before calling CI passed.

## Retrieval limits

Sources were inspected through parsed or indexed web responses; raw source bytes were not archived. `reviewed_on` is a review date, not a source publication time. Indexed and parsed representations may be cached. A tool timeout/cache miss/unavailable result is not proof of business closure. The source catalog keeps the Two Oceans parsed/indexed observations separate even though they share a URL. No personal contacts, customer reviews, ratings, prices or platform verification badges were copied into the addendum.
