# RateMyGuidePNW — Phase 1 Starter

Independent Pacific Northwest fishing-guide review directory built with Next.js, TypeScript and a Supabase PostgreSQL migration.

**Pre-launch demonstration:** All displayed guides, ratings and reviews are fictional fixtures. Public submissions and payments are disabled. Do not publish the demo as a real reputation index.

## Local start

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## Routes
- `/` — landing page
- `/guides` and `/guides/[slug]` — guide directory and profiles
- `/waterways` and `/waterways/[slug]` — fishery pages
- `/reviews` — demo review feed
- `/about` — mission

The database is not yet connected. Do not expose any Supabase service role key in the browser.
