# Buoy 10 Chinook Intel × RateMyGuidePNW

## One consumer site, two evidence lanes

The website (public Next.js repo bezzantsam/ratemyguidepnw.com) is the angler-facing product. Chrome-AI (private Python repo bezzantsam/chrome-ai) is the independently operated scientific research and data platform.

The projects must not share raw databases or credentials. Chrome-AI stores a private frozen model, original source files, timestamped 2027 predictions and later official results. RateMyGuidePNW has its own Supabase review/auth/moderation system. The public website never accesses Chrome-AI's private database or its secrets.

## What is built in the first public integration

- A responsive Buoy 10 Chinook Intel page at /intel/buoy-10-chinook with WDFW primary-source and NOAA Astoria station links.
- A carefully cited, deliberately limited example: WDFW preliminary Aug 1–5, 2026, **217 Chinook retained / 806 sampled anglers** across exactly those five days. Official report updated Oct 1, 2026. That is not a seasonal estimate, probability of catching a Chinook, or ML prediction.
- A transparent predeclared 7-day August 2027 frozen-model validation plan; no unverified model performance claims, source revisions masquerading as new measurements, or public raw predictions.
- The site's real Oregon directory records registered for the broad Lower Columbia River service area, clearly distinguished from current licensing or verified Buoy 10 Chinook expertise. No fictional ratings.
- Separate links to the existing Dock Talk customer-review and moderated guide-profile experiences.

## Safe publication boundary

The public website uses only lib/chinook-public-release.json, checked by lib/chinook-intel.ts and an independent Node test. This prevents accidentally replacing the approved methodology-only data with private forecasts, unverified 2027 accuracy values or changed WDFW historical sample counts.

Future data releases require an explicit source-quality review, release approval, source-vintage retention and new tests. Browser code must never reach the Chrome-AI database. Anonymous review content, paid profiles and guide marketing do not become Chinook forecast training or scoring records.

## Independence

Public anonymity for reviews does not mean no accountable authenticated user, no abuse monitoring, or perfect anonymity. Disclose guide affiliations and compensated trips; pay-to-rank and deletion of legitimate negative reviews are prohibited product goals. Review fraud detection, guide appeal and separate human moderation remain active engineering work.

## Deployment

Run npm install, then npm run check. GitHub CI verifies public-source figures, TypeScript and Next.js production build. Review a Vercel branch preview before promoting; the product currently retains prelaunch noindex. Do not point GoDaddy's custom domain or expose a new backend without authorization, full review-system testing and commercial compliance.

## Independently reviewed August 2026 historical sample

A separate, **SHA-pinned, source-audited public historical release** at `data/chinook-2026-reviewed.json` covers 31 daily WDFW preliminary Chinook sample dates. Production may render this additional 2026 chart only when the exact original agency source hash and all normalized row bytes match the approved review; the source bot's mutable `data/chinook-wdfw-candidate.json` remains confined to its separate open PR. This release never includes 2027 outcomes or private forecasts. See [the full source audit](chinook-2026-source-audit.md).
