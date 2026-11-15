# Privacy-first first-party fishing-intent event contract (disabled)

## Current implementation status

This is a **pure TypeScript event-shape validator** only. `lib/intent-events.ts` sets `EVENT_COLLECTION_ENABLED = false`; **no live endpoint, database table, client-side listeners, cookies, IP logging, or sponsored tracking is enabled**. The project database remains inactive and the launch security/consent requirements are unresolved. A passing validation result proves only that the field shape looks acceptable, not that a real user interacted or a guide accepted a booking.

The contract supports the founder's lean regional intelligence objective without creating a data collection system before privacy/legal and owner approval.

### Version 1 allowlisted events

| Event type | Required facts | Allowed optional context | Meaning |
| --- | --- | --- | --- |
| `directory_filter_applied` | `market_id`, `filter_kind`, matching coarse filter value | other coarse region/species/waterway slugs, month 1–12 | User-supplied filtering intent if later emitted by a protected event source; NOT evidence of fish abundance or intent to buy |
| `guide_profile_viewed` | `market_id`, `guide_id` | coarse region/species/waterway slugs, target month | A potential page-view signal; NOT a unique visitor |
| `booking_referral_clicked` | `market_id`, `guide_id`, `outbound_type` | coarse region/species/waterway slugs, target month | A possible outbound referral; **not verified bookings**, purchases, closed leads or revenue |

`market_id` must exist in `research/market-adapters.json`; at present only the **PNW pilot** is configured. The same scheme can eventually support future country/state adapters without inventing new identities. `guide_id` uses only the existing Oregon and Washington public ID *syntax*. It is not an authoritative membership check: future server code must resolve the actual directory record and correct jurisdiction, and never trust a browser-provided business/identity claim.

Explicit input size and pattern constraints reject free-text searches, names, email addresses, contact data, exact GPS coordinates, URLs with tracking identifiers, arbitrary metadata JSON, ad identifiers, reviewer content, client timestamps, user IDs, self-reported booking completions, payment amounts, and client-controlled privilege or license states. Unknown keys fail closed. Even salted user-agent fingerprints are **not** part of this contract: a daily salted user-agent hash does not identify distinct sessions reliably and could create privacy risks.

### Real launch requirements — before any event collection

1. **Privacy notice and consent:** Clearly disclose what is collected and why; follow applicable laws, opt-out/consent choices, and data-deletion requests. Do not assume first-party status alone exempts the site from privacy rules. No collection until an explicitly approved policy exists.
2. **Server-derived provenance:** Only a server-controlled endpoint, deployed after the database's authenticated RLS and role permissions are tested, may accept events. It must derive `occurred_at` and canonical guide/market/corridor association itself. Never let the browser decide current licensing, approved claims, publication status, role, verified trips, consent or paid ranking.
3. **Abuse and accuracy:** Rate-limit, filter obvious bots, bind outbound-click evidence to an intentional server-validated redirect/link with an allowlisted destination, and mark it as **an observed click only**. A browser's POST claiming a click is not a verified referral, and even an observed outbound click does not prove a booking.
4. **Retention and deletion:** Configure bounded raw-event retention, aggregated storage by coarse geography/period, deletion/opt-out propagation, and transparency about limits of anonymous event counting. No raw session fingerprints. No inferred unique visitors unless an approved measurement method actually supports it.
5. **Small-cell aggregation:** Prevent re-identification through small sample reports. Suppress detailed publisher/sponsor cuts until minimum scale, independent reviewer consent where needed, and a separate human audit of privacy risk. Do not claim an arbitrary k-threshold provides guaranteed anonymity.
6. **Cost controls:** Begin with existing Next.js + PostgreSQL infrastructure when approved. No dedicated tracking SaaS, data warehouse, stream processor, vector store, or per-click AI service. Cap event ingestion and report/query costs.
7. **Separated source rights:** Proprietary analytics only from legitimate, permissioned first-party activity or licensed published source facts. Never import raw reviewer evidence, account identities, precise fishing spots, private Chrome-AI candidate forecasts or source terms-prohibited content into an analytics/training export.

### Tests

```bash
npm run test:intent-events
npm run check
```

The tests prove that only three versioned event categories and coarse structured fields parse, all unexpected/personal fields are rejected, the backend write path is absent, and the private PNW pilot remains the sole configured market.

### Not built or approved

There is no `POST /api/events`, no `platform_events` SQL migration, no on-page telemetry code and no production sponsor conversion instrumentation. `EVENT_COLLECTION_ENABLED = false` is a documentation/development invariant, not a user interface toggle or an authorization mechanism.

**Required launch work remains actual Supabase restoration, deployed-schema/RLS tests, audited moderator publication, privacy policy and founder approval.** Those are higher priority than turning on event analytics.
