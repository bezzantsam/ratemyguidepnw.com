# Offline enrichment inventory and handoff validation

This tool counts repository data and validates claim-level proposals. It never scrapes sites, writes public profiles, verifies credentials, merges people, or contacts operators. Source inspection remains a human review step. Existing source scouting is a separate tool; this does not duplicate its fetching logic.

## Inventory

Run `python3 scripts/enrichment_handoff.py inventory --output research-drafts/coverage.json`.

The inventory includes imported record counts, parseable website candidates, remaining unenriched candidates, source-date coverage and hashes of the input files. Candidate URLs are syntax-checked only; they are not verified official websites. Source totals are not a count of scraped pages or unique people. The previous rough 576 website-like strings become 569 candidates under stricter URL parsing. The report exposes the exact candidate records so the next batch can be selected without inventing IDs.

## Proposed research format

```json
{
  "schema_version": 1,
  "records": [{
    "directory_id": "OG.0003790",
    "publication_status": "pending_review",
    "sources": [{
      "id": "operator",
      "url": "https://www.igotcrabs.net/bandit-guide-service",
      "source_type": "operator_site",
      "observed_on": "2026-11-14"
    }],
    "aliases": [{"value": "Bandit Guide Service", "source_ids": ["operator"]}],
    "waterways": []
  }]
}
```

This example is an existing alias, not a proposed new finding. Each source must have its actual observation date; do not copy the example date to uninspected sources. Supported source types are `operator_site` and `third_party_directory`. Trip reports do not qualify as evidence of advertised fisheries in this format. New entities, crew, vessels, contact changes and credentials require their own review and are intentionally rejected rather than silently discarded.

Run `python3 scripts/enrichment_handoff.py validate --input research-drafts/incoming.json --output research-drafts/review.json`.

Each record receives errors or a pending-human-source-review state, the existing enrichment and proposed additions. Claims already present are excluded from the additions. Invalid batches return a nonzero status. Both inventory and validation can print to stdout; file outputs are restricted to the ignored research-drafts directory, including symlink resolution, so the CLI cannot overwrite public data files. Never treat a valid schema as source verification.

## Source work in this change

Four priority profile sources were independently opened on 2026-11-14:

- Chris Nordling: https://www.catchsomefish.net/ supports a dated operator-source link. The detailed fisheries page was inaccessible, so no new waterways were added.
- Ryan Beck: https://fishingwithbeck.com/salmon-fishing/ supports the existing four named rivers; observation dates added.
- Shane Magnuson: https://www.uppercolumbiaguide.com/ supports the existing Columbia, Rogue and Clearwater entries; observation dates added.
- Don Gresham: https://dgcolumbiaadventures.com/ supports the existing Columbia, Willamette and Buoy 10 entries; observation dates added.

Rod Shulley's site timed out; no observation date or new claim was invented for that page. These checks improve existing records, not the count of unique enriched profiles. No credentials were checked and no deployment occurred.

Tests exercise bad IDs, duplicate records, unsupported credential fields, invalid/missing citations, future dates, malformed records, unchanged source files, and public-file overwrite prevention. The tests run with the existing source-scout check in CI.


## Gemini nested-source JSON compatibility (review-only)

The first Gemini research handoff returned `aliases: [{alias, source}]` and
`waterways: [{waterway, source}]`, which the strict `validate` command
**correctly rejects**. Do not paste that payload directly into public enrichment.

For a local raw Gemini JSON file in ignored `research-drafts/`, run:

```bash
python3 scripts/enrichment_handoff.py normalize-gemini \
  --input research-drafts/gemini-batch01-raw.json \
  --output research-drafts/gemini-batch01-pending.json \
  --holds research-drafts/gemini-batch01-holds.json
python3 scripts/enrichment_handoff.py validate \
  --input research-drafts/gemini-batch01-pending.json \
  --output research-drafts/gemini-batch01-review.json
```

The normalizer emits a strict PR #82 `schema_version: 1` claim payload with per-record
`sources` and `source_ids`. It deduplicates identical source references and sends
malformed, unrecognized, unsupported, future-dated or HTTP-only records to a
**separate holds report**. It **never** guesses an HTTPS equivalent or fabricates
a new observation date. If no valid records remain, its output has an empty records
list and `validate` will rightly refuse it. The report is a source-claim
format conversion, **not a verification of source content, guide identity,
license status or current operation**. Nothing is published or deployed.

