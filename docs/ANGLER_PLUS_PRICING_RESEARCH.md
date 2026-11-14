# Angler Plus pricing research and inspectable scenarios
As of 2026-11-13. **Decision support only — no offer or billing is deployed.**

## Decision

A founder-operated fishing guide directory and useful fishing-planning software should not depend on subscriptions requiring phone sales, concierge service, guide verification receipts or hand-crafted sponsor reporting. The founder is considering a low-touch **PWA-first Angler Plus yearly utility subscription**. Free guide discovery, honest angler reviews, captain replies, basic source corrections, and unpaid owner claims must remain independent of subscription price, review score and ranking.

**Provisional offer to test after there is genuinely useful premium functionality:** $29.99/year standard, with a time-limited $19.99/year founding offer; also test whether a $39.99/year anchor is feasible. **Do not publish an actual paywall at this stage.** A $9.99/year rate is useful as a downside unit-economics comparison, not an approved promise.

**Operational commitment:** no phone calls, no concierge obligations, and no hidden manual fulfillment at this price. The modeled **license-holder proxy** is a market-sizing illustration, not a user list. Real subscription **conversion**, **renewal** performance, **payment processing**, and **founder labor** must be measured before a price is finalized. This product is **not deployed**.

## November 2026 independent public price benchmarks

These are *existing mature apps*, not evidence that consumers would pay the same for this current website, which lacks verified condition forecasting, premium lake maps, national fish data, paid account management, live customer retention and active subscriptions.

| Product | Published U.S. annual price | Currently advertised utility | Source |
| --- | ---: | --- | --- |
| onX Fish Midwest | $34.99/year | Species/lake search, contours, access/regulations, offline maps. **Regional focus includes Midwest states rather than PNW.** | https://www.onxmaps.com/fish/app/pricing |
| Fishing Points | $49.99/year | Tide/weather/river forecasts, maps and unlimited favorite locations | https://apps.apple.com/us/app/fishing-points-map-forecast/id1203032512 |
| FishAngler VIP | $49.99/year | Maps, forecasts, AI fishing game plans | https://apps.apple.com/us/app/fishangler-fishing-app/id1073941118 |
| Fishbrain Pro | $79.99/year | Public catch locations, charting and bait/lure intelligence | https://fishbrain.com/pro |
| Nautide PRO | $44.99/year | Tides, wind and waves | https://apps.apple.com/us/app/nautide-tides-wind-waves/id1413108902 |

Prices can vary by promotions, platform, region and subscription history. Verify again immediately before launching pricing tests.

## Market size: categories not to confuse

**TAM category (high-level national fishing participation):** The ASA/OIA 2026 report estimates **57 million Americans ages 6+ fished in 2025**, with 68% taking 11 trips or fewer. This is NOT the number of Americans willing to subscribe to a paid fishing directory or guide intelligence app. It includes children, casual anglers and people with no interest in hiring guides or recurring fishing intel. https://asafishing.org/press-release/2026-special-report-on-fishing/ ; https://outdoorindustry.org/2026-special-report-on-fishing/

