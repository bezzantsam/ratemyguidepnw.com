# RateMyGuide reviews and claims — 06 backend draft contract

**DRAFT; not integration-ready.** The v2.1 update at the end supersedes conflicting earlier fields, return values, and gates. Worktree `/Users/sambezzant/ratemyguidepnw-backend-06` started at local `d1d8aeab28c2840614885e9a1daa3be1e1440f33`, source tree equivalent to PR #120 predecessor `62b74a8e135bb3f6e95087cf59edab7e7ce8dabb`. The SQL files in `supabase/review-candidates/` are proposals, not registered migrations and have not been executed against hosted data. No hosted changes were made. Supabase CLI is absent here; create the eventual migration using `supabase migration new` in a permitted environment, after independent testing and drift review. 01 owns pages, components, frontend adapter, sharing and shared CI; 06 owns route, server helpers, backend SQL and backend tests.

## Transport

`POST /api/launch`, `Content-Type: application/json`; one object with an `operation` property. All responses have `Cache-Control: no-store`. The request is limited to 16,384 UTF-8 bytes, rejects unexpected fields, and never accepts a caller-supplied user ID, role, status, guide UUID or publication timestamp. `public_reviews` needs no session; all other operations use `Authorization: Bearer <Supabase access token>`. The server calls Supabase `auth.getUser(token)` and requires a confirmed email and a non-anonymous, valid user; the database independently checks the authenticated user. No service-role credential is used. Vercel project metadata shows `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` available for production, preview and development. Presence of environment names does not prove correct values, Auth provider configuration, email delivery, or redirect allowlists.

The existing browser Supabase client can own sign-in/session persistence; 01 owns UI and redirects. Return values MUST be same-origin paths validated against an allowlist of existing profile/claim/admin paths, never an absolute external URL, protocol-relative URL, backslash or control characters. Preserve only the intended `intent=review` query and `#write-review` fragment when applicable. Do not place access tokens, evidence, email, claim status or private drafts in share URLs. Production Supabase redirect allowlists and the actual site domain still need inspection and an end-to-end sign-in test.

`jurisdiction` is `OR` or `WA`; `sourceId` is the stable directory ID as rendered for that jurisdiction. Database UUID is resolved through `rmg_private.guide_identity_map`, with unique `(jurisdiction,source_id)` and `(jurisdiction,guide_id)`. Only explicitly reviewed entries are eligible; no slug/name matching or automatic mappings are populated by these drafts. Unmapped IDs return 404 `not_found`, not an empty review set. Existing published guides have no established jurisdiction in the hosted database; the Oregon exact-registration/slug audit is evidence for review, not a completed mapping. Washington matches remain unresolved until sourced mapping is independently reviewed. Cross-state profiles require a deliberate canonical jurisdiction/ID supplied by 01.

## Operations (provisional; not validated against actual PostgREST)

