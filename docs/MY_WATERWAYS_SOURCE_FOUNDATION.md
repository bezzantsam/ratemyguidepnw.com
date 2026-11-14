# My Waterways: source-backed river and tide data foundation

**Status: source adapters and offline tests only; not live, not deployed, no paid subscription, no scheduled jobs or alerts.**

## Product principle

Anglers should get useful, frequently updated observations for free, with an optional future subscription for personalized saved corridors, low-cost threshold alerts and qualified historical comparisons. Most guides are part-time operators who also work other jobs. Basic captain profiles, reviews, replies, guide corrections and search should remain free. Avoid founder phone-call servicing and premium profile upsells that require ongoing manual support. Higher-priced guide tools may eventually focus on genuinely useful automated open-seat notifications, but that is not part of this PR.

## Initial official source registry (verify dates / availability at deployment)

| Key | Provider | Exact ID | Meaning | Link |
| --- | --- | --- | --- | --- |
| `wilson-river` | USGS | `14301500` | Current discharge, gage height, water temp **only when provided by station** | https://waterdata.usgs.gov/monitoring-location/USGS-14301500/ |
| `cowlitz-river` | USGS | `14243000` | Same; individual parameters may be unavailable | https://waterdata.usgs.gov/monitoring-location/USGS-14243000/ |
| `astoria-tides` | NOAA CO-OPS | `9439040` | Astoria/Tongue Point astronomical high/low predictions | https://tidesandcurrents.noaa.gov/stationhome.html?id=9439040 |
| `garibaldi-tides` | NOAA CO-OPS | `9437540` | Garibaldi/Tillamook Bay astronomical high/low predictions | https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=9437540 |

The Kalama River historical USGS sites `14223000` and `14223500` are intentionally **not live** in this source registry. A fishery page must not display historical numbers as current readings.

### Data collection and interpretation

`lib/waterway-sources.ts` fixes source IDs, supported jurisdiction, source reference URL and a common 30-minute fetch revalidation interval. `lib/agency-conditions-server.ts` uses the **modern USGS** OGC latest-continuous API rather than the retiring NWIS IV endpoint, and the NOAA CO-OPS prediction API. Its parsers preserve actual station IDs, metric units, observation/source times and provisional status, and fail closed on bad/missing/stale observations. A genuine USGS zero can be represented as zero; missing data never becomes zero.

NOAA high/low predictions must **not** be described as actual observed levels, slack-current times, wind surge, or navigational guidance. Predictions are labeled `astronomical_prediction` and carry local station time without pretending a local timestamp is UTC. Never make a fishability prediction from raw tide highs/lows alone.

The 30-minute `fetch(...,{next:{revalidate:1800}})` is a shared Next.js caching instruction, **not a guarantee of only two provider requests per hour** across all deployments, cold starts, retries, server instances, errors, parameter differences or upstream outages. Enforce upstream rate limits, request coalescing, bounded timeouts, source usage rules and server-side cache monitoring before using it in public pages.

### Launch and source-rights gates

1. Reconfirm current official API schema, agency terms, data latency and station availability in a controlled live integration smoke test **without collecting users' data**.
2. Verify response unit normalization, station identity, provisional flags, timezone/DST interpretation, HTTP errors, missingness, source-date lag and actual request frequency. Store source observations with revision metadata only after explicit database approval.
3. Build an accessible read-only conditions card with exact provider/station citations and freshness labels. Separate observations from future deterministic conditions alerts and validated predictive edge research.
4. Do not pull NOAA, USGS, DART/FPC, ODFW, WDFW or Chrome-AI private candidate data into marketing claims, user profiling or forecasts without documented rights and scientific validation.
5. Secure live Supabase authentication, claims/reviews, and moderator publication first. Do not activate payments, email collection, tracking or national expansion from this branch.

### Verification

```sh
npm run test:waterway-sources
npm run check
```

All source adapters are currently unconnected to the public application, and tests use synthetic agency payloads only. No API requests, cron, secrets, agency-specific paid account, billing integration, database migration or PWA deployment occurs in this work.
