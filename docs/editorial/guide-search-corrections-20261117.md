# Approved editorial search corrections — 2026-11-17
Source: Sam's direct product instruction in the architecture conversation.
Status: authorized editorial input; pending application integration and deployment.
This is not an independently verified operator-site or licensing claim.

## Walter Rowe
Existing source ID: OG.0003297
Existing person: Walter Rowe
Existing business: Reel Time Fishing Adventures
Requested species/search attribute: Halibut.
Acceptance: searching "halibut" or selecting the halibut filter returns this existing guide listing, while preserving current guide ID, reviews, claims and all other supported attributes.
Do not confuse with Toby Wyatt / Reel Time Fishing LLC (OG.0001200), a different existing record.
Sam stated: "Walter Rowe of Reel Time fishes for halibut."
Do not infer species subspecies, fishing method, season, location, available booking or verified credential.

## Keondre / Dre
Existing source ID: OG.0003348
Existing registry name: Keondre Menefee
Existing business: Valley Coast Outdoors
Requested searchable nickname: Dre.
Sam referred to "Keondre Menifee" and stated he goes by Dre.
Preserve the original registry spelling Menefee and stable source ID. Do not silently replace the canonical name based on the spelling variation.
Acceptance: searching "Dre" and "Dre Menefee" returns this existing listing. Preserve existing Keondre search behavior. The user-supplied Menifee variant is an identity-review note; no second guide should be created.
A suitable editorial display, after integration, is Keondre “Dre” Menefee.

## Implementation handoff
01 owns integration;07 owns assigned directory metadata work only after coordination.
Read current guide search and attribute loaders before editing. lib/approved-guide-attributes.json currently accepts only operator/directory-sourced attributes. Do not fabricate a public URL or pretend this user confirmation came from an operator page.
Use an existing editorial-correction mechanism if present; otherwise integrate a narrowly scoped, explicitly attributed editorial fact/alias path with tests, agreed with01. Do not redesign the entire provenance system for two edits.
Test positive searches/filters and unrelated-guide negatives, no duplicate identities, and preservation of review/claim associations.
No live application data or deployed search was changed by this documentation commit. Existing active work remains untouched.
