# Offline multi-batch research review queue

This operator-only tool follows PR #82's JSON handoff validator and PR #83's guide assignment generator. It **never publishes, merges, or verifies sources**.

## Prepare the incoming research

Save the actual Gemini handoff JSON files **locally** in the ignored research-drafts directory. Do not commit raw research, contact details, review manifests, or scraped content to the public GitHub repository.

For example, use:
- research-drafts/oregon-batch01-pending.json
- research-drafts/oregon-batch02-pending.json

Every incoming file must use the strict schema_version 1 format accepted by the existing scripts/enrichment_handoff.py validator.

## Optional website and identity holds

Create a local JSON file at research-drafts/review-holds.json:

~~~json
{
  "schema_version": 1,
  "holds": [
    {
      "directory_id": "OG.0000647",
      "reason_code": "website_security_unverified",
      "reason": "Research reported unrelated content at candidate site; independent security check required"
    },
    {
      "directory_id": "OG.0000665",
      "reason_code": "not_fishing",
      "reason": "Research suggests a hunting-only business; check operator activity before fishing-specific enrichment"
    }
  ]
}
~~~

The hold reasons reflect *unverified research concerns*, not confirmed business wrongdoing. Do not remove or change imported entries simply because a hold exists.

Supported reason codes: website_security_unverified, identity_unresolved, not_fishing, source_unreachable, operator_review_required, other_manual_review. Each hold requires an existing directory ID, supported code, and nonempty explanation.

## Generate the offline review queue

~~~bash
python3 scripts/enrichment_review_queue.py \
  --batch research-drafts/oregon-batch01-pending.json \
  --batch research-drafts/oregon-batch02-pending.json \
  --hold-file research-drafts/review-holds.json \
  --out research-drafts/oregon-review-queue-01.json
~~~

Optionally supply --baseline-sha256 HASH to fail if the public enrichment data has changed since your previous review. Each batch retains filename and SHA-256 evidence provenance. Every output entry remains review-only.

Possible per-guide statuses:
- pending_human_source_review: structurally valid, no duplicate ID and no active hold; **not approved**.
- manual_hold: a submitted guide has an explicit investigation hold.
- manual_hold_no_claims: guide only appears in the hold list; excluded from the incoming JSON.
- invalid_schema: malformed, unsupported, or unmatched claims.
- duplicate_submission: the same guide submitted more than once with equivalent evidence.
- conflicting_submissions: two or more submissions for the same guide with different claims or citations.

No duplicate records are merged automatically. No proposed claims or source lists are promoted out of a conflicting, invalid, or held record. The queue is written even if invalid or overlapping records exist, but exits with nonzero status to flag the problem. Explicit manual holds do not by themselves trigger an error exit.

The command creates a **new** report only under ignored research-drafts, including protection against symlink path escapes. It does not write to lib/guide-enrichment.json, Supabase, or any public page.

## Before approving anything

Independent source reviewers must verify actual content, operator identity, named waterways, copyright and publication permissions. The existing editorial and moderator approval process must run separately. A passing format check is never evidence of a valid license, a trustworthy business website, or a scientifically validated claim.

~~~bash
python3 -m unittest discover -s tests -p 'test_enrichment_review_queue.py' -v
~~~
