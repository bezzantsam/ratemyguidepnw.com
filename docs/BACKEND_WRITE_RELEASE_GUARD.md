# Live backend write release gate — blocked until reconciled

**Status: INACTIVE / NO PRODUCTION SCHEMA CHANGES**

The directory pages can render without a live writable backend. Captain-claim and review forms must not imply that submissions work when the deployed Supabase schema differs from the client contract.

## Read-only database inventory (2026-11-14)

The connected RateMyGuidePNW project was inspected using SELECT-only SQL and schema/policy inventories. No sensitive row values or customer identities were exported.

| Backend contract | Observed |
|---|---|
| Imported guide records | Present and marked published as directory listings |
| public.public_angler_reviews | Present |
| public.request_guide_claim(uuid,text,text,text) | **ABSENT** |
| public.reviews.firsthand_attested | **ABSENT** |
| public.reviews.intensity | Required NOT NULL |
| public.guide_fishery_proposals | **ABSENT** (proposal is staging-only) |
| Pending-review insert policy | Exists, but does not enforce new firsthand-attestation requirement |
| Review and claim rows | None present at time of inspection |

The proposal at supabase/proposals/claim_review_pending_staging_only.sql addresses several of these gaps but remains an **unapplied staging design draft**. It was NOT executed in this work.

Existing live grants and SECURITY DEFINER admin functions need their own real-JWT role and authorization review. A green Next.js build does not establish database user security.

## Runtime behavior

lib/backend-write-availability.ts is server-only. It exposes independent review, claim, and captain-fishery proposal capabilities, all **false in source code**. Even an accidental deployment environment opt-in cannot enable either until a code review changes the corresponding approval.

- Oregon and Washington guide pages continue reading published reviews, but disable the review submit action and review invitation controls.
- The review wizard remains inspectable as a UI preview with an explicit non-live message. It cannot call the write endpoint while disabled.
- Captain claim forms remain visible as previews but cannot call the missing claim RPC or trigger form-related sign-in while disabled.
- The captain's boats/seasonal trips editor remains available as a local draft, but cannot submit rows into the absent guide_fishery_proposals table.
- This UI gate is **not an authorization boundary**. Actual grants, RLS, database transactions, moderator checks and rate limits remain required.

## Required activation sequence (NOT PERFORMED)

1. Reconcile the live migration history, database columns, RPC grants, RLS policies and security-invoker views with the staging proposals. Never replay the old 0001 scaffold or a proposal blindly.
2. Create and test a reconciled migration in isolated staging with the current CLI workflow.
3. Run real JWT tests for anonymous, author, another user, claimant, guide owner, moderator, and admin. Check private evidence access and forbidden status/timestamp edits.
4. Confirm actual end-to-end submissions and moderation: author submits, pending stays private, human moderator approves or rejects, and only the correct published guide displays the published review.
5. Only after owner signoff and deployment, change the appropriate source-code review, claim or fishery proposal approval in a reviewed PR, then set server-side environment variable RMG_BACKEND_WRITE_RELEASE to exactly explicitly-reviewed-live-rls-and-jwt.

Do not use NEXT_PUBLIC for release activation. Review and claim write controls are independent. Do not deploy, create payment infrastructure, publish guide claims, merge draft PRs, or expose private research data as part of this gate.