- `{operation:"session"}` -> `{authenticated:true,operator:boolean}`. `operator` comes from `site_admins`, not user metadata.
- `{operation:"public_reviews",jurisdiction,sourceId}` -> `{summary:{count,averageQuality,wouldBookAgainPercent},reviews:[{id,quality,intensity,would_book_again,body,trip_month,published_at,relationship_disclosure}],limit:100}`. `summary` derives from all published rows with publication timestamps; list returns at most 100. A mapped guide with no reviews has count 0 and null averages. Only published safe columns are exposed.
- `{operation:"submit_review",jurisdiction,sourceId,quality,intensity,wouldBookAgain,body,firsthandAttested,relationship}` -> `{id,status:"pending"}` from the database. `quality` and `intensity` are integer 1–5; `wouldBookAgain` boolean; body 80–3000 characters after trimming; `firsthandAttested` must be true; `relationship` one of `none`, `personal`, `financial`, `other`. This attestation is a user assertion, not independently verified trip evidence. Duplicate review constraint returns conflict rather than fabricating success; a retry after a lost success response may return conflict.
- `{operation:"submit_claim",jurisdiction,sourceId,claimantName,businessName,evidence}` -> `{id,status:"pending",existing:boolean}`. Name length 2–120, business is a string (empty allowed, maximum 160), evidence 20–1200 characters. Evidence is private. A repeated pending claim for the same actor and guide returns the same ID with `existing:true` and does not replace the original evidence. Approval is a manual ownership decision, not license or credential verification.
- `{operation:"own_status",kind:"review"|"claim",id:<UUID>}` -> `{id,status}` only for the actor's own record. Review status is `pending`, `published`, `rejected`, `removed`; claim status is `pending`, `approved`, `denied`. No internal moderator reason is returned.
- `{operation:"edit_details",jurisdiction,sourceId,boat,gear,yearsExperience,expertise,species}` -> `{status:"saved"}` for the approved owner only. Text limits boat 250, gear 500, expertise 500, species 350; years is null or integer 0–80. This never updates protected identity/registry fields or independent reviews. Owner-declared information must be labeled as such. Publication moderation of owner details is not yet designed; do not integrate this operation as launch-ready.
- `{operation:"operator_queue",kind:"review"|"claim",offset,limit}` -> `{items,offset,limit}`; offset 0–100000 and limit 1–100. The operator-only queue includes private claim evidence; never place it in URLs or caches.
- `{operation:"operator_decide",kind,id,approve:boolean,reason:string}` -> `{status:"decided"}` after DB success. Approval requires at least 20 characters documenting manual review; rejection reason may be empty. Replay/nonpending/conflicting decisions fail. Decisions and audit records must be one transaction.

Error object `{error:<code>}`: 400 `invalid_input`, 401 `sign_in_required`, 403 `forbidden`, 404 `not_found`, 409 `conflict`, 415 `json_required`, 429 `rate_limited`, 503 `service_unavailable`. These are provisional until the SQL and hosted API are tested; database conflict details are not returned to clients. Backend errors and credentials are not returned. Client must distinguish an empty public result from an unavailable/unmapped identity.

The SQL candidate revokes direct browser writes, adds attestation and relationship fields, a manually reviewed identity mapping, server-authorized RPCs, bounded per-account review and claim requests, hardened moderator decisions with audit, and owner details constrained to approved claims. It reuses hosted tables, triggers, audit table and site admins. No service role is exposed. Existing public ratings use `published`; summary additionally requires a publication timestamp. SQL grants and RLS, all other hosted functions, storage exposure, and races require real PostgreSQL and API tests before applying. Do not claim IP-based abuse protection: this is a bounded per-account safeguard, not Sybil resistance.

## Tests and blockers

`/private/tmp/rmg-beta-node22/node --test tests/backend-launch/*.test.mjs`: 9/9 passing on Node 22.22.2 (validation and mocked HTTP/auth boundary; no live auth/database). `/private/tmp/rmg-beta-node22/node node_modules/typescript/bin/tsc --noEmit --incremental false`: exit 0 using an owner dependency tree via a symlink, with no dependency copy. The existing approved `scripts/backend-audit/run-local.sh` ran and passed its own older synthetic repair tests including competing claims; it did **not** run these new candidate SQL files. New `bash tests/backend-launch/run-local.sh` failed during `initdb` with `shmget ... Operation not permitted`. Do not apply these unexecuted SQL proposals. A permitted isolated Postgres 17 runtime is needed to run the new tests and concurrency/failure injections; no Supabase development branch exists. Never use live customer data as a fixture.

No Auth users/site-admin entries existed at the coordinator's last inspection. Git's configured email is not proof of moderator authority. The user has been asked which email should be the first moderator; the person must actually sign in and verify control before an operator can safely associate the existing auth UUID with `site_admins`. Never bootstrap based on a submitted email field. Exact auth provider, redirect and operator access remain unverified.

