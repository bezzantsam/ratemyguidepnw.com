# Prospective Washington review intake

This offline intake prepares one new Washington identity for pilot design. Existing stable IDs, raw source rows and historical backend rows stay outside this path. On the reviewed snapshot, 0 of 158 historical associations are proven, 10 are ambiguous and 148 are unresolved. All 158 remain held.

## The first real packet

Start with one Washington guide who is absent from the directory and resolves to no current or archived guide identity on the owner's private check. Have the operator confirm the legal holder and business through an independently established business contact. Confirm the credential holder, identifier, type, current status and expiry against a current WDFW issuance record or direct confirmation from WDFW Commercial Licensing. Retain the narrow issuance evidence and operator confirmation privately. [WDFW licensing and Commercial Licensing contact](https://wdfw.wa.gov/licenses/commercial/fishing-charter-guide-requirements)

The owner checks the recovery archive, the current guides inventory and private identity mappings across jurisdictions for possible collisions, including equivalent people, businesses, known aliases and identifiers. The owner retains a dated private result bound to the same person, credential and proposed source ID. Hold the case if any evidence is missing, any result is uncertain, or any candidate may already correspond to an existing guide. An existing source profile with independently established identity requires separate lineage reconciliation. A historical slug, name or business can flag a collision. Assigning a historical UUID requires proof linking the original source key to the committed UUID.

This branch contains no real packet. The missing input is **current issuer confirmation and direct operator confirmation for the same new guide, with the owner's private collision check and independent review**. A roster, business website or public directory listing can identify a person to contact and does not substitute for that packet.

## Private files

Keep the bundle outside the repository with access limited to the owner and independent reviewer. Retain evidence about the guide and credential needed for this decision. Avoid unrelated IDs, customer records and account credentials.

| File | Contents |
|---|---|
| issuer-proof | Issuer record or direct issuer confirmation for the exact holder and credential, including type, current status and expiry |
| operator-confirmation | Independently routed operator confirmation tying that holder and credential to the proposed listing and business |
| collision-report | Owner's signed or attributable result for the archive, current guide inventory and identity maps, with the exact candidate and scope of checks |
| packet.json | One proposed source ID, credential details, catalog digests, dates, collision counts and receipt digests |
| decision.json | The independent reviewer's attributable decision from the agreed private channel, tied to the exact bytes of packet.json |

The following packet.json values are placeholders. Counts measure possible matches and must be clear for the prospective lane.

    {
      "schema": "wa-review-intake/v1",
      "candidate": {
        "source_id": "<new owner-proposed wa-NNN ID>",
        "legal_name": "<verified holder>",
        "business": "<verified operator>",
        "credential_id": "<issuer identifier>",
        "credential_type": "<issuer classification>"
      },
      "catalog_sha256": {
        "washington_raw": "<SHA-256 of lib/washington-raw.json>",
        "washington_ids": "<SHA-256 of lib/washington-stable-ids.json>",
        "oregon_registry": "<SHA-256 of lib/oregon-guides.json>"
      },
      "issuer": {
        "authority": "WDFW",
        "status": "active",
        "confirmed_on": "<YYYY-MM-DD>",
        "valid_through": "<YYYY-MM-DD>"
      },
      "owner_review": {
        "reviewer": "<owner>",
        "checked_on": "<YYYY-MM-DD>",
        "collision_counts": {"archived_guides": 0, "current_guides": 0, "identity_map": 0}
      },
      "receipt_sha256": {
        "issuer-proof": "<SHA-256>",
        "operator-confirmation": "<SHA-256>",
        "collision-report": "<SHA-256>"
      }
    }

For decision.json, use reviewer, checked_on, packet_sha256 and decision. The independent reviewer uses **eligible_for_pilot_design** only after reading the underlying receipts and collision scope. The script checks structure, dates, digest integrity, reviewer separation and catalog collisions. It cannot authenticate reviewers or verify that a PDF, communication or collision report is genuine. Obtain the approvals through the existing private handoff. The script returns only a machine status, packet digest and historical hold count. It produces no mapping, UUID, seed or public change.

    python3 scripts/wa_review_intake.py /absolute/private/path
    PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p wa_review_intake_test.py

## Where Washington remains closed

| Layer | Current behavior on the Oregon launch pin | Boundary for a later single-guide pilot |
|---|---|---|
| HTTP | The launch handler returns unavailable for WA readiness and rejects WA submission, reporting, claims and edits before backend access. [Handler](../../../lib/backend-launch/handler.mjs) | Keep the default deny. A separate WA control may admit one exact WA source ID to review readiness, submission and the independently verified review lifecycle. Keep claims and captain edits closed. |
| SQL | The Oregon split gates review writes and published-guide, moderation, revision and report eligibility on Oregon identity. The v2 wrappers delegate into those guards. [Oregon split](../../../supabase/review-candidates/09-oregon-reviews-split-v1.sql) · [v2 wrappers](../../../supabase/review-candidates/07-review-month-and-recovery.sql) | An independently accepted migration must apply a separate default-off control and exact new source-to-guide identity in the private schema. Enforce the same identity through readiness, submission, review reads, revisions, reports and moderation. Test pending/public transitions, duplicates and unauthorized actors. |
| UI | Guide engagement short-circuits WA write readiness and shows the closed state. The WA profile and directory use the stable WA listing. [Guide engagement](../../../components/launch/GuideEngagement.tsx) · [WA profile](../../../app/washington/%5Bid%5D/page.tsx) | Show review controls only for the one server-ready WA profile. Keep all other WA routes and claims closed. Eligibility uses profile identity independently of fishery geography or alias search. |

01 obtains the verified packet and owns integration and hosted execution. 05 independently checks the evidence binding, exact staged implementation, neighboring held WA controls and Oregon continuity. 06 can implement the specific gate after the verified packet exists. A future disable must close just the Washington pilot and preserve reviews, audit records, mappings and Oregon behavior. This intake requires no changes to Oregon code, credentials or activation.
