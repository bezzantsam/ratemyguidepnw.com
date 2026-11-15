# Oregon guide research assignment ledger

This command tracks which imported Oregon guides have been **assigned** to a research agent, which batches have been **returned for schema review**, and which guides are on explicit manual hold. It never verifies a business, checks a website, merges an identity, publishes a profile, or changes the production database.

The complete ledger, Gemini research, claim JSON and hold files must live under ignored `research-drafts/`, never in a public PR. Every state transition writes a **new immutable** local JSON file with a revision number and parent digest. It refuses changed Oregon directory source fingerprints, repeated directory IDs, tampered historical ledger structures, and mismatched batch returns.

## Start by recording the prompts already issued

Earlier prompts may be recorded explicitly as `historical_prompt`. This proves only that the prompt was assigned, not that its candidate website was checked or that claims were validated. Example recording Batch 06:

```bash
python3 scripts/research_batch_tracker.py record \
  --batch-id 06 --assigned-on 2026-11-14 --after OG.0000417 \
  --ids OG.0000418,OG.0000419,OG.0000426,OG.0000427,OG.0000740,OG.0000741,OG.0000743,OG.0000748,OG.0000758,OG.0000761,OG.0000762,OG.0000781,OG.0000782,OG.0000785,OG.0000791 \
  --out research-drafts/tracker-01.json
```

On subsequent `record` commands, give the latest `--ledger research-drafts/tracker-01.json` and write to a **new** `--out` file. The raw registration order in `lib/oregon-guides.json` is authoritative; it is **not** globally sorted by registration number.

## Generate the next, non-overlapping Gemini assignment

```bash
python3 scripts/research_batch_tracker.py next \
  --ledger research-drafts/tracker-latest.json \
  --limit 15 --format markdown \
  --out research-drafts/gemini-next.md
```

This uses the existing `guide_research_batch.make_batch` and excludes every ID already tracked as assigned, including still-in-progress batches. By default it continues after the farthest imported-order cursor in your ledger. It prints an explicit unverified-candidate warning.

To reserve a future batch with a stronger recorded manifest digest, use the existing `guide_research_batch.py --format json --output research-drafts/next.json`, then:

```bash
python3 scripts/research_batch_tracker.py reserve \
  --ledger research-drafts/tracker-latest.json \
  --batch-id 07 --manifest research-drafts/next.json \
  --out research-drafts/tracker-with-07.json
```

A manifest must match the current source directory and unenriched, unassigned candidate selection, including its cursor. If you are repairing earlier skipped registrations, pass an explicit `--after` and the appropriate `--exclude-file` to the existing batch generator. A stale or duplicated manifest is rejected.

## Record a completed Gemini return

A returned batch is NOT approved. It is merely **accounted for and schema-checked**. Every assigned guide must appear exactly once either in a PR #82-valid `schema_version: 1` handoff or in the separate `schema_version: 1` manual hold file used by `enrichment_review_queue.load_holds`.

```bash
python3 scripts/research_batch_tracker.py return \
  --ledger research-drafts/tracker-with-07.json --batch-id 07 \
  --handoff research-drafts/oregon-07-pending-review.json \
  --holds research-drafts/oregon-07-holds.json \
  --out research-drafts/tracker-after-07-return.json
```

Hold files use `{"schema_version":1,"holds":[{"directory_id":"...","reason_code":"source_unreachable","reason":"Actual review explanation"}]}`. If all assigned guides are explicitly held, the handoff can be exactly `{"schema_version":1,"records":[]}` for **this tracker only**. The normal PR #82 validator still requires at least one record for an ordinary handoff.

An ID appearing in both the handoff and holds, or a missing assigned ID, causes a hard failure. The tool stores a handoff SHA-256 and a count, never an automatic approval.

## Review progress

```bash
python3 scripts/research_batch_tracker.py status \
  --ledger research-drafts/tracker-latest.json
```

The report distinguishes assigned guides, returns pending source review, security/identity holds, and unassigned website candidates. It does **not** count returned claims as verified, licensed, or published.

Run the synthetic tests with:

```bash
python3 -m unittest discover -s tests -p 'test_research_batch_tracker.py' -v
```