Rollback must be coordinated with 01 before shared mutation: freeze writes by revoking only the newly granted RPC EXECUTE privileges, retain data and audit records, revert application deployment to its previously recorded exact READY SHA, and restore only catalog/grants from a freshly saved pre-change snapshot. Never blindly re-enable previously unsafe direct writes. Destructive rollback of attestation, mapping, or audit data requires a separate data-preserving plan. No rollback has been exercised.

## Subsequent read-only identity reconciliation

A current aggregate and row-level comparison of the Oregon source snapshot against hosted guides found 1,027 unique source registrations, each matching exactly one distinct published `guides.license_number` and derived slug. The source snapshot SHA-256 is `3f0671e58d8d9f5615ba15668b7043fbc4f11859dafb10cf91068a5eb2a62081`. The proposed UUID mapping is saved outside the repository in `/Users/sambezzant/environment-qa/20261117/rmg-oregon-identity-candidates-unreviewed.json`, SHA-256 `8928f60ff73c6fd3f0cb520e32fe8f56bc7b92af890e818e74bf5ef82a92bbae`. It is not yet approved or inserted; exact registration/slug mapping is not captain ownership or current-license verification. Revalidate uniqueness and rows immediately before any coordinated seed. Washington remains unresolved.

`supabase/review-candidates/emergency-disable.sql` is a draft fail-closed rollback that revokes new function execution without deleting data. It is not executed or a substitute for a pre-change catalog snapshot and a tested deployment rollback.

### Initial operator bootstrap (proposed; no account created or grant made)

After the named person completes a supported verified sign-in, an authorized database operator must locate that specific user in Supabase Auth and verify the UUID and confirmed-email status out of band. Once confirmed, an explicitly parameterized, one-time administrative transaction can insert that UUID into existing `public.site_admins` only if the corresponding `auth.users` row has `email_confirmed_at IS NOT NULL`, `is_anonymous=false`, and `deleted_at IS NULL`; use `ON CONFLICT DO NOTHING`. Check the insertion result and test queue access with that user's authenticated session and a separate unprivileged user. Do not log email, tokens, link URLs or service credentials. A submitted email address or the git identity cannot establish this UUID. Rollback is to revoke that specific membership, retaining the application audit and other members. No bootstrap transaction or redirect changes have been performed.

### Existing storage interaction

Read-only hosted inspection found an existing public `guide-photos` bucket and permissive `storage.objects` upload/delete policies for approved claimants. Approving the first owner would therefore also enable direct uploads/deletions even when the website upload UI remains disabled. `supabase/review-candidates/03-disable-uploads.sql` proposes restrictive policies denying insert/update/delete for that bucket while preserving existing policies and other buckets. The CI synthetic storage fixture must be exercised; it is not a substitute for real Storage HTTP tests, current-policy and privileges review, or a hosted migration. Emergency rollback should leave this protection in place unless explicitly reviewed.

## Expanded launch interface — draft v2 (2026-11-17)

The user now requires structured answers and review edits at launch; these supersede the earlier statement that optional answers are a follow-on. The implementation and SQL remain review candidates until this exact successor passes the synthetic database harness and independent review.

`submit_review` additionally accepts optional `tripResponses`, either omitted/null for a basic text/star review or `{version:1,answers:{...}}`. In `answers`, **an absent key means unanswered**, `{state:"not_applicable"}` means not applicable, and `{state:"answered",value:...}` preserves an actual false/zero/rating. Unknown fields, versions, null answers, arbitrary free text and extra properties are rejected at both server and database boundaries. Accepted keys and values:

- Boolean: `teaching_requested`, `children_present`, `dog_present`, `dog_previously_disclosed`.
- Integer rating 1–5: `teaching_experience`, `guide_patience`, `effort`, `attentiveness`, `organization`, `cleanliness`, `response_slow_catch`, `respect_for_boundaries`.
- Integer minutes 0–1440: `agreed_duration_minutes`, `actual_duration_minutes`.
- `target_species`: `chinook`, `coho`, `steelhead`, `other`, `unknown`; `setting`: `river`, `ocean`, `estuary`, `other`, `unknown`.
- `duration_change_reason`: `weather`, `safety`, `customer_request`, `guide_decision`, `other`, `unknown`; `conversation_preference`: `talkative`, `quiet`, `no_preference`.

