# ADR: Review-first RateMyGuidePNW
Date: 2026-11-17 (America/Los_Angeles)
Status: Approved product direction; implementation queued after active handoffs.
Authority: Sam's architecture directive and subsequent clarification that rating a guide is primary.

## Product decision
RateMyGuidePNW is a fishing-guide rating and review platform with a supporting directory.
Primary journey: Find the guide you fished with -> Rate your guide -> Submit -> Receive an accurate receipt.
Reading reviews and discovering a guide are supporting journeys. Captain profile claims are secondary.
This supersedes any interpretation that guide discovery or captain acquisition is the primary conversion.

Homepage's main action: "Rate your guide", opening the existing searchable guide selector and preserving the chosen stable guide identity through sign-in and submission.
Navigation: Write a Review, Find a Guide, About. Reading reviews is prominent on profiles. Profile claiming is a secondary contextual action.
Keep browsing and reading published reviews available without authentication. Reuse the existing safe authentication architecture for writing; email confirmation does not verify a fishing trip.

## Scope and protection
Record now; do not interrupt active workers, reset branches, delete worktrees, force-push, redesign schemas in parallel, or deploy unfinished features.
This documentation change does not authorize implementation, data publication, purchases, deployment or immediate reassignment of all eight workers.
Preserve existing directory functionality, stable IDs, source provenance, licensing evidence and verification infrastructure.
Review submission is P0. Existing claim, sharing, optional trip-answer and review-edit work must survive; reconcile after handoff.
Optional detailed trip questions use progressive disclosure and never obstruct a short basic review.

## Required customer experience
Required: stable guide relationship, 1–5-star rating, written firsthand experience, safe submission, persisted confirmation, moderated publication, accurate aggregate ratings, spam/duplicate protection, reporting/moderation, privacy and database authorization/RLS.
Optional: trip date and species. Preserve missing, not applicable, false and zero semantics.
Never invent reviews or ratings. A verified account, approved profile claim and independently verified trip are different facts.
Only supported published reviews contribute to public aggregates. Pending edits retain the existing published version until a moderation decision is persisted.
Mobile: readable text, clear labels and contrast, large touch targets, short forms, simple search/filters, actionable errors and clear pending/published states.
No instructions should be necessary to discover the rating action.

## Navigation and content plan
Remove Dock Talk, About the Listings, verification education and unnecessary banners from navigation and promotional surfaces.
Remove "Real trips. Real talk." and all Chrome.ai research/intelligence promotion from RMG.
About copy, exactly:
"RateMyGuidePNW helps anglers find fishing guides, read reviews, and share their experiences. Our goal is to make choosing a fishing guide easier and more transparent."
Keep necessary trust disclosures brief and contextual. Simplification must not imply licensing or trip verification.
Audit old /intel routes as well as navigation. End public RMG research exposure in a reviewed route disposition, preserving scientific code/data/history separately; never redirect to an invented Chrome URL.
Claims remain accessible from the relevant profile without competing with the main rating action.

## Inspection and current work
Read-only GitHub inspection at this checkpoint:
- PR120 frontend/integration head: afec3e38403092f46ccbdef742b520ed69ac36dd; base coordinator/rmg-launch-prep.
- PR121 test-only backend head: 426a25a0e016ded83560925955bb4e9fcc5b7ffb; not an accepted migration or deployable release.
- PR bodies can lag branch heads; commit-pinned code and checks govern acceptance.
- Mac worktrees, uncommitted files and actual runtime status were not inspected from this workspace.
- User's latest reports show 01 integration and 06 backend active; 05 QA waiting for a fixed candidate; 04 coordinating; other agents own Chrome, permits, Washington and copy.
- Existing About page still contains the slogan, fisheries-intelligence positioning and Chinook research; removal is required.
- Existing read-only launch handoff describes a historical release stage and cannot be used as acceptance of working reviews.

