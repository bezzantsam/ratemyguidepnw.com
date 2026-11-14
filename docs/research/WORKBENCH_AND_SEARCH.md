# Research workbench and forgiving directory search

## Directory behavior

The live-directory code path and Washington directory share `UnifiedSearch`. Search normalizes case, accents, apostrophes and punctuation, then ranks exact public names/business names/aliases before token prefixes, common first-name nickname expansions, and bounded spelling matches. Words may appear in a different order or across the captain and business fields (for example `Billy Bandit`). All query terms must match. Typo tolerance starts at four characters, allows one edit or adjacent swap, and permits two edits for words of seven or more characters. Longer input is bounded. Approximate results carry a “Similar spelling match” label.

Common nickname families are search aids, not new identity evidence. Searching Billy or Bill can find William Sanborn; no person record is renamed. Do not infer credentials, ownership, family relationships or account permissions from a search match. Ambiguous Bandit searches retain both William Sanborn and Raymond Herzman. Exact state, registration-zone and advertised-water filters remain mandatory, even when text matching is approximate. Registration IDs are not fuzzy corrected.

## Local research screen

Run the existing `npm run dev` command and open `/admin/research` on that local development server. The screen provides entity/search/state filters, existing source leads, incoming claim-level evidence, notes, and a JSON handoff export. Ready-for-engineering-review requires a supporting HTTPS URL and a note explaining the claim. It does not approve or publish a profile. Credentials remain unknown and all exported items retain pending publication status.

The route calls `notFound()` outside development **before reading** the research file. It is not a production admin service. No database, upload, authentication, merge, publication or communication action is connected. Notes exist in tab memory only; export before refreshing. The export contains edited known queue items, not arbitrary client-supplied identities. Invalid ready decisions block the export with the affected item's name.

The latest Gemini handoff is represented as supplied, unchecked research. Its reported observation date is kept separate from our own source check. Tacklebuster's individual operator page was independently readable and names both Jeurgen Turner (JT) and Tyler Turner. Gambler pages still returned no readable text here; the supplied hull/captain details remain candidates. The future-tense 42-foot Gambler announcement is not proof of delivery. No additional live profile data is published by this update.

## Verification and limits

Tests cover real directory matches for Billy/Bill Sanborn, Cameron Kenendy, Dre Menefe, reversed names, exact-match ordering, short-query limits, strict filters, ambiguous Bandit identities, and unchanged person records. Research tests cover filtering, safe evidence URLs, required evidence, export isolation, pending status, rendered empty states and the development gate.

Full `npm run check` validates all suites, TypeScript and production build. Browser interaction and visual checks were attempted but unavailable: installed Chromium could not create its process socket in this environment. Do not treat the screen as visually approved or production-ready. Live admin authentication and runtime authorization tests remain a separate release gate.
