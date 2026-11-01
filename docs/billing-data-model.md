# Billing, analytics, and research schema

Applied to Supabase project `kdzwyjizvskyonjrrogt` on 2026-11-01 as migration `billing_history_analytics_and_research_consent`.

## Billing architecture
- `billing_plans`: plan catalog; proposed Captain Plus $29/month.
- `plan_price_history`: effective-dated historical rates.
- `guide_subscriptions`: Stripe/manual subscription status, renewal date, billing period, amount, and cancellation.
- `billing_events`: provider event IDs for idempotency, invoice references, state transitions, amounts and timestamps.
- No active subscription, payment processing, Stripe webhook, or charges have been activated. Payment status must be reconciled against signed provider events.

## Analytics
- `analytics_events`: privacy-minimized guide/product interactions, 90-day default expiry. Event instrumentation and automatic retention cleanup are still TODO.
- `guide_research_snapshots`: aggregated guide quality trends and source/region/species information by month. Aggregation jobs are TODO.
- `reviewer_research_preferences`: opt-in research and separate opt-in model-training permission with withdraw fields. No research/model-training data pipeline exists.
- Sensitive financial records, analytics events, and research snapshots are RLS-protected with no client-visible policies. Admin/server access should remain server-side only.
- Neither raw email nor IP addresses nor reviewer identities should enter the analytics/research tables. Private user IDs in `reviews` are for abuse prevention, not public display.

## Authentication and review uniqueness
Migration `prevent_duplicate_reviews_per_captain` applies a unique index on `(guide_id, author_id)`; users cannot create multiple reviews of one guide by changing the trip month. Account farming requires additional fraud controls (rate limits, email verification, review moderation, incident process). Google login also requires enabling the Google OAuth provider in Supabase and configuring Google OAuth credentials; UI code alone cannot activate it.
