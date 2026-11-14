# RateMyGuidePNW weekend integration — review candidate, NOT authorized for launch

This single draft branch brings the previously separate, individually tested feature lines together. It is NOT deployed and should not be merged solely because GitHub Actions is green.

## Included code

| Feature origin | Integration status | What exists | What remains |
|---|---|---|---|
| Draft PR #34 (combining #23, #27, #30, #33) | Included | Mobile install manifest/icons, offline-only PWA, Saved Guides, progressive review composer, stable Washington directory URLs | Real iOS/Android smoke test, review DB RLS and moderation |
| Draft #36 | Included | Four source-linked Oregon alias + advertised-water pilot records | Full source recency audit, moderator correction flow |
| Draft #42 | **Integrated from sibling branch** | Explicit captain identity non-merges, limited shared-outfitter relationships, WA third-party provenance labels | Manual review of uncertain legacy OR/WA suppressed listings and actual identity checks |
| Draft #38, then #40 | Included | 1–4 named boats, 1–8 seasonal trip packages assigned to boats, own-claim-based pending proposal contract | **Unapplied** SQL, working auth, staged JWT/RLS tests, review service |
| Draft #44 | Included | Pure before/after moderator diff and explicit human review risk flags, fake dev-only inbox | Real server-authenticated moderator role, protected database read/approve/publish, audit ledger |

## What a green CI build means

- All committed static/behavioral tests run together.
- TypeScript compiles and Next.js production assets build.
- Development moderator route `/admin/inbox` returns a 404 in production and uses synthetic sample data when run locally.
- No changes to live data are implied. All review/claim/proposal DB SQL remains **unapplied**.

## Non-negotiable launch gates

1. **Backend connection and real policy tests:** The last-known RateMyGuidePNW Supabase project was inactive. Do not reactivate it without owner approval. Inspect actual deployed schema and existing RLS/grants first, compare the proposed SQL migration to reality, and test owner/non-owner/anon/revoked claimant/forged-review-state scenarios using real JWT-backed roles in isolated staging. Static regex assertions are NOT enough.
2. **Moderator authority and publication:** A user-facing review submission or captain proposal must be pending-only. Do not publish anything until separate protected moderator actions, a durable approval/audit history and a published-profile read layer exist and are exercised end-to-end.
3. **Credential/provenance honesty:** Historical registration import != current license; a domain match or account claim != official credentials; shared outfitter != same person; captain-submitted fisheries != independently checked. Do not merge identity pairs from names/brands alone, and do not claim trips are verified based on ordinary reviews.
4. **Source accuracy:** Research pilot entries have linked operator or directory pages but still need recency correction and an explicit editor review. Unknown locations get no invented Buoy 10 tags.
5. **PWA/device:** Install and uninstall on real iOS Safari and Android Chrome at HTTPS preview, verify 192/512 icons, bottom tabs, no private cache entries, offline fallback and relaunch; no App Store binary is created.
6. **Security/abuse:** Rate-limit submissions, build human moderator queue, test XSS/long strings, PII suppression, safe response emails and account claim disputes. Avoid exposing roles through user-editable metadata.
7. **Integration merge hygiene:** This draft aggregates the PR branches listed above. If this PR is approved for merging, reconcile or close the original draft PRs **only after** it merges; do not inadvertently merge the same changes twice or lose a later bugfix on source branches. Review changed files and pin commit before approval.
8. **Chrome-AI is separate:** No unapproved Chrome-AI candidate release, local-preview data, secrets, models, or research engine belongs in this public directory. Chrome-AI PRs #13/#15/#17 remain their own review gates.

## Integration checks

```sh
npm run check
node --test tests/guide-trust.test.mjs tests/integration-release-gates.test.mjs
```

GitHub Actions also executes the source-science policy tests and a Next.js production build without private database secrets.

## Owner approval

Nothing is merged or deployed by this branch. Before production, the principal must explicitly approve (1) the final reviewed changeset, (2) the real DB auth/RLS/migration plan, (3) external HTTPS preview and device checks, and (4) public-domain/DNS activation. GitHub Actions pass is an internal quality signal, not authority to bypass those decisions.
