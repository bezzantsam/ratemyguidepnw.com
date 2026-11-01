# RateMyGuidePNW — Phase 1 Starter

Independent Pacific Northwest fishing-guide review directory, built with Next.js App Router, TypeScript, and a Supabase PostgreSQL migration.

**Pre-launch demonstration.** All displayed guides, review counts, ratings, and reviews are entirely fictional. This repository is PUBLIC; do not commit credentials. The public review submission system, real guide authentication, moderation workflow, payment system, analytics and live database queries have NOT been implemented.

## Local development

```bash
npm install
npm run typecheck
npm run dev
# Open http://localhost:3000
npm run build
```

**Build status:** Not yet verified in this environment. Confirm npm install, typecheck, and build before deploying. The current site uses local fictional fixtures rather than Supabase.

## Routes

- `/` — landing page with sample waterways and review feed
- `/guides` and `/guides/[slug]` — directory and sample guide details
- `/waterways` and `/waterways/[slug]` — fishery directory
- `/reviews` — fictional review feed
- `/about` — mission and pre-launch status

## Database

`supabase/migrations/0001_initial.sql` provides initial region, waterway, guide, review, identity-claim and moderation tables with read-only public RLS policies, plus rating-refresh logic. Review migration, roles, definer functions and policies with a database/security engineer before deploying to production. No browser-side insert/update/delete policies are provided by design.

## Next milestones

1. Verify a clean Next.js build and install dependencies.
2. Create Supabase project and test schema; connect server-side database queries.
3. Implement authentication, review submission, anti-abuse safeguards and human escalation before opening real reviews.
4. Set up an appropriate Vercel commercial plan and preview deployment.
5. Replace fictional profiles with vetted directory records, carefully distinguishing listed and verified guides.
6. Only then consider GoDaddy DNS changes. Do not point the domain at demo data.

No API keys or secrets are committed. Only `.env.example` placeholders are included.

## Oregon registry integration (2026-11-01)

The web directory now reads `lib/oregon-guides.json` with **1,027** unique registrations extracted from the uploaded `oregon_fishing_guides.csv`. Fields retained in this public repository: name, registration ID, business name, website as unlinked text, service areas, activity, and CSV registration status. No phone numbers or emails are committed. The directory supports client-side search by name, outfit, registration and service area. Each guide has a stable individual page under `/guides/og-...` and a draft 'Are you this captain?' message. No ownership claim function is active.

**Important:** this is a static JSON-backed registry directory, not a Supabase database import. The uploaded file's ACTIVE status is not real-time license verification. The original CSV's service areas are broad regulatory regions, not evidence a guide fishes a particular named river. Review functionality, ratings and captain verification are not live.

Deployment and build validation are pending Vercel/Supabase connection and a network-enabled build environment.
