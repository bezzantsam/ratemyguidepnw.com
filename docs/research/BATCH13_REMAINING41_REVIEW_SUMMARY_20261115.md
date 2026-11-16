# Batch 13: the final 41 guide records

All 41 previously unchecked records received a source check or retrieval attempt. Cumulative manifest coverage is **111/111 checked or attempted**, not 111 verified or published guides. The prior 70-record evidence is unchanged.

## Delivered population data

| Item | Count |
|---|---:|
| Source-supported candidate records | 15 |
| Held records | 26 |
| Source-specific standalone attributes | 83 |
| Explicitly sourced relationship entries | 34 |
| Separate water entries | 29 |
| Distinct guide/water pairs | 28 |
| Source references | 42 |
| Parsed pages / indexed-only pages | 39 / 3 |
| Records with readable or indexed evidence | 34 |
| Records with unsuccessful retrieval attempts only | 7 |

Candidate species, methods, trip types and water records retain source URL, locator, review date, evidence scope, identity context and limitations. The 26 held records have no candidate facts. Their observations and retrieval failures remain separate. Every publication and credential-verification flag remains false.

## Reproduction

```sh
python -m unittest discover -s tests -p 'test_batch13_remaining41.py' -v
python scripts/batch13_remaining41.py --output-dir outputs/batch13-remaining41
python scripts/batch13_remaining41.py --output-dir outputs/batch13-remaining41 --check
```

The command verifies the prior selection/review Git blob hashes, validates the preceding review, reconciles all 70 earlier IDs and the original 111-ID universe, and checks selected imported fields against the actual 1,027-row registry. It generates `CANDIDATES.json`, `WATERS.json`, `POPULATION.csv` and `REPORT.md` without writing to public application data. Different existing output files are not overwritten. The report includes all candidate details and all 26 holds. The dedicated workflow repeats validation and uploads the generated pending population bundle.

Local validation: **30 regression tests passed** using an explicit selection-derived registry fixture. This is not a local validation of all 1,027 registry rows; complete-registry and prior-file checks run in CI. The older validator/converter defaults are preserved, and their existing tests and deterministic artifact checks remain required. No local full-application build or browser run is claimed. CI status must be checked for the final commit rather than inferred from older green runs.

## Material findings and boundaries

- Vertical Jigs has an operator page for guided Columbia walleye trips, so the prior product-only description is incomplete. The individual name match remains Matt versus imported Matthew Fairbank and is held.
- Keep It Reel names Bryan rather than imported Shelley Myers. Chrome Quest indexed evidence names Matt rather than imported David Ellington. These are unresolved associations, not proof of legal identity or ownership changes.
- Similarly named Accessible Fishing and TNT domains identify different captain names. Neither is substituted for the imported business.
- Ryan Tripp's Sacramento striped-bass and Upper Rogue Chinook relationships remain separate. Sky High's broad Salmon label is not expanded to Chinook/Coho. Dirks' book topics are not guide specialties.
- Adam's John Day pool is not relabeled John Day River. Jack Creek's source domain does not overwrite the original misspelled registry URL; templated and unsupported species text is excluded.
- Rafting/kayaking destinations do not become fishing specialties. Third-party directory claims and indexed-only text do not populate candidate trip attributes.

See `BATCH13_REMAINING41_SOURCE_REVIEW_20261115.json` for the 42 source URLs, locators, all 41 original identities and record-specific outcomes. The selection is pinned in `BATCH13_REMAINING41_SELECTION_20261115.json`.

## Integration boundary

This continues the existing research PR on `codex/batch13-next10b-source-review`, based on `codex/evidence-discovery`. Preserve prior snapshots, other agents' backend and identity work, and the old PR #99 stack. Use the generated bundle as a review input, not as a replacement for `approved-guide-attributes.json`. Every candidate is pending and `publication_approved=false`.

Operator claims describe advertised business offerings, not proof each named person guides every trip. Retrieval failures do not establish closure. Review date is not source publication time, direct-server capture time, current availability or current legal authorization. Parsed/indexed material can be cached; source bytes are not archived. Structural tests do not establish source truth or real-world identity.

No public profile files, approved attributes, private contacts, prices, reviews, credentials, live services, merges or manual deployments were changed. Branch pushes may trigger existing automatic previews; those are separate from publication approval.