There are no children’s names, religious or political fields, or arbitrary text within structured answers. These are angler observations and preferences, not independently verified fact or evidence of protected traits. The public published-review fields gain `trip_responses`; pending answers and revision payloads remain private.

New operations:

- `{operation:"safe_return",returnTo:"/guides/og-123?intent=review#write-review"}` -> `{returnTo:<same-origin relative path>}`; no session needed. Allowed paths are `/guides/<lowercase-slug>`, `/washington/wa-<digits>`, `/claim/<OR-registration-or-WA-id>`, `/admin`; only `?intent=review` and `#write-review` may be retained. Absolute/protocol-relative URLs, backslashes, encoded slash/backslash, controls and unrecognized query/fragment are rejected with 400. This sanitizes a return destination; the browser sign-in provider configuration/redirect allowlist still requires actual verification.
- `{operation:"review_detail",jurisdiction,sourceId,id:<review UUID>}` -> `{review:<safe published fields>}`; 404 for unmapped guide, unpublished review or guide/review mismatch. A review share URL must also use the canonical public profile route and never include account tokens or drafts.
- `{operation:"profile_details",jurisdiction,sourceId}` -> `{details:<allowed captain-declared fields or null>,attribution:"captain_declared"}`; no claim of registry/source verification. Owner edit is `edit_details` as above; readback is this same operation. The schema does not let a captain modify source registration, names, source evidence, independent reviews or ratings.
- `{operation:"submit_revision",reviewId,quality,intensity,wouldBookAgain,body,firsthandAttested,relationship,tripResponses?}` -> `{id,status:"pending"}`. Only the author of a published review can submit; the existing published content and rating remain public and unchanged until an independent operator approves the revision. Only one pending revision per review is accepted; rejected edits never replace the old publication. Status is obtained by `own_status` with `kind:"revision"` (`pending`, `approved`, `rejected`). Reviewer must re-attest; all review validation applies. Moderators cannot decide their own revision or revisions about a profile they own. Decisions and audit update in one transaction.
- `{operation:"my_submissions",offset,limit}` -> `{items,offset,limit}` planned: items are only the actor's review/claim/revision IDs, actual status, created time, safe mapped `jurisdiction` and `source_id`, plus `review_id` for revisions; mapping may be null. No body, evidence or other author's information. The handler currently returns the RPC JSON directly; see the implementation and CI before integration.
- `operator_queue` and `operator_decide` accept `kind:"revision"`. Queue gives proposed review data only to authenticated `site_admins`. Revision decisions return `{id,status:"approved"|"rejected"}`; original review/claim decisions retain `{status:"decided"}`. Successful revision approval changes the same review ID and recomputes ratings from published rows.

No analytics or notification emission is implemented in this backend. Any future first-party analytics must use an allowlisted event schema without review text, email addresses or sensitive responses; notifications must only be sent according to explicit user preferences. No unapproved notification/outreach is initiated by these operations.

### Storage owner privilege and alternative (unverified proposal)

Hosted catalog inspection found `storage.objects` owner `supabase_storage_admin`; MCP's `postgres` user is not superuser or a member of that owner role. Do not grant reserved roles, change table ownership, or assume draft 03 can be applied. Draft `05-storage-via-claim-visibility.sql` is an additive alternative on `public.guide_claims`, owned by `postgres`: it hides approved claim rows from direct authenticated SELECT. The currently observed Storage INSERT/DELETE policies rely on caller-visible approved claim rows, so this should deny their match. Author-only status discovery and owner edits use separately verified SECURITY DEFINER functions and should continue; admin direct access to approved claim rows changes, while pending queues remain visible. A second synthetic database explicitly tests the observed predicates before/after, plus owner RPCs and unrelated storage. **This is not yet tested on this exact candidate or via the real Storage service.** It depends on the exact hosted policies, no additional permissive storage policy, PostgreSQL RLS semantics, and ongoing drift detection. Before using it instead of draft 03, independently verify the policy list, effective access, API operations, and owner/status behavior in a nonproduction environment. Do not apply either on trust.

