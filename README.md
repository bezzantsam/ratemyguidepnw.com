# RateMyGuidePNW — Phase 1 Starter

Independent Pacific Northwest fishing-guide review directory, built with Next.js App Router, TypeScript, and a Supabase PostgreSQL migration.

**Pre-launch product.** The directory now contains real Oregon and Washington registry-source listings, but they are **not** current license verification, confirmed guide endorsements or proof of Buoy 10 Chinook operations. The site includes Supabase-backed review/auth/moderation components; production readiness, review authenticity and administrator bootstrap still require validation. No fictional ratings are passed off as real. This repository is PUBLIC: never commit credentials.

## Local development

```bash
npm install
npm run typecheck
npm run dev
# Open http://localhost:3000
npm run build
```

**Build integrity:** `npm run check` runs the Chinook public-release evidence tests, TypeScript check and production build. The directory uses static registry records, while live published-review components use their separate Supabase project when configured.

## Routes

- `/` — landing page with sample waterways and review feed
- `/guides` and `/guides/[slug]` — directory and sample guide details
- `/waterways` and `/waterways/[slug]` — fishery directory
- `/reviews` — fictional review feed
- `/about` — mission and pre-launch status

## Database

`supabase/migrations/0001_initial.sql` provides initial region, waterway, guide, review, identity-claim and moderation tables with read-only public RLS policies, plus rating-refresh logic. Review migration, roles, definer functions and policies with a database/security engineer before deploying to production. No browser-side insert/update/delete policies are provided by design.

## Next milestones

1. Validate CI and Vercel preview of the Chinook Intel page without private Chrome-AI credentials.
2. Finish real user authentication, review submission and moderator/administrator acceptance tests; enhance fraud safeguards and human escalation.
3. Review the production security checklist and choose a commercial-compliant Vercel plan before charging.
4. Separately authorize an approved aggregate-data release pipeline from private Chrome-AI, never direct database merging.
5. Only then consider GoDaddy DNS changes. Do not point the custom domain at unfinished review or research experiences.

No API keys or secrets are committed. Only `.env.example` placeholders are included.

## Oregon registry integration (2026-11-01)

The web directory now reads `lib/oregon-guides.json` with **1,027** unique registrations extracted from the uploaded `oregon_fishing_guides.csv`. Fields retained in this public repository: name, registration ID, business name, website as unlinked text, service areas, activity, and CSV registration status. No phone numbers or emails are committed. The directory supports client-side search by name, outfit, registration and service area. Each guide has a stable individual page under `/guides/og-...` and a draft 'Are you this captain?' message. No ownership claim function is active.

**Important:** this is a static JSON-backed registry directory, not a Supabase database import. The uploaded file's ACTIVE status is not real-time license verification. The original CSV's service areas are broad regulatory regions, not evidence a guide fishes a particular named river. Review functionality, ratings and captain verification are not live.

Deployment and build validation are pending Vercel/Supabase connection and a network-enabled build environment.

## Chrome-AI × RateMyGuidePNW Chinook Intel V1 (November 13, 2026)

The site now has a source-backed, methodology-only **[Buoy 10 Chinook Intel](/intel/buoy-10-chinook)** page. It displays the first five actual WDFW preliminary sample days from August 2026, the official source and count denominators, a 2027 seven-day forecast evaluation disclosure, and a searchable subset of real Lower Columbia River-area registry listings. **No private 2027 model predictions, unreviewed scoring claims or fabricated guide reviews are displayed.**

The core Chrome-AI repo, models and forecasts remain **private and separate**. See [the integration design](docs/chinook-intel-integration.md). The website presents approved public evidence alongside a completely separate customer-review trust lane.

### Approved historical Chinook expansion

The August 2026 WDFW report has now been independently compared against the original archived source (all 31 dates and sampled totals), and the August 25 hatchery-Chinook rule was cross-checked against Washington's emergency order. The extended **1,373 retained Chinook / 5,087 sampled anglers** sample table is in a **separate, SHA-pinned, reviewed 2026 dataset** for production. The source bot's continuously updated review PR remains open; new agency changes never replace this public historical release automatically. This remains **preliminary agency sample data**, not individual catch odds or verified 2027 ML performance. See [audit details](docs/chinook-2026-source-audit.md).
