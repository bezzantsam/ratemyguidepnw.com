# Public operator website evidence scout — closed-beta pilot

**Status:** OFFLINE BY DEFAULT. This is a developer-only assistant for sourcing the first 12–15 closed-beta profiles. It is not a production crawler, complete guide database, automated profile-writing engine or captain-verification service.

## Product goal

Get fishery and seasonal-trip **candidate evidence** from public, operator-owned websites so an editor can produce an original RateMyGuidePNW summary with an observable source and date. Don't spend the launch sprint crawling thousands of sites: launch blockers remain inactive Supabase authorization, real RLS/moderation tests, mobile device QA and public permission.

The website's content is copyright-protected expression even if the underlying public facts aren't. Rewording a complete bio is **not automatically safe**. We do not download images, copy reviews, mirror site prose, compile contact data, or create an automated derivative bio. The scout only reports *mentions* of certain fish and waterways and a SHA-256 content fingerprint. Mentions can be negated or outdated ("we no longer fish Buoy 10"); they MUST NOT be treated as active services.

Sources: [US Copyright Office on facts and expression](https://www.copyright.gov/help/faq/faq-protect.html); [Google robots introduction](https://developers.google.com/search/docs/crawling-indexing/robots/intro); [Meta on unauthorized automation](https://about.fb.com/news/2021/04/how-we-combat-scraping/).

## Sources and permissions

- `research/guide-source-manifest.json` is a **manual exact-page allowlist** with guide ID, HTTPS URL, exact hostname, `terms_reviewed_on` and `approved_to_fetch`. Every sample starts **false/null**; no permission has yet been established.
- Before changing an approval flag, a human checks that this is actually the **operator's** website, not a social-network, booking third party, directory or imitation domain; checks site terms and any usage/license notices; and records the date. A source URL is not permission to automate.
- CLI enforces exact host, HTTPS, no login/credentials, no alternate ports, no URL queries, no IP/localhost, no off-site redirects, no dynamic link discovery, no website login, at most 15 explicit pages total and 2 per host.
- Robots.txt is retrieved and parsed first. **Unavailable or disallowed robots fails closed**. We obey a larger crawl delay if given; default minimum interval for repeated pages from the same host is 3 seconds. No retries; unresponsive domains are skipped.
- Facebook, Instagram, Threads, Meta, TikTok, YouTube, social networks and link aggregators are explicitly **excluded**. Obtain authorized API access or rely on individually reviewed, manually supplied public facts when needed; never automate browser scraping or evade account/rate limits.
- Output records omit raw HTML, photos, biographies, user reviews, email addresses and phone numbers. Long prose isn't paraphrased or stored. The candidate evidence record contains the source URL, capture time, SHA-256 hash and **controlled vocabulary mentions only**.

## Commands

Plan without making any network requests (safe default):

```sh
python3 scripts/guide_source_scout.py
```

Run offline test suite:

```sh
python3 -m unittest discover -s tests -p 'test_guide_source_scout.py' -v
```

After an owner/editor has individually checked and approved site terms, the source host and robots status, a local operator may explicitly request a limited capture:

```sh
python3 scripts/guide_source_scout.py --fetch --output research-drafts/scout-evidence.json
```

No scheduled automated run is configured. `research-drafts/` is gitignored and never read by the live website or Supabase. The capture script cannot alter `lib/directory.ts`, `lib/guide-enrichment.json`, `lib/oregon-guides.json`, the WA directory or public web pages.

## Editorial workflow

1. Gemini researches 12–15 closed-beta candidates with direct operator website URLs, dates and provenance, **no unlicensed copying**.
2. The owner/editor vets exact website host, usage terms and robots; only then sets `terms_reviewed_on` and `approved_to_fetch=true` on explicitly chosen URLs.
3. Offline or permission-controlled scouting emits provisional **mention candidates**. Review the actual cited page for negation, stale claims, boat/fishery changes, source identity collisions, seasonal date qualifiers and current availability.
4. Produce an **original** one- or two-sentence neutral profile description based only on supported facts, with source URL and observed date; never reproduce a recognizable rewritten bio. Do not import photos without permission.
5. Store the proposed enriched profile as a **draft** for manual editorial acceptance. Directory profile claims, verified-state-license badges, reviews, rankings and booking payouts remain separate.
6. Provide a correction/takedown route when a guide disputes data, and re-review sources when they change. Captains can claim the free factual profile later and submit changes through the pending moderation process.

## How this supports launch without derailing it

Pilot only the first 15 high-value profiles. Count eligible source pages, editorial completion rate, errors/corrections and median minutes per approved source. Scale later only if the data improves real guide searches and beta captain onboarding. Do not sacrifice backend security, first-review correctness, or authentic guide participation to increase scraped record counts.

### Non-goals

No indiscriminate web-wide crawling, source text mirroring, automated Meta collection, contacting captains, live licensing assertions, automated publishing, official regulatory advice, AI-generated fictional trip packages, or public deployment. The existing PR #46/#48 launch gates remain mandatory.