The public `profile_details` operation uses an explicit private declaration-provenance record created by the approved-owner edit RPC and only returns it while that same actor has an approved claim. Existing unprovenanced detail rows return null instead of being labeled captain declarations; no private actor ID is returned. This and the public wrapper are draft until tested. The confirmed live table had zero guide-detail rows when inspected; recheck before any migration.

## v2.1 coordinated clarifications — default-off and basic reviews

A separate server-only environment variable `RMG_LAUNCH_ENABLED` must equal `true` to process **any** `/api/launch` operation; otherwise the route returns 503 `{error:"launch_unavailable"}`. Database `rmg_private.launch_control` is created default false and independently gates authenticated functions, guide resolution and existing moderator decisions, including direct PostgREST calls. Enabling requires a separate deliberate owner transaction and coordinated deployment; do not rely on UI or server flag alone. Emergency disable sets the DB gate false and revokes execution without deleting data. In-flight operations may finish while a disable is being committed; quiesce/verify before relying on rollback.

For both `submit_review` and `submit_revision`, only quality (integer 1–5), nonempty trimmed `body` (1–3000 characters), `firsthandAttested:true`, and `relationship` are required among review content; `intensity` and `wouldBookAgain` may be omitted/null and are persisted as SQL NULL. Existing hosted `reviews_body_check` requires 80–3000 characters and both optional fields are NOT NULL. The proposed migration broadens the body check and drops those two NOT NULL constraints without deleting data. Reinstating the old 80-character check later would reject new short reviews; a data-preserving rollback must use a NOT VALID constraint or other explicitly reviewed strategy, never delete or rewrite reviews.

`public_reviews.summary.wouldBookAgainResponses` counts only published reviews with an actual non-null rebooking answer; `wouldBookAgainPercent` is null when that count is zero, not 0%. Total `count` and `averageQuality` cover published reviews.

`operator_decide` now returns actual transactional `{id,status}` for all kinds: review `published|rejected`, claim `approved|denied`, revision `approved|rejected`. Nonpending/replayed decisions are conflicts. The moderator-only revision queue includes `guide_name` and a reviewed `jurisdiction`/`source_id` where available (otherwise null), with no submitter ID.

These changes have passed local mocked Node tests, but the current successor still requires exact synthetic PostgreSQL, independent security and hosted integration tests.

## v2.2 coordinated published-review return destination

On an exact allowed profile path only, `safe_return` additionally accepts `?review=<UUID>` for the sign-in callback and/or `#review-<UUID>` for the canonical published-review link. If both occur, UUIDs must match. It rejects these query/fragment forms on claim/admin paths, extra parameters, mismatched IDs and mixed write-review intent. After Auth consumes its fragment, the frontend restores the canonical `#review-<UUID>` and calls `review_detail` to confirm that the mapped guide owns a currently published review. No token or private draft belongs in the share URL.

## Hosted pre-change and rollback evidence

Read-only project metadata captured 2026-11-18 01:58 UTC: `/Users/sambezzant/environment-qa/20261117/rmg-hosted-prechange-catalog-full-20261117.json`, SHA-256 `8b1ec19a9eb9e0dd2deb3e21d6fb3f672f30aed90b5189a615147cc65399c2f4`. It contains owner, relation/view definitions, table/column ACLs, constraints, indexes, triggers and policies for affected relations, six relevant function definitions/ACLs, relevant role memberships and Storage policy/bucket metadata; it contains no user/customer rows or credentials. Query is `supabase/review-candidates/preflight-catalog.sql`. It is a targeted catalog capture, not a full database backup or proof of all unrelated dependencies. Earlier selected-catalog comparison matched the 2026-11-15 saved snapshot. Storage objects policy fingerprint was `d1bff72aa5c3aea7cfc08d607c774bf4`; recheck immediately before application.

