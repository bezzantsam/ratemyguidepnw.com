# Local editorial review and dry-run population patch

This tool uses the frozen consolidated candidate and the separate follow-up at `8a9500f2c8cb9b85020a1cdd86dd8a784ea5461b`. The ten follow-up records do not replace prior research or remove any of the 59 original holds. Marc Bush's two new species leads are separately reviewable and remain blocked by the original hold.

From the repository root, install the project dependencies, then generate and open the self-contained local page:

```sh
python3 scripts/editorial_review.py open
```

The page is written to ignored `outputs/editorial-review/review.html`. It makes no network requests; HTTPS evidence links open only when selected. Enter your own editor label, search or filter, and record a reason for each field-level proposed decision. Real items start undecided. Browser storage is local to that browser/profile; export a backup before clearing it. Import merges compatible decisions and refuses stale, duplicate, conflicting or malformed files. It does not silently replace current work. If generated HTML already exists with different contents, choose a fresh `--output` path or remove the old generated page after saving decisions.

The version 1 decision file exported by the page has this structure (the values below are placeholders, not approval):

```json
{
  "schema_version": 1,
  "baseline_sha256": "<product-baseline-hash>",
  "candidate_sha256": "<consolidated-input-hash>",
  "followup_sha256": "<follow-up-input-hash>",
  "model_sha256": "<review-model-hash>",
  "editor": "<editor-supplied label>",
  "decisions": [
    {"item_id": "<stable-content-id>", "guide_id": "<registration>", "action": "hold", "reason": "<review reason>", "evidence_id": "<source-content-id or empty for a hold>"}
  ]
}
```

Field actions are `approve`, `reject`, or `hold`; unsupported fields cannot be approved. Hold/conflict actions are `resolve`, `reject`, or `hold`; resolution requires an explicit existing, attributable, parsed, nonhistorical evidence reference and a reason. A source reference is evidence to review, not proof of identity. The tool cannot invent new evidence; add and validate a separate source follow-up before resolving a hold with no available evidence. Neither a hold resolution nor a record-level decision approves any field.

Generate a **review-only** before/after patch from an exported decision file:

```sh
python3 scripts/editorial_review.py patch --decisions /path/to/guide-editorial-decisions.json --output /tmp/guide-population-dry-run.json
```

The output contains the unchanged product baseline, proposed full after-state, per-item changes and decision history. It does not modify the approved-data file, enrichment file, holds, registry or database. The generator refuses stale hashes, unknown or changed items/sources, duplicate/conflicting decisions, missing reasons, unsupported scope, excluded waters and incomplete relationships. Each relationship component needs its own field approval or an already approved product fact. Existing approved entries are preserved and the proposed attributes are checked against the application's actual `approvedAttributes` implementation.

The three product-level guide holds in `lib/guide-evidence-holds.json` cannot be bypassed by an editorial decision. They need a separately reviewed product change before any corresponding proposed attributes can pass the product contract. Industry-directory waters are represented as `third_party_directory` in the existing water contract; tourism-scoped waters remain unsupported until that mapping is separately designed and reviewed. Evidence and the original hold are retained in decision history; a `resolve` proposal does not edit the hold file.

To rerun the offline checks:

```sh
python3 -m unittest discover -s tests -p 'test_editorial_review.py' -v
python3 -m unittest discover -s tests -p 'test_batch13_hold_followup10.py' -v
BROWSER_EXECUTABLE='/path/to/chromium' node --test tests/editorial-review-browser.test.mjs
```

No identity, fact, editorial decision or publication is approved by generating a page or patch.
