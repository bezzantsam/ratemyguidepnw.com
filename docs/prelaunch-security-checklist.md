# RateMyGuidePNW — prelaunch security and operations

## Implemented
- Private moderator queue at `/admin`; the logged-in account must be in `public.site_admins`. No user can add themselves using public API keys.
- Admin-only database RPC decisions; review approval sets publication timestamp, claim approval unlocks owner editing. All decisions generate `moderation_audit` entries.
- Private claim evidence from authenticated claimants, shown to operators only.
- Reviewers cannot publish their own reviews, submit a second review of a guide, review their own approved profile, or exceed 3 new reviews per rolling 24 hours.
- Public reviews exclude author ID. Published-review views are security-invoker, subject to RLS.
- No uploaded ID documents should be collected in claims. Verify independently using established business contacts and callback or domain evidence.

## Required before public launch
1. **Bootstrap administrator**: First sign up at the site using a trusted email; locate the matching auth.users UUID in Supabase Authentication. As a trusted database administrator, insert that UUID into `public.site_admins` in Supabase SQL editor. Never create a public admin self-registration path. Test a second unprivileged account is denied.
2. **Enable authentication providers**: Supabase Auth URL configuration: Site URL `https://ratemyguidepnw.vercel.app`, redirect allowlist for site and future custom domain; Google OAuth needs Google Cloud client ID/secret configured in Supabase. Complete a real OAuth and email login test.
3. **Protect against bot floods**: CAPTCHA/Turnstile on submissions; IP-aware server-side rate limits behind a privacy-preserving proxy; review/claim/account abuse alerts, account farming detection, suspicious duplicate text. The current per-user review limit alone is not sufficient.
4. **Review policy**: clear rules for honest firsthand reviews, disclosures for material connections, refusal of threats/doxxing, appeals and takedown requests, human moderation, evidence retention, fair treatment for both positive and negative reviews, and a mechanism to investigate fraudulent coordinated reviews. Develop legal/privacy/TOS policies for Oregon and Washington, including FTC review regulations and consumer privacy.
5. **Data lifecycle**: Delete/retention policies for private user information, claims and anonymous session hashes; operational backups, recovery tests and audit-log retention. Prevent leaking emails/private account identifiers in logs.
6. **Subscription launch**: Stripe account, products/prices and verified signed webhooks, idempotent reconciliation, trial/upgrade/downgrade/cancellation flows, access entitlements and billing support. Database tables alone don't activate subscriptions.
7. **Content validation**: Scan/moderate uploaded images, strip sensitive metadata, check copyright and safe content; monitor link changes and uploaded content.
8. **Testing**: Cross-state duplicates, search suggestions, auth redirects, claim denials, approval and role change, moderation queue, published review score aggregation, mobile layout/accessibility and actual emails.
9. **Domains**: Move GoDaddy domain only after testing. Note that Vercel Hobby plans have non-commercial use restrictions; upgrade to an appropriate plan before charging.
10. **Research/privacy**: Only opt-in private data for model training, aggregated trends by default; consent withdrawal handling, minimization and security review.

## Operations
Supabase project: `kdzwyjizvskyonjrrogt`. Vercel project: `ratemyguidepnw`.
Migration names: `admin_review_and_claim_moderation`, `admin_pending_queue_views`, `private_claim_evidence_and_review_throttle`. The live database schema is source of truth pending migration file synchronization.

**Important**: Admin actions are technically available, but no site admin has been bootstrapped yet. Do not imply /admin is usable by the operator until the authorized user ID is inserted.