The reviewed single-transaction candidate is `supabase/review-candidates/launch-combined.sql`, composed reproducibly from drafts 01, 02, 04 and 05; draft 03 requiring Storage-owner privileges is intentionally excluded. Its SHA-256 at this checkpoint is `0d89c00e1489c1f5e39bd794fe38ba80f602dbd97ddb2ddf0ab7b76bf8840237`. This is a review candidate, not yet a locally generated Supabase CLI migration or applied history. Its database gate defaults off. The data-preserving `emergency-disable.sql` SHA-256 is `770ee3d5baa678692fe5b6f067b45de6a7fcd47a2c5b9158ebc79cac9e580bfc`; after quiescing in-flight requests, it disables the gate and revokes application RPC execution while leaving rows, audit, declarations and the storage safeguard in place. 01 separately rolls back the served application deployment. It deliberately does not reinstate the old unsafe direct-write permissions or blindly drop new data. The captured metadata supports a separately reviewed catalog recovery if needed; do not claim an exact restore was exercised.

## v2.3 existing-schema field boundaries

After independent catalog review, `submit_claim.evidence` must contain 20–1200 trimmed characters. `edit_details` permits boat up to 250 characters, gear 500, expertise 500, species 350, and years 0–80 or null. Claimant name remains 2–120; business name remains optional string up to 160. These match or are narrower than existing hosted CHECK constraints, which are preserved. Invalid values receive 400 `invalid_input`. This corrects the earlier draft limits; no hosted constraint was broadened for claim or profile fields. Gear is 500 in both the observed hosted catalog and the synthetic fixture.

The successor incorporating v2.3 boundary corrections is `supabase/review-candidates/launch-combined.sql`, SHA-256 `7109b8fe19f05a87b3b3e5679405185112246adee69d198dcdd1e1b56db6f1f1`. The earlier 0d89c00 hash is historical and must not be applied. Exact successor CI and independent review are pending.

## Oregon identity seed proposal (separate from migration)

`supabase/review-candidates/oregon-mapping-seed.sql` is generated from the current tracked Oregon source by `assemble-oregon-seed.py`; it has no hardcoded hosted UUIDs. It joins each source registration to one published database row with exactly the same registration and derived slug, rejects any missing or duplicate database registration, rejects conflicting preexisting mappings, and inserts only absent pairs in one transaction. Its source snapshot hash is embedded in the file. An existing matching pair is retained; the seed must not be run until 01 and independent QA review the source snapshot, target, candidate and exact current database, and until the source count and hash are revalidated. This verifies which existing listing a source ID maps to; it does not verify ownership, the operator, or a current license. Washington remains individually unmapped. The separate synthetic seed fixture uses fictional IDs and tests idempotency, missing/changed registration and conflicting-map rollback; the current successor still needs its guarded CI run.

## v2.4 coordinated cross-state identity lookup

Each `my_submissions.items[]` retains the existing first `jurisdiction` and `source_id` fields and adds `identities:[{jurisdiction,source_id}, ...]`, containing all explicitly reviewed mappings for that same guide UUID, or an empty array if none. There remains one item per submission and pagination is unchanged. A frontend can match the exact current profile's jurisdiction and source ID against this array; names do not establish identity. This is not a claim that a person or license has been verified. Synthetic fixtures test two state aliases, unmapped submissions, duplicate/invalid mappings and cross-user isolation; the successor needs exact CI and independent review.

### v2.4 validation and release status (supersedes earlier pending notes)

