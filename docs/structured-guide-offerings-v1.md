# Structured guide offerings wire v1

POST /api/guide-offerings JSON. Use camelCase. No guide UUID, owner, or moderation status inputs. Private operations use the existing Bearer access token. Anonymous public operations use no token.

Draft payload:
    { vessels: Vessel[], offerings: Offering[] }

Vessel:
    { id:"v1", label:string, type:string, covered:boolean, heated:boolean,
      maxAnglers:number|null, fishCare:string[] }

Offering:
    { id:"p1", title:string, jurisdiction:"OR"|"WA", waterway:string,
      launchArea:string, species:string[], months:number[], vesselId:string|null,
      bookingStyle:"call_to_confirm"|"per_seat"|"private_boat"|"both",
      duration:"unspecified"|"half_day"|"full_day"|"multi_day",
      methodIds:string[], gearIds:string[] }

Bounds are 0–4 vessels and 0–8 offerings. IDs are v/p plus 1–4 digits without leading zero. Vessel types and fish care choices match CaptainFisheryDraft. Optional months are [], and nullable vesselId supports bank/wade. Owner save supports blank trip text and empty species while editing. Each submitted trip needs a title, waterway, launch area, and a target or the explicit `bottom-fishing` method. A method-only Bottom fishing trip has `species:[]`. The broad `Crabbing` target is distinct from `Dungeness crab`, methods, and gear. A completely empty draft may be submitted after saving. Canonical species options are lib/guide-offerings/species.json (Rockfish is grouped). Existing method and gear IDs come from lib/captain-fishing/catalog.mjs. Labels, titles, water and launch fields max 80 chars with no contact details or URLs. Trip jurisdiction describes geography and does not imply write eligibility.

| operation | additional request keys | response |
|---|---|---|
| owner_get | jurisdiction:"OR", sourceId | OwnerState |
| owner_save | jurisdiction:"OR", sourceId, expectedRevision:number, draft:Draft | OwnerState |
| owner_submit | jurisdiction:"OR", sourceId, expectedRevision:number | OwnerState |
| moderator_list | offset:number, limit:1–50 | {items:[{id,jurisdiction,sourceId,revision,draft:Draft}],offset,limit} |
| moderator_decide | proposalId:UUID, approve:boolean, reason:string | {proposalId,status:"approved" or "rejected",publishedVersion:number or null} |
| public_profile | jurisdiction:"OR" or "WA", sourceId | {profile:Published or null} |
| public_batch | afterSourceId:string or null, limit:1–100 | {items:Published[],nextCursor:string or null} |

OwnerState:
    { draft:{revision:number,vessels:Vessel[],offerings:Offering[]},
      proposal:{id,revision,status:"pending"|"approved"|"rejected",reason:string|null}|null,
      publishedVersion:number|null }

Published:
    { jurisdiction:"OR",sourceId,publishedVersion:number,attribution:"captain_declared",
      vessels:Vessel[],offerings:Offering[] }

Draft revision starts at 0, save compares expectedRevision and returns the incremented revision. Submit freezes exactly the saved revision. A pending revision does not modify public content. Approval swaps the published version atomically. An approved empty draft returns a version with no trips. A competing pending proposal or stale revision returns 409 conflict. Existing owner draft/proposals are claim-scoped. Use the durable public cursor rather than requesting each guide. Null/empty public responses while disabled and all responses use no-store. 503 launch_unavailable for closed private routes, 403 forbidden for ownership/role, 401 sign_in_required, 400 invalid_input.

## Database dependency and gates

The additive candidate in `supabase/review-candidates/structured-guide-offerings-v1.sql` requires the Oregon review split and 01's verified claims foundation `10-oregon-claims-v1.sql` from `bb25f3e`. The foundation owns the exact approved claim and published directory mapping check. The SQL candidate has a closed default and the route requires the server-only `RMG_GUIDE_OFFERINGS_ENABLED=true`. Private operations also require the independent claims gate. Public reads use approved snapshots, even if claims are paused. A publication approval replaces the entire previous approved fleet and offering set for one guide in one transaction.

The separate `structured-guide-offerings-disable-v1.sql` closes the offerings DB gate and preserves drafts, proposals, publication versions, and core tables. In-flight admitted writes finish before the pause takes effect. Private operations then return unavailable and public reads yield an empty projection. Reopening exposes the same approved versions. Oregon review and rating state is independent.

## Local verification

With PostgreSQL 17, Node 22, and Python 3 on PATH, run:

```sh
node --test tests/backend-launch/structured-guide-offerings.test.mjs
bash tests/backend-launch/run-structured-guide-offerings-v1.sh /path/to/10-oregon-claims-v1.sql
```

The runner creates and removes its own database cluster and uses synthetic roles. Its loopback HTTP harness invokes the handler against the disposable database with synthetic Auth. It verifies the prior Oregon review split before installing the two separate candidates, then checks exact source ownership, private revisions, publication, anonymous profile and batch reads, and data-preserving disable.
