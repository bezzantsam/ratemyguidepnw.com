# RateMyGuidePNW — 30-day MVP demand test (hypotheses, not results)
**Status:** Unlaunched. As of 2026-11-15, the website has draft guide research and manual email interest links, but no independently verified production funnel data, successful self-serve subscription checkout, or proven attributed bookings.

## What must work before promoting traffic
1. **Guide discovery:** Search by person/business; select Oregon/Washington and a source-linked fishery. The optional source-linked-only filter must exclude unsourced profiles without mislabeling them "verified".
2. **Angler action:** The guide page shows registration provenance and public-source context. Link to a matching operator website without implying active licensing or availability. Test mobile and desktop paths.
3. **Guide action:** Guide-specific free manual claim email and proposed $99/year founding-captain interest email prefill the correct ID/name. Sending an email is not an owner verification or a payment.
4. **Operations:** A named operator can request correction or deletion. Confirm the review/moderation flow before allowing reviews. Do not publish unmoderated anonymous reviews, personal allegations, or wrongly mapped WA identities.
5. **Safe release:** Keep write gates off until Supabase/role/JWT/RLS checks pass; manually compare latest WA live identities, URLs and production build before deploying. The source-linked designation is not a license check.

## Pilot metrics to measure, not invent
| Metric | Unit | Counting rule |
|---|---|---|
| Sourced directory coverage | public-source-linked profiles / all directory profiles | Count editorially sourced entries; do not count research-only candidate URLs |
| Angler discovery | unique consenting participants completing a search task | One human per consented research session, not pageviews |
| Link usefulness | participants who identify a relevant guide and successfully open its real business site | Verified through observed study/task or explicit follow-up, not inferred from views |
| Guide response rate | actual replies / compliant, individually permissioned guide contacts | Exclude undelivered/unsent messages; do not automate unsolicited bulk texts |
| Founding Captain interest | distinct guides explicitly agreeing to review the $99/year offer | Email inquiries and claimed ownership remain distinct; "interested" is **not** a paid subscription |
| Paid conversion | real activated and paid subscriptions / eligible offers | Remains **0/unavailable** until billing, fulfillment, and required terms are actually launched |
| Booking attribution | guide-confirmed bookings attributable to the directory | Do not infer from external link clicks or visits |
| Source corrections | accepted guide changes after source verification / submitted requests | Distinguish corrections from claimed ownership |

## Proposed 30-day experiment and go/no-go thresholds
These are **proposed planning thresholds**, not forecasts or market evidence. Recruit 10–15 guides you can legitimately approach personally, plus 15–25 anglers with fresh consent, and run observed usability tasks before spending on customer acquisition. Ask captains what would make a better profile worth $99/year; don't count polite encouragement as a purchase.

Launch a **manual pilot** only if the core search → source-linked profile → external guide website flow is reliable, and corrections can be handled promptly. A good early signal would be **at least 5 of 15 anglers** independently completing the discovery task and **3 of 10 captains** explicitly requesting founding-profile follow-up. A stronger business signal requires **actual collected payment or documented repeat attributed bookings**, not just yes answers. If these signals fail, revise the value proposition instead of mass-enriching more profiles blindly.

## Research and measurement guardrails
Record raw numerators, denominators, dates and consent conditions in a private operator log. Use no invented reviews, fabricated inquiries, fake bookings or unverified "verified captain" labels. Privacy and opt-out rules apply to outreach. Default-off review/claim backend gates are not a blocker to a transparent manual research pilot, but they **are** blockers to promoting self-serve ownership/review claims.