**Regional holder proxy (PNW pilot):** Washington WDFW estimates about **675,000 fishing license holders annually** (https://wdfw.wa.gov/about/administration/budget/faq). A secondary compiler of federally certified fishing license data reports **601,096 Oregon holders in 2025** (https://statnorth.us/hunting-fishing-licenses/or); this figure needs a direct USFWS check before being called official. Their sum **1,276,096** is *state-level license-holder records*, not distinct PNW resident anglers. People licensed in both jurisdictions, visitors, historic/nonresident records, under-16 anglers, unlicensed participants and mismatched reporting periods are not resolved by summing.

**Illustrative SAM calculation (not measured):** Deduct a **10% overlap of the smaller state pool** (=60,109 potentially duplicated) -> 1,215,987 de-duplicated license-holder *proxy*. Apply a **32% frequent-angler proxy rate** based loosely on the national 68% who fish 11 times or fewer -> 389,115 *illustratively engaged holders*. That frequency proxy is an assumption, not an OR/WA survey or proof of interest in guide planning. Additional narrower tests by target corridor and species will be necessary.

**Illustrative first-year SOM funnel (also not measured):** If we organically reach **2%** of the engaged-holder proxy -> 7,782 exposed people; if **3%** become annual subscribers -> **233** expected payers at the selected price. Real site traffic, uniqueness, adult eligibility, price elasticity, willingness to pay, and retention have **not yet been measured**. Do not convert Reel One Adventures social media views into website visits or subscription purchases without instrumentation.

A **downside** case assumes only 0.2% organic reach and 1% conversion. An **upside** case assumes 5% reach and 5% conversion with more marketing and founder support time. They are deliberately **scenario assumptions, not forecasts**, and do not independently prove pricing elasticity.

## PWA-first payment economics and cost limits

Current published starting rates and fee examples:
- Vercel Pro $20/month, commercial hosting; actual usage overages are additional: https://vercel.com/pricing
- Supabase Pro $25/month first project with included small-compute credit; traffic/storage/database overages extra: https://supabase.com/pricing
- Stripe U.S. domestic card processing **2.9% + $0.30 per payment**: https://stripe.com/pricing
- Stripe Billing pay-as-you-go **0.7% of subscription billing volume**: https://stripe.com/billing/pricing
- No Apple/Google app store distribution fee in the **PWA payments model**; native app distribution would need separate current platform-payment compliance review and fee structure. The pure model has an optional platform percentage for **sensitivity only**.
- Email, push, monitoring, AI compute, processing, chargebacks/refunds, sales tax, discounts, support, legal compliance and data-rights work may increase actual costs. The $1.50 annual subscriber variable cost in the base scenario is an **allowance, not a quote**.

The auditable engine is `lib/pricing-economics.ts`; `tests/pricing-economics.test.mjs` verifies deductions, zero users, negative-margin downside, higher-price elasticity thresholds, renewal-year subscribers and additional native app-store fee scenarios.

Illustrative base assumptions: $20/mo hosting, $25/mo database, $150/mo marketing, 2 hours/month founder time valued at $30/hour, $1.50 per paid subscriber per year, zero app-store fee, payment fee 2.9% + $0.30, Billing fee 0.7%.

| Annual price | Member contribution after card/Billing/variable cost | Members to cover modeled annual fixed costs ($3,060) | Annual modeled cash surplus at same illustrative 233 members |
| --- | ---: | ---: | ---: |
| $9.99 | $7.83 | 391 | -$1,236 |
| $19.99 | $17.47 | 176 | +$1,011 |
| $29.99 | $27.11 | 113 | +$3,257 |
| $39.99 | $36.75 | 84 | +$5,503 |
| $49.99 | $46.39 | 66 | +$7,749 |

**Critical caveat:** The final column holds **233 buyers constant at every price solely to isolate unit economics**. Real conversion will vary with price. It is NOT a revenue forecast or evidence that 233 people would buy at $49.99. Any price test must use actual paid or strong, truthful, well-controlled intention signals after a premium feature exists.

A better break-even criterion: for the **same annual contribution**, a $29.99 offer needs to retain **about 64.4%** of the $19.99 buyers, with the modeled costs; a $29.99 offer needs **about 28.9%** of the $9.99 buyers. Whether those thresholds are achieved is **unknown**.

### What improves confidence fastest

1. Finish secure reviews/claiming/moderation and grow organic, genuine visits. **Do not** make the free review loop contingent on subscription.
2. Build just ONE low-expense, repeated-use premium utility with a clearly stated benefit: cross-device saved fisheries + source-backed opening/season updates or opted-in alerts where lawful and verifiable. Do not promise a validated fishing prediction until the separate Chrome-AI prospective work warrants it. Avoid LLM-per-search or per-subscriber high variable costs.
3. Before payment integration, show truthful price-description concepts at **$19.99**, **$29.99**, **$39.99** to randomly assigned eligible adult users with consistent offered features. Do not mislead people into thinking the premium is live or accept card numbers for an unbuilt product. Count qualified repeated opt-in intent, not pageviews or ratings. Do not collect personal contact information until consent and retention practices exist.
4. If real users show willingness and repeat utility, approve a secure vendor-hosted checkout and self-service account/cancellation. Measure paid conversion, chargebacks/refunds, support requests, annual renewals and organic acquisition costs **before** assuming national scale.
5. Revenue scale follows repeat utility and actual retention, not how many fishing licenses are on file. Re-run the scenario under observed conversion and fixed/variable costs before charging.

## How to inspect

The model is pure, offline TypeScript with explicit `ANNUAL_PRICE_OPTIONS`, `BASE_PNW_MARKET`, `BASE_PWA_COSTS`, `SCENARIOS`, `marketFunnel`, `annualFinancials`, `higherPriceBuyerRetentionThreshold` and `evaluateAllPrices` exports.

```sh
npm run test:pricing-economics
npm run check
```

No account creation, payments, Stripe endpoint, advertisements, live data collection, database migration, shipping forecasts or subscriber data is part of this work. **Not deployed.** The project requires owner approval before any offer, paywall, website publication or actual test with personal data.

