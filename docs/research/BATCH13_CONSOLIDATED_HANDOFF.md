# Batch 13 consolidated population handoff

This is an unpublished research and integration candidate. It does not approve identities, current operations, qualifications, booking links, or publication. No candidate belongs in the public approved-data file without a separate review decision.

Sources: directory checkpoint `60afe401f035639ec4c2cec46143bbaffe80ee7f` (#102), identity repair `4d108dff1202d4c45b75765aa32ce15ddbb13f3d` (#108; includes #107 review), completed research `5345d06473e0f8a508b5cc134b27399ca392cf68` (#105), and only the original manifest, supplemental 30 review and associated tests from `3d8c90dbc415f32355a187fb413503204446ea8f` (#99). PRs #102, #105, #107, #108, and #99 overlap this candidate; do not independently merge overlapping work without reconciliation. No backend repair from #106 is included.

## Additive follow-up and editorial workflow

The separate [ten-record follow-up](BATCH13_HOLD_FOLLOWUP10_20261115.md) at `8a9500f2c8cb9b85020a1cdd86dd8a784ea5461b` supplies two blocked Marc Bush species leads and further evidence for ten existing IDs. It replaces no snapshot and removes no hold. The [offline editorial workflow](../qa/editorial-review-workflow.md) presents the original and follow-up evidence separately and generates unapplied decision-based patches.

## Files and accounting

`BATCH13_CONSOLIDATED_POPULATION.json` contains the 111-entry index, pending attributes and separate waterways, explicit relationships, detailed holds, registry conflicts, unsupported fields, exclusions and a field-level decision ledger. The `source` on each entry is one attributable citation; identical source-specific facts are deduplicated, while different sources and relationships remain separate. `BATCH13_CONSOLIDATED_POPULATION.csv` is a 444-row, spreadsheet-safe view of candidate attributes and waters; JSON remains authoritative for holds, conflicts, identity evidence and field accounting. `scripts/batch13_consolidated.py --check` verifies both outputs against pinned inputs and existing converters.

| Batch | Accounted IDs | Pending candidate records | Held records |
| --- | ---: | ---: | ---: |
| Original | 20 | 16 | 4 |
| Supplemental | 30 | 13 | 17 |
| First additional | 10 | 4 | 6 |
| Second additional | 10 | 4 | 6 |
| Final | 41 | 15 | 26 |
| Total | 111 | 52 | 59 |

There are 332 source-specific attribute entries: 278 standalone (273 distinct guide/kind/value facts) and 54 explicitly sourced relationship entries. Standalone entries comprise 187 species, 24 methods, 50 trip types, six business names and 11 person names. There are 112 source-specific water entries (109 distinct guide/water pairs), including four tourism-sourced waters that retain their original scope and require a contract mapping decision. These are evidence entries, not additional guides. The 490 source field values/relationships have explicit ledger decisions: 279 attribute, 54 relationship and 113 water candidate occurrences, 27 held occurrences and 17 unsupported occurrences. Deduplication accounts for the difference between occurrences and emitted entries.

There are 21 unsupported-field or scope decisions: 12 locations, one accessibility claim, two tourism-listed methods, two tourism-listed species, and four tourism-listed waters retained separately with their original scope. No tourism attribution is relabeled as operator or industry evidence. There is one additional registry/manifest identity conflict: `OG.0003993` retains `Ferg's Guided Fishing ` in the registry and `Ferg's Guided Fishing` in the manifest; its record and facts are held pending exact identity review. The source review called it supported, so the extra hold is not a change to that snapshot. `OG.0003288` retains the single documented Tenacity trailing-space comparison exception, remains held, and preserves both strings. No general identity normalization is applied.

The original held guides, historical/indexed-only limitations, and the Grindstone Lakes exclusion remain in force. Relationships are emitted only where the source review explicitly states one; independent lists remain independent. The seven unreviewed cross-state identity associations have no approved links. Five Washington source records retain exact-key holds and proposed, unallocated IDs; all 158 existing allocated Washington URLs are unchanged.

## Verification and open work

- Identity regression and rendered-component checks pass for the reviewed repair. GitHub Actions run `43753894036` passed both isolated browser modes for #108, not for this later consolidated candidate.
- Research/converter tests: `python3 -m unittest discover -s tests -p 'test_batch13*.py'` (72 passed); supplemental manifest/review tests: `node --test tests/guide-batch13-next30*.test.mjs` (26 passed).
- `npm run test:mvp` (52 passed), `npm run test:intel` (17 passed), `npm run typecheck`, `npm run test:isolation` (5 passed), and all frozen converter and consolidated `--check` commands passed.
- `tests/consolidated-discovery.test.mjs` tests every real pending attribute against the application's actual loader, which rejects all of them. It replaces each candidate's values and source with explicitly synthetic evidence to exercise each attribute shape as approved; no real pending research is written into the approved-data file. The isolated browser fixture adds an approved synthetic industry-listed name to the existing synthetic species, method, trip, business and relationship cases. The ordinary browser check scans selected pending research markers in HTML and client assets.
- Local isolated browser modes for the integration tree are subject to the sandbox's loopback restriction; see the PR's checks for the result on an environment that can start the owned mock server. The earlier #108 CI success does not validate this new tree.

The per-record 59 holds, one exact-string conflict, 21 unsupported decisions, tourism scope mapping, source freshness, factual accuracy and any future public identity decisions still require editorial and independent review. Snapshot hashes and imported source strings are retained; review completion does not mean the 111 records are verified guides.
