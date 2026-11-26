# Chesapeake fleet and source-permission research

This note describes a read-only research pass over first-party landing rosters, club or association lists, official tourism or municipal pages, and a sample of operator sites in Maryland and Virginia. The work starts with Solomons and Ocean City, Maryland; continues through Virginia Beach; and then covers the Virginia Eastern Shore, including Cape Charles, Wachapreague, Chincoteague, Onancock, and a search for Oyster. Northeast corrections are out of scope.

## What was opened

Each source used for counts was opened, and the raw response was saved privately with its URL, a UTC timestamp, a Pacific timestamp, and a SHA-256 digest. robots.txt and, where they existed, terms, privacy, or copyright pages were opened first or in the same campaign. Crawl-delay and robots disallows were respected. A custom research user-agent was used. This research does not publish listings, contact operators, merge to production, or deploy anything.

## How a row was counted

- A **distinct row** is one listing on one source page (one card, table row, or clearly separated directory entry).
- A **confirmed vessel** is a row where that source names a physical boat and states length and/or builder, or a documentation number. No documentation numbers or hull identification numbers appeared on the captured marketing pages.
- **Unresolved** covers named boats without hull evidence, unnamed hulls described only by length or model, landing pages that claim a fleet without naming boats, and conflicts that were left unmerged.
- **Operator-only** covers a business or captain listing with no named hull.
- **Not a vessel** covers rows explicitly marked retired, or similar non-vessel records.
- Physical boat, captain, operator, booking desk, hailing port, and actual departure are recorded as separate fields. A hailing port is not assumed to be the departure dock. Missing values stay null.
- Fishing trips are distinguished from ferry, sightseeing, eco-tour, sailing, and mixed offerings when the source states the service.
- A dated page (for example a 2015–2016 profile) is recorded as a **historical assignment**, not as a current fleet roster.
- A **second-publisher cross-check** is a compatible named hull published by a different organization. Extra pages on the same website are counted separately and are not cross-checks.
- Name alone is never a merge key. Two sources that disagree on length or captain stay as two observations.

## Source permission

For each publisher, the terms, legal, copyright, or privacy page was sought and read when it existed. Silence is recorded as `unknown`, including for municipal and operator sites. A privacy policy is not a directory-reuse license. A footer copyright line is noted but is not treated as a grant. robots.txt permission to crawl is not a reuse license. A state or federal permit or license list, if used, would support only the holder type, fishery, and time period it covers; official Maryland and Virginia pages opened in this pass did not yield an extractable vessel table.

Maryland DNR's copyright page allows linking and allows posting text, but not page layout or design, and forbids charging users for the information, with a required credit line; photographs need a written request. That limited license is recorded as `restricted` and was not used to extract a vessel roster, because the locator is a map without a parseable table in the captured HTML.

No source in this pass was classified `permitted` for commercial directory reuse. All extracted observations are therefore held from public listing publication.

## What is not in this public folder

Per-vessel records, captain names, copied page text, raw HTML, and the private JSONL are kept out of this repository. Aggregates, source URLs, publisher names, and hold reasons are what this folder contains.

