# Safe extraction of Gemini research conversations

Gemini exports may contain multiple research batches, outdated revisions, example
JSON, long narrative reports, and copies of previous prompts. Never use
the first JSON object that happens to parse. This is an **offline, local-only
extraction utility** stacked on PR #86's assignment tracker and PR #82's
source-backed handoff validator.

It never verifies a website's content, proves a captain's identity, claims
that credentials are active, alters the imported directory, publishes any
guide, or makes an API/database call.

## 1. Record the exact assigned IDs in imported Oregon order

Under the **ignored** local research-drafts folder, create an assignment
record with exactly three keys:

~~~json
{
  "schema_version": 1,
  "batch_id": "oregon-05",
  "directory_ids": [
    "OG.0000377",
    "OG.0000381",
    "OG.0000382"
  ]
}
~~~

The three IDs shown here are deliberately an **incomplete illustration**,
NOT a complete Oregon Batch 05 assignment. Use all 15 IDs from your approved
Gemini assignment manifest. The importer rejects unknown, duplicated or
out-of-order registration IDs.

## 2. Record every research hold

Create research-drafts/batch05-holds.json using the existing review-hold schema:

~~~json
{
  "schema_version": 1,
  "holds": [
    {
      "directory_id": "OG.0000409",
      "reason_code": "not_fishing",
      "reason": "Reported to advertise youth training and rafting, not verified guided fishing; review manually."
    }
  ]
}
~~~

An omitted or unsupported guide is **not silently skipped**. Each assigned
registration must appear in exactly one of the claims or explicit holds.

## 3. Extract one exact complete handoff from the Gemini transcript

Save Gemini's unmodified text export locally under research-drafts.
Do not commit it.

~~~bash
python3 scripts/gemini_transcript_intake.py \
  --transcript research-drafts/gemini-export.txt \
  --assignment research-drafts/batch05-assignment.json \
  --holds research-drafts/batch05-holds.json \
  --out research-drafts/batch05-extracted.json \
  --receipt research-drafts/batch05-extraction-receipt.json
~~~

The importer searches standalone top-level JSON objects, then selects only
the candidate whose claim IDs **union** the held IDs equal the entire assigned
set, with no overlap or duplicates. It invokes the existing repository
validator for the chosen records. If no object or multiple objects match,
it refuses extraction and requires manual resolution.

The receipt includes the original transcript SHA-256, the precise source
line span and its SHA-256, all assignment and hold fingerprints, the emitted
JSON SHA-256, and structural claim counts. The output is marked
pending_review only. Passing format checks never establishes that Gemini's
source URLs were successfully inspected or its claims verified.

The input, output and receipt must remain in the gitignored research-drafts
tree. Destination paths are symlink-resolved and files are created with
exclusive creation, never overwritten. Neither original conversations nor
extracted research should be committed to this public repository.

After extraction, submit the claims to PR #84's offline review queue. Manual
source checks and PR #85's human editorial approval workflow remain
mandatory before any separately reviewed public data change.

## Tests

~~~bash
python3 -m unittest discover -s tests -p 'test_gemini_transcript_intake.py' -v
~~~

The 12 synthetic tests cover mixed transcripts, example/partial objects,
missing holds, duplicate complete revisions, untrusted or future-dated
claims, unchanged source evidence, output privacy paths, and nonexistent
guide registrations.