01 and 05 reviewed the exact combined SQL SHA-256 `74afb69db957037086c0e5ffddd2a8d312bed4ded3e446ba3f145284a351686d` in disposable PostgreSQL, actual upstream Storage HTTP and local Supabase Auth/PostgREST. 05 independently inspected a passing browser-to-Next-to-local-service review journey on app `938f05c`; 01's subsequent app `6113cedbd5e0c46f2b64013476bb505fab95f0ca` requires its own browser pin. Hosted Auth, operator access, Storage mitigation and the migration have not been verified or applied. The transaction-owning runner body has SHA-256 `209c5fe39125ef17096941dac3c814c9e57b2e0b0be4789c9f49dc0510f34b9a`, and the emergency-disable body `769333a38e66d394b80fcd95a71bbc97130c1e3e6465322decb9d37eb44a3b5d`. Do not submit the explicitly wrapped review files as migration files. The current hosted preflight, local CI pins, exact limitations and data-preserving recovery sequence are maintained in `supabase/review-candidates/HOSTED-PLAN.md`.

## v2.5 additive review reporting and duplicate receipt

These additions require the separate reporting migration **after** v2.4. `POST /api/launch` uses the same confirmed-account Bearer authentication, server flag and DB gate as other writes.

- `{operation:"report_review",jurisdiction:"OR"|"WA",sourceId:string,reviewId:uuid,reason:"not_firsthand"|"harassment_or_private_info"|"other"}` returns `{id:uuid,status:"submitted",existing:boolean}` only after the database returns a valid persisted receipt. It accepts only a currently published review of the mapped guide. There is no free-text report field. Repeating the same account/review returns the existing receipt without changing its reason or reopening a resolved report; the UI can say it was already reported. Ten new distinct reports per confirmed account per rolling 24 hours are allowed; retries remain available. This is not an IP limit or a guarantee against account creation abuse.
- `{operation:"operator_queue",kind:"report",offset,limit}` returns `{items,offset,limit}` to an authorized moderator. Items contain `id`, `review_id`, `reason`, `created_at`, `review_status`, `public_review_body`, `guide_name`, `jurisdiction` and `source_id`. Reporter identity is omitted; `public_review_body` is null when the review is no longer public. Legacy reason values may predate the three new categories.
- `{operation:"resolve_report",id:uuid}` returns `{id,status:"resolved"}` only after persistence. Only a site admin who is not the reporter, review author or approved owner of that guide may resolve it. Resolution records actor/time and an audit event; it never changes review content, publication status or rating. Already resolved reports return 409 `conflict`.
- A confirmed existing review by the same author on the same mapped guide returns HTTP 409 `{error:"duplicate_review"}`. Other conflicts remain `{error:"conflict"}`; connection failures remain unknown outcomes. Status of an existing report/review is not inferred from a network error.

Reporting uses the existing private-by-RLS `public.review_flags` table; public/anon/authenticated direct access is revoked. Invalid input returns 400, unavailable target 404, unauthorized role 403, unauthenticated 401, report limit 429, and service failures 503. It does not auto-hide reviews. No new report feature is live until 01 integrates it and the additive migration is applied and independently verified.

## v2.6 trip month, own-review recovery and write readiness

This successor requires the separate v2.6 migration **after** v2.4 and v2.5. Existing SQL RPCs remain present for compatibility. The application handler uses the new named v2 submission RPCs; deploy it only with the required DB functions and the existing launch gates.

- `submit_review` and `submit_revision` accept optional `tripMonth`: `"YYYY-MM"` with year 0001–9999 and month 01–12, or `null`. It is stored as the first day of that month in the existing `reviews.trip_month` date field; public review reads return a date such as `"2026-07-01"`. No day, firsthand verification or timezone is inferred. Omitted/null on a new review means no month. On a revision, **omitted preserves** the published month, **null clears** it, and a month replaces it only after approval. The moderator revision queue includes `trip_month` and `trip_month_specified`. Pending/rejected revisions never change the published month or rating.
- Authenticated `{operation:"own_review_for_guide",jurisdiction:"OR"|"WA",sourceId:string}` returns `{review:null}` when the actor has no review of that mapped guide, otherwise `{review:{id:uuid,status:"pending"|"published"|"rejected"|"removed"}}`. It returns no content or other user's data. Unmapped guides and service failures remain errors, not empty results. Use this lookup after `duplicate_review` or an uncertain submission instead of guessing or searching paginated history.
- Public `{operation:"review_write_availability",jurisdiction:"OR"|"WA",sourceId:string}` returns `{available:boolean}` only after checking the mapped guide, server/DB gates, database read-only/recovery state and v2 submit-function execution grants. A missing mapping, failed check or unavailable service is an error, not availability. This is an **advisory readiness check**, not proof that Auth email delivery, capacity or a later write will succeed. 01 must fail closed on false or errors and clear write/share/QR availability after a `launch_unavailable` or `service_unavailable` write failure. A network-unknown outcome must remain unknown; neither readiness nor a public-read response is a submission receipt.

