# Reproducible Oregon guide research batches

This is an offline research coordination tool, not a scraper or a publishing tool. It selects
directory records that have a syntactically parseable candidate website and do not yet have
an entry in `lib/guide-enrichment.json`. A candidate website is **not** proof of operator
identity, site ownership, a valid license, or an advertised fishery.

## Assign a batch to Gemini

From the repository root, after the stacked PRs are available:

```bash
python3 scripts/guide_research_batch.py --limit 15 --output research-drafts/gemini-01.md
```

The Markdown output is a copy-ready research assignment with directory IDs, imported
names/businesses and candidate websites. Alternatively use `--format json` to obtain
a machine-readable manifest with source SHA-256 checksums and explicit
`website_verified: false` for every record. No source files are changed.

The first 15 Oregon candidate records have already been assigned for outside research,
ending with `OG.0000329` on the referenced directory snapshot. To generate the next batch:

```bash
python3 scripts/guide_research_batch.py --after OG.0000329 --limit 15 \
  --output research-drafts/gemini-02.md
```

The `--after` cursor refers to the imported directory order, **not** the shifting
unenriched subset, so it remains usable even after earlier guides are enriched.
For further batches, copy the reported `next_after` value. Compare output source hashes
when working across different repository revisions, since import ordering can change.

To skip specific IDs already being researched, create an ignored file
`research-drafts/in-progress.json` containing a JSON array of directory IDs and run:

```bash
python3 scripts/guide_research_batch.py --exclude-file research-drafts/in-progress.json \
  --limit 15 --format json --output research-drafts/next-batch.json
```

Unknown excluded IDs, unknown cursor IDs, duplicate directory registrations, malformed
exclusion lists and invalid limits fail rather than silently producing a misleading batch.
Output file paths are restricted to the ignored `research-drafts/` folder and its
non-symlink-escaping descendants. Stdout is available by omitting `--output`.

## Research handoff and review

Gemini's completed research is a **separate** document. It should include an evidence
table for all assigned IDs, including dead sites and inconclusive identity matches.
Only claims with independently inspected, dated sources should appear in a
`schema_version: 1`, `pending_review` claim payload. Do not fill unknowns with
plausible guesses or fabricate citations merely to satisfy a schema.

Validate the source-backed claims with the earlier offline tool:

```bash
python3 scripts/enrichment_handoff.py validate \
  --input research-drafts/incoming.json --output research-drafts/review.json
```

This checks formatting, known IDs and source references; it **does not**
verify actual website contents. Every record remains pending human review.
Boat, crew, contact details and credentials belong in a separate human-review report,
not the current narrow `aliases`/`waterways` schema. No profile is published
automatically. The guide's imported name and business are identity leads, not verified facts.

To run the batch selector's unit tests:

```bash
python3 -m unittest discover -s tests -p 'test_guide_research_batch.py' -v
```
