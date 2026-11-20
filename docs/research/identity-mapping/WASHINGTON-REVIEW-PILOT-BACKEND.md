# Washington single-guide review backend

This local review candidate extends the reviewed Oregon split. It contains no real guide, source allocation, seed or new public review UI. All 158 historical associations remain held. The active Oregon branch and migration files stay outside the change.

## Contract and evidence

- The review candidate requires the final launch body and the Oregon split. The disposable runner verifies SHA-256 digests e76030edd1cfe5d9b61ef48cf8132a96536f01f13e3030016890ab549b076f78 and 28ddf1ce024b0e2ac80e550e536fdfe37c0522e41aa0b0c245be7e0515f3f032 respectively. Confirm the actual target equivalents independently before considering a future migration.
- The existing offline intake must pass on a genuinely new guide. 01 and 05 still need to check firsthand the packet's issuer confirmation, operator confirmation and identity-collision review. Keep the receipts and their identifiers in the existing private channel. [Intake contract](WASHINGTON-PROSPECTIVE-REVIEW-INTAKE.md)
- WDFW's public Commercial Licensing page identifies the issuing division. Its Public Records page describes a written request for a specific existing record and possible redactions. The public material reviewed did not provide a named guide status lookup or a current credential for an eligible new guide. A narrow holder/type/status/expiry confirmation from the issuer is the remaining proof. No request was made. [Commercial Licensing](https://wdfw.wa.gov/licenses/commercial/fishing-charter-guide-requirements) · [Public Records](https://wdfw.wa.gov/about/administration/public-records)

## Eligibility and disable

| Layer | Contract |
|---|---|
| Configuration | RMG_WA_REVIEW_PILOT_SOURCE_ID is server-only and unset by default. The public guide source must match it exactly for WA readiness, review submission, reporting and review reads through the launch API. |
| Private database control | The singleton defaults disabled and unconfigured. A later reviewed enrollment binds exactly one fresh WA source ID beyond the pinned 163 historical source positions to an explicitly mapped new guide UUID. The guide must use that same stable ID as its slug, be published and have no Oregon mapping. The reviewed map reference must equal wa-pilot-sha256: followed by the exact independently accepted intake packet digest. The pilot table and helper functions are private. |
| Review lifecycle | Accepted submit, moderation, revision and reporting functions apply the same identity gate while preserving the Oregon path. Pending queues use WA eligibility before paging, independent moderator rules continue to apply, and WA claims and profile edits remain closed. SQL makes the definitive write decision, including moderator and author operations addressed only by review UUID. |
| Disable | The separate disable file sets just the WA singleton to false and is idempotent. Its update waits on in-flight admitted WA mutations, and a later waiter detects committed closure. It preserves published and pending rows, reviews' authorship and ratings, revisions, reports, audit history, mappings and claims. The WA review API closes on the paused guide. Existing public-view visibility rules continue to apply to previously published reviews. Unsetting the application source alone is insufficient for a full pause because some review moderation operations start with a UUID. |

The runtime SQL deliberately excludes the held directory range and binds the map's digest; those checks complement the owner's private verification for potential duplicates. No deployment or enrollment action is included. The current Washington UI remains read-only. When the real packet is approved, 01 and 05 will need a separate UI/release check for the exact prospective profile, and a production-equivalent inactive migration/readback acceptance. 01 owns all hosted actions.

## Reproduce locally

Use installed PostgreSQL 17 binaries on PATH. This runner initializes a temporary cluster with a private Unix socket and disables TCP. It reconstructs the existing synthetic fixtures, verifies the prior SQL hashes, and exercises the WA lifecycle and both lock orders. It has no target or credentials argument.

    PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" bash tests/backend-launch/run-wa-review-pilot-v1.sh
    node --test tests/backend-launch/handler.test.mjs
    PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p wa_review_intake_test.py

The fixture proves that a confirmed ordinary actor can submit once, a separate moderator can publish, the author can propose a correction, and the moderator can approve it while preserving unspecified trip month. It also covers reports, permission denials, wrong mapping/digest/slug, a mapped neighbor, an Oregon alias, and WA-only pause with the Oregon suite passing. No real identities, accounts, evidence or hosted resources enter the tests.
