# Founding-guide pilot seeding — private plan, not invitations or publication

This workflow prepares a 1–15 guide **founding beta pack** for the founder to choose, contact personally, and bring into the secure owner-claim process when the backend is ready. No captain is considered a founding member merely because their existing public ID is included.

## Product purpose and national reuse

We want 10–15 high-trust, source-grounded captains before expanding paid tools, promotion or national guide data ingestion. The same planner uses **market + jurisdiction + stable imported identity** instead of guessing that a brand/name identifies one person. `research/market-adapters.json` currently configures the PNW pilot for `US-OR` and `US-WA`, with a source adapter for each. Future markets will need **new documented, licensed source adapters** and reviewed IDs, not cloned websites or a second database.

Existing `OG.XXXXXXX` IDs and Washington `wa-XXX` URLs remain unchanged. Washington raw rows previously suppressed by curated OR/WA reconciliation **cannot** be reintroduced into this founder pack through a hidden source ID. Duplicate public business names stay individual people; an identity collision gets a review hint, never an automatic merge.

## How to use it

1. Open `research/founding-guide-selection.template.json`. Its `selected_public_ids` array starts empty. Only add public IDs of specific captains the founder **chooses to consider inviting**. Finding the captain's name in the directory is NOT proof of an existing relationship or agreement.
2. Plan without writing or sending anything:

   ```sh
   python3 scripts/founding_guide_seed_plan.py
   ```

3. After selecting real public IDs, explicitly generate a review-only pack locally:

   ```sh
   python3 scripts/founding_guide_seed_plan.py \
     --selection research/founding-guide-selection.template.json \
     --write-draft \
     --output research-drafts/founding-guide-plan.json
   ```

4. Review each guide's imported identity, public-source citations and collision hints. Correct any mismatches; **never** claim a relationship, current license or captain approval from public listings alone.
5. Founder may then invite individual captains directly **outside this script**. Once captain claiming/review database security is live and tested, captains sign in, prove authorized affiliation, review factual source claims, and submit vessel/seasonal trips for moderation.
6. Only a separately authenticated human moderator may accept **new** profile fields. Unapproved drafts never appear in search, public ratings, advertising or data/model products.

### Fields that remain deliberately unset

- `invitation_status=not_contacted_no_consent_claimed` for **every** generated record
- `ownership_status=not_verified`
- `editing_rights=no_access_granted`
- `publication_action=none`
- `owner_provided_vessels=[]` and `owner_provided_seasonal_packages=[]`

The planner reuses only existing **editorially linked** waterway mentions from `lib/guide-enrichment.json`; they remain historical, source-linked **claims**, not current operating waterways or fishing licenses. It never imports private phone numbers, emails, customer records, copyrighted bios, photos, prices, reviews, active boats, trips or credentials.

### Privacy, cost and release boundaries

- Output is restricted to the gitignored `research-drafts/` directory; no database writes, network requests, third-party scraping or outreach. No paid services.
- If any guide opts out, stop outreach, correct any source errors and follow the future privacy/deletion process. Treat imported public names and business listings as data requiring accuracy and legitimate use, not consent to marketing.
- A claimed captain remains distinct from state license verification, boat credentials, user review verification or a paid subscription.
- The real Supabase project is still inactive. [Backend launch preflight](BACKEND_SCHEMA_PREFLIGHT.md) must pass on actual deployed schema and JWT-backed RLS; **no owner claim, review or new profile should be published automatically**.
- Regional expansion is **conditional on proven PNW demand and economics**. This release adds only market abstraction/data contracts; it does not scrape other states or increase hosting requirements.

## Tests

```sh
python3 -m unittest discover -s tests -p 'test_founding_guide_seed_plan.py' -v
npm run check
```

Tests verify zero-contact defaults, legitimate public IDs and source keys, WA deduplication, shared-outfitter non-merges, reviewer permission controls, geographic configuration and private-only write behavior.