## Final integration examples and migration pin

`POST /api/launch` takes JSON; authenticated operations also require `Authorization: Bearer <confirmed-user-session>`. Example requests and responses (IDs and guide source are fictional):

```json
{"operation":"submit_review","jurisdiction":"OR","sourceId":"fixture-one","quality":5,"body":"Good trip","firsthandAttested":true,"relationship":"none","tripMonth":"2026-07","tripResponses":{"version":1,"answers":{"dog_present":{"state":"answered","value":false},"effort":{"state":"not_applicable"}}}}
{"id":"30000000-0000-0000-0000-000000000001","status":"pending"}
```

```json
{"operation":"report_review","jurisdiction":"OR","sourceId":"fixture-one","reviewId":"30000000-0000-0000-0000-000000000001","reason":"not_firsthand"}
{"id":"40000000-0000-0000-0000-000000000001","status":"submitted","existing":false}
```

```json
{"operation":"operator_queue","kind":"report","offset":0,"limit":10}
{"items":[],"offset":0,"limit":10}
{"operation":"resolve_report","id":"40000000-0000-0000-0000-000000000001"}
{"id":"40000000-0000-0000-0000-000000000001","status":"resolved"}
```

```json
{"operation":"own_review_for_guide","jurisdiction":"OR","sourceId":"fixture-one"}
{"review":{"id":"30000000-0000-0000-0000-000000000001","status":"pending"}}
{"operation":"review_write_availability","jurisdiction":"OR","sourceId":"fixture-one"}
{"available":true}
```

An actual duplicate returns HTTP 409 `{"error":"duplicate_review"}`; an unrelated conflict returns HTTP 409 `{"error":"conflict"}`. A disabled gate returns HTTP 503 `{"error":"launch_unavailable"}` and an unavailable dependency HTTP 503 `{"error":"service_unavailable"}`. An unknown network result has no receipt: recover with `own_review_for_guide` rather than fabricating a success or a duplicate. A report success can be shown only when its validated persisted receipt arrives.

The preferred unapplied one-transaction runner body combines v2.4, reporting and v2.6 in that order: `supabase/review-candidates/final-launch-migration-body.sql`, SHA-256 `e76030edd1cfe5d9b61ef48cf8132a96536f01f13e3030016890ab549b076f78`. It supersedes the older v2.6 hash `c0c7c4...`, whose readiness check did not test authenticated private-schema usage. `supabase/review-candidates/HOSTED-PLAN.md` records preconditions, alternate ordering and data-preserving recovery; 01 alone executes hosted changes.


## v2.7 moderator queue response (additive)

`operator_queue` with `kind: "review"` now returns the persisted optional `intensity` (integer 1–5 or null) and `would_book_again` (boolean or null) on each initial-review item, alongside existing `trip_month` and other fields. This adds response keys only; request and error shapes are unchanged. The security-invoker view, moderator predicate, existing grants and row-level policies are unchanged. False and null remain distinct. Revisions already include these answers. This successor migration needs fresh independent review; the older SQL hash `9495e7bc…` does not contain this correction.

Example: `{"operation":"operator_queue","kind":"review","offset":0,"limit":10}` → `{"items":[{"id":"30000000-0000-0000-0000-000000000002","intensity":4,"would_book_again":false,"trip_month":null}],"offset":0,"limit":10}` (item abbreviated). Non-moderators receive HTTP 403 `{"error":"forbidden"}` via the handler.