## Existing implementation to reuse
- components/launch/GuideEngagement.tsx, SubmissionViews.tsx, PublishedReviews.tsx, TripDetails.tsx, ModerationQueue.tsx, AdminConsole.tsx: engagement, forms, optional details, reviews and operator UI.
- components/launch/submission-model.ts and trip-responses.ts: validation and versioned answer semantics.
- app/api/launch/route.ts and lib/backend-launch/: server authorization/validation boundary.
- lib/launch-client.ts: frontend contract adapter.
- docs/backend-launch-contract-06.md: evolving backend wire contract; reconcile latest appended version.
- supabase/review-candidates/: proposed lockdown, API, revisions, upload/storage restrictions and rollback SQL. Proposals are not proof of hosted execution.
- tests/backend-launch/: SQL, handler, validation, storage and rollback evidence.
- app/guides and existing registry data: preserve directory and stable jurisdiction/source identifiers.

## Required gap assessment after handoff
Confirm current contract compatibility; map actual directory identifiers to database guides without guessing.
Verify anonymous published-review reads, optional date/species storage, short review compatibility, duplicate/lost-response handling, abuse controls and reporting workflow.
Confirm author and moderator identities, Auth redirects, published-edit behavior, aggregates and no cross-user access.
Audit hosted schema drift, Storage restrictions and all publicly callable interfaces; synthetic SQL is supporting evidence only.
Inspect UI mounting and feature gates before calling components available. Verify production domain configuration.

## Migration and dependency risks
06 owns schema, server API and candidate SQL; no competing migrations.
01 owns application integration and client contract. Nullable optional fields and confirmed moderation receipts must agree across both sides.
Identity mapping and moderator provisioning are prerequisites for the relevant live journeys.
Storage-policy alternatives require independent validation against actual policy behavior, not a fixture-only inference.
Legacy read-only tests need intentional replacement where approved functionality changes; preserve their security assertions.
Claims, Washington expansion and optional detailed questions must not create an unnecessary dependency for a safe basic review path.

## Proposed eight responsibility areas (future cycle only)
| Area | Scope | Existing owner/constraint |
|---|---|---|
| 1 Coordination | Architecture, dependency map, integration queue | 04 coordinates; 01 is sole RMG merge owner |
| 2 Database | Schema, migration, RLS, transactional aggregates | 06 retains ownership |
| 3 API and abuse | Server API, validation, throttling, duplicate receipts | 06 currently owns; delegate only after explicit file boundary |
| 4 Profile reviews | Published display, aggregate rendering, empty states | 01 currently owns; split only after fixed contract |
| 5 Mobile/navigation | Primary rating flow, simplified About/nav, accessibility | Assign available UI worker after 01 handoff; preserve owned files |
| 6 Moderation/reporting | Operator workflow, abuse reports, edit decisions | Split client to 01 and server to 06 until explicit reassignment |
| 7 Acceptance | Browser journeys, mobile, accessibility, authorization | 05 coordinates independently authored checks |
| 8 Release audit | Final diff, evidence, hosting/rollback readiness | Independent reviewer other than implementation owner; no merge authority |

These are work packages, not an instruction to commandeer Chrome or permit workers.
04 proposes actual people/threads after current assignments finish. Never give overlapping files to concurrent writers.

## Ordered backlog and release gates
P0-A: Capture current handoffs and exact donor commits; preserve branches; agree one backend/client contract.
P0-B: Complete reusable review persistence, identity mapping, access rules, moderation and accurate aggregate behavior.
P0-C: Integrate the short rating-first journey and persisted receipt; optional trip date/species remain optional.
P0-D: Simplify mobile homepage/nav/About and remove RMG research surfaces without deleting evidence infrastructure.
P0-E: Complete reporting, abuse and duplicate defenses; test author/moderator/anonymous/captain permissions.
P0-F: Fixed integrated candidate: clean dependency install, typecheck, build, meaningful unit/integration tests, tested migration/rollback, independent DB authorization checks and desktop/mobile browser acceptance.
P0-G: Verify real hosted authentication, persistent review read/write/moderation, domain/redirects, private-data isolation, operator access and rollback readiness.
Only 01 merges coordinated branches after release gates pass. This directive itself does not authorize deployment.
Postlaunch: richer optional trip questions, growth experiments, additional discovery content and captain enhancements.

Acceptance examples: a phone user finds the correct listing, rates it, signs in without losing intent, submits once and receives the persisted pending state; moderation publishes to that guide and updates the count correctly; retries do not duplicate; rejected/removed/pending content never changes the public score; captains cannot change independent reviews; reading requires no login.

## Implementation handoff
No new implementation prompts are issued by this commit. 04 should incorporate this ADR into the existing board after current handoffs and point subsequent tasks here.
