# Existing Washington listings and review identity

## Evidence and constraints

The retained recovery archive schema binds reviews and claims to the UUID primary key of public.guides. Guides have a unique slug and a listing status of draft, published, or suspended. Anonymous guide reads select published rows. Review visibility independently requires published status and a publication time. The review identity map is a later launch contract and cannot be reconstructed from those foreign keys. A stable directory slug can already belong to a different historical archive row. The archive schema cannot establish which record the old importer intended.

The current Washington source shape is a name, business, source and notes. Its allocation key is the normalized name/business/source triple. It addresses a record and cannot verify a person. The available input has 163 distinct source keys, 158 unique allocated public IDs and five unallocated records. The current Oregon registry has 1,027 distinct OG registrations and there are zero approved Washington-to-Oregon links. The retained lineage remains 0 proven, 10 ambiguous and 148 unresolved. All 158 historical associations stay held.

## Local proof

This branch binds one existing stable listing and exact version to a newly generated **private review identity**. It leaves the archived and current legacy guide records, public guide IDs and the current review mapping untouched. The source ID, source-key digest, reviewed listing version, person fingerprint and independently approved packet digest each participate in the binding. Duplicate source IDs, key digests, listing versions, verified persons and evidence packets are rejected. An already mapped source, later mapping collision, wrong version or next-door listing cannot resolve through the proof. The control defaults closed and a single proof can be enabled. It cannot resolve while the prospective pilot is enabled.

A listing version hashes the stable ID, exact allocation key and full source row, including notes. A row edit requires an independent continuity decision before any binding update. Preserve the same private review identity if continuity is proved. A replaced person or unresolved continuity leaves the route held. This candidate deliberately has no automatic rebind or merge.

The private UUID cannot be inserted into the existing reviews table because that table has a non-null foreign key to public.guides. In a rolled-back fixture transaction, a neutral opaque draft with a different internal slug satisfied that constraint without appearing in anonymous guide results. A pending review addressed to that draft also remained private. The current proof treats any such materialization as a collision and closes until a separately reviewed adapter contract exists. The fixture does not register a public profile, reuse a historical guide UUID, approve a real review, or establish future public read compatibility.

## Intake for one real listed identity

The minimum new evidence is one independent issuer record that identifies a stable guide subject, plus direct confirmation using an independently controlled operator contact that binds that same subject to **this exact existing listing version**. The confirmation must distinguish individual captains at a shared outfit. Mere matching of name, business, website, source label or archive slug is insufficient. The reviewer needs a dated private collision check against current review mappings, other jurisdictions and possible listing continuity conflicts. A historical clue can block the association without qualifying as evidence of the legacy UUID. The original import return receipt is still required for any historical UUID backfill.

Capture one owner-controlled private person fingerprint using a keyed digest of the issuer-qualified, stable subject reference. Check that aliases and any known credential reissues resolve to that same verified subject. If the issuer record lacks a persistent person reference, resolve a single canonical identity with independent evidence before deriving the fingerprint. Hold unresolved ambiguity. Record no personal data or keys in Git.

The existing proof uses the same private receipt filenames as the prospective intake. In packet.json use these fields.

| Field | Meaning |
|---|---|
| schema | wa-listed-review-intake/v1 |
| listing, catalog_sha256 | Exact objects returned by the version command |
| identity_fingerprint | The owner-controlled 64-character lowercase hex digest of the verified subject |
| issuer | authority WDFW, record_kind issuer_identity_confirmation or credential_record, and confirmed_on in ISO date form |
| owner_review | reviewer, checked_on, basis issuer_and_operator_for_exact_listing, and collision_counts with zero current_review_mappings, cross_jurisdiction_identity and listing_continuity |
| receipt_sha256 | Digests of issuer-proof, operator-confirmation and collision-report |

In decision.json use reviewer, checked_on, packet_sha256 and decision eligible_for_listed_identity_proof. The different reviewer validates the actual receipts, identity and listing continuity over the private channel. The validator checks the structure and exact bytes, and does not authenticate a receipt or the reviewers.

    PYTHONDONTWRITEBYTECODE=1 python3 -m scripts.wa_listed_review_intake version <stable-wa-id>
    PYTHONDONTWRITEBYTECODE=1 python3 -m scripts.wa_listed_review_intake preflight /absolute/private/packet/dir
    PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'wa*intake_test.py'
    PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" bash tests/backend-launch/run-wa-review-pilot-v1.sh --listed-identity

This proof addresses identity for review eligibility. It grants no claim, license status or verification badge. License currency and type are separate issuer assertions, and profile control needs its separate authorization.

## Remaining release dependency and responsibility

A real listed pilot needs an accepted evidence packet and an independently reviewed, version-checked review target contract. The current shared resolver only accepts published guides, so an opaque draft cannot be dropped into that path. If 01 accepts the neutral draft carrier, the adapter must explicitly keep it out of guide discovery and claims, use a narrowly scoped WA review resolver, check the listing version on the server, and prove review reads, revisions, moderation, reports, audit, direct access and disable before any hosted action. An alternative carrier would require a separately versioned review schema. No existing guide or historical review may be repointed.

01 owns evidence routing and any eventual hosted work. 05 independently checks the identity packet and local proof, then the exact adapter contract. 06 owns the backend follow-up. This proof and its rollback are local-only and do not depend on changes to the prospective frontend or the Oregon release.
