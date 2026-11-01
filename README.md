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
