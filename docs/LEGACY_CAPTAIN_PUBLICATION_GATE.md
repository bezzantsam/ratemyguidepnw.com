# Public captain details and media: legacy write paths closed

## Why this is a launch-security fix, not a redesign

In the stacked RateMyGuidePNW release candidate, `components/CaptainDetails.tsx` previously let approved claimants directly `upsert` into `public.guide_details`. The public profile read that same table without checking a separate publication decision. `components/CaptainMedia.tsx` similarly uploaded directly to the `guide-photos` Storage bucket and inserted/deleted `public.guide_media`, then displayed results directly. These paths were separate from the new pending captain fleet proposals, human-reviewed diff UI, and source-provenance model.

An approved account claim is evidence of permission to submit profile edits; it is NOT approval for every future vessel/safety claim, photograph, marketing caption or welcome video. Since the Supabase project remains **inactive** and the checked-in `0002_captain_media.sql` is only a pointer to a past migration, we cannot currently verify the deployed grants, bucket ACLs, publication status or content moderation.

## What this PR changes

- The public `CaptainDetails` and `CaptainMedia` components now render read-only, accessible explanation panels. They have **zero Supabase client reads/writes**, zero Storage reads/uploads/deletes, no owner-update controls and no third-party embeds. Public profiles continue displaying their imported-source facts, independent source-backed waterway enrichments, trust panels, approved-review reader, and owner-claim entry point.
- The existing `CaptainFisheryEditor` on the claim page remains the only structured captain-supplied fleet/season intake proposal path. Its browser-side owner check is UX only; the proposed unapplied database RLS and server-authorized moderation remain necessary for actual security.
- Existing legacy database rows and stored media are NOT deleted, altered or migrated. This frontend gate simply declines to display them until trustworthy publication provenance is established.
- This is a DRAFT change, not a live site change. **No production migration**, Supabase restoration, S3/storage changes, DNS change, app-store release or merge has been made.

## Requirements to safely restore rich captain biographies and galleries

1. Owner approval to restore the inactive Supabase project, then **read-only** inventory of the real live `guide_details`, `guide_media`, Storage buckets, grants, RLS policies, roles, triggers, source tables and migration history. Do not assume the 0001/0002/0003 source files exactly match deployment.
2. A server-authorized private proposal intake and media-quarantine storage workflow: authenticated claimant may submit with an **approved and non-revoked** claim, but may not update published fields or set moderator/approved flags. Storage credentials and bucket policies must not grant public access to submitted-but-unreviewed photos.
3. A human moderator identity and roles, independent of user-editable profile metadata. Provide image/file type and size checks, malware and abusive-content procedures, ownership/license-to-publish attestation, caption and sensitive-contact screening, copyright complaint workflow, and moderation rate limits. A captain's upload approval is separate from ownership verification.
4. Append-only audited reviewer decisions with submitted/approved/rejected versions and rollback/history. Published content should reference a specific approved immutable revision; a future owner edit must not overwrite it.
5. A published-only public read API or Postgres view with correct grants and **`security_invoker = true`** on Postgres 15+, or an equivalently hardened server-only read layer. A public storage URL should be generated only for an actually approved object; storage object names must not be treated as authorization.
6. **Staging** role and permission tests against a disposable database with real JWTs, including anonymous users, unknown captains, approved owners, revoked claims, other owners, moderation actors, URL guessing, direct Data API requests and Storage attacks. Manually smoke-test source profiles before enabling public media.
7. Clear consent and licensing for each captain-provided image, bio, business detail and video embed; privacy notice and appropriate correction/takedown process.

## Relationship to the launch plan

The first closed beta can still use source-backed imported directory facts and manually reviewed captain fleet proposals. Rich captain-media publication should not bypass that system just because legacy tables exist. This removes a release blocker while preserving the model for reintroduction once backend security is proven.

### Verification

```sh
npm run test:captain-publication
npm run check
```

Automated tests assert the two public components do not import Supabase, call CRUD/storage methods, expose a media/player embed, or allow public editing; they render honest accessible placeholders; source facts, claim pages and pending-only fleet editor remain present.
