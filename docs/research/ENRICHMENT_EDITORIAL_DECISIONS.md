# Claim-by-claim editorial decisions (offline only)

This workflow follows the Batch exporter (PR #83) and multi-batch review queue (PR #84).
It is a **local, nonpublishing editorial proposal generator**, never an identity-check
service, automated site verifier, credential checker, guide publisher, or moderator backend.

### 1. Prepare a review queue

Copy the Gemini handoff JSON files to ignored `research-drafts/` and generate a queue
using `scripts/enrichment_review_queue.py`. Keep the queue and its source batch JSON
files in the same ignored folder. Any source-batch digest mismatch, missing batch, or
a changed public enrichment baseline will cause this tool to refuse evaluation.

### 2. Generate an UNREVIEWED template

```bash
python3 scripts/enrichment_editorial_decisions.py template \
  --queue research-drafts/oregon-review-queue-01.json \
  --out research-drafts/oregon-review-decisions-01.json
```

Only claims from `pending_human_source_review` entries are eligible. Any guide
with an identity, source, or security hold, a duplicate submission, or an invalid
schema is **excluded**. A guide with no new claims is also excluded. Every claim
starts `unreviewed`; no AI research is promoted into an approval automatically.

Each proposed claim is bound to the input queue digest and to a `claim_sha256`
based on its guide ID, exact wording, and dated source URLs. Claim wording, cited
sources, guide identity, queue fingerprint, and baseline must not be edited.

### 3. Record human editorial decisions

An actual source reviewer may change ONLY these fields on a claim:
- `decision`: `approve_for_proposal`, `needs_more_evidence`, `reject` or `unreviewed`
- `reviewer`: a nonempty human reviewer name/identifier for any reviewed claim
- `reviewed_on`: the actual review date, not in the future
- `note`: a substantive explanation of at least 15 characters when reviewed
- `selected_source_id`: one source ID cited by this specific claim, **only** if
  `approve_for_proposal`
- `checks`: three explicit booleans
  `source_content`, `operator_identity`, and `publication_rights`; all three
  must be `true` only for `approve_for_proposal`, and all must remain `false`
  for other decisions

Selecting approval without checking the live source and verifying its relationship
to the correct registered guide is not authorized. This program records human
attestations; it does not independently prove they are accurate.

`unreviewed` claims must retain all original empty/default signoff fields.
`reject` and `needs_more_evidence` need real notes and a reviewer, but cannot
carry selected sources or approval check marks.

### 4. Evaluate without publishing

```bash
python3 scripts/enrichment_editorial_decisions.py evaluate \
  --queue research-drafts/oregon-review-queue-01.json \
  --decisions research-drafts/oregon-review-decisions-01.json \
  --out research-drafts/oregon-unpublished-proposals-01.json
```

The generated artifact is a **private, unpublished candidate-additions object**.
Its keys mirror the existing `lib/guide-enrichment.json` contract:
`searchAliases`, `advertisedWaters` (`name`, `sourceUrl`, `sourceType`,
`observedOn`), and `sourceLinks` (`label`, `url`, `sourceType`, `observedOn`).
This is not a public-file diff, not an approved guide directory entry, and not a
command to apply anything. A later separate reviewed change would still be
required for actual publication.

Both commands exclusively create new files under ignored `research-drafts/`
and reject symlink escapes. The tool never changes `lib/`, any Next.js page,
Supabase, or GitHub branch protections. No raw research, evidence receipts, or
reviewer names should be committed to this public repository.

### Safety tests

```bash
python3 -m unittest discover -s tests -p 'test_enrichment_editorial_decisions.py' -v
```

Tests cover no implicit approval, all human attestation requirements, source/date
binding, unchanged identity and claim evidence, stale input batches/baseline,
manual hold exclusion, private file-path enforcement, and unchanged public files.
