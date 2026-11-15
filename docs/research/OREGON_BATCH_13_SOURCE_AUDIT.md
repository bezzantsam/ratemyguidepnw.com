# Batch 13: 100 additional Oregon registry-site profiles + documented fishing specialties
**2026-11-15 | DRAFT | Not published or operator-claimed**

## Data inventory
- 100 additional **distinct** Oregon registration IDs now carry the exact historical registry-reported website with a normalized HTTPS candidate URL. This is **not** site-availability, ownership, credentials or business-identity verification.
- 26 operator/third-party sources were separately read, and narrow source-attributed **species, fishing techniques, trip types and waters** were added to those matching operator records. Of the 26, 18 correspond to *earlier held* Batch 11 or 12 records, and 8 are from this new batch. The original held status remains available in the audits.
- Prior draft enrichment had 213 entries; this draft has **327 entries**, of which **231 have source-linked business/waterway evidence** and **92 newly added entries have only historical website references**. The 327 total is NOT a count of fully vetted profiles.
- Audit records and source evidence: `docs/research/OREGON_BATCH_13_100_WEBSITE_AND_SPECIES.json`.

## Product functionality
Directory search now accepts public-claim-derived species and fishing method filters; free text searches documented species, methods and trip types as well as names, imported businesses and independently sourced operating-name aliases. Every claimed tag links to its specific public source and has an observed date.

A registry-only website reference is labeled **unverified and potentially stale**; it never passes the `Only show source-linked guide profiles` filter. No waterway, fish species, license or expertise is inferred from a registration area, business name or URL string.

### Examples of relevant evidence used
- `https://billmonroeoutdoors.com/`: publicly advertises Chinook/coho salmon, steelhead, sturgeon and coastal fishing with navigable Columbia, Willamette, Buoy 10, Tillamook pages.
- `https://jonessportfishing.com/about/`: Kyle Jones with Clearwater, Snake and Columbia fisheries; salmon, steelhead, sturgeon, walleye and trout.
- `https://www.charthousesportfish.com/about.html`: captain James Bithell; six-passenger saltwater charter with salmon, halibut and lingcod.
- `https://reeldealsportfish.com/`: David Philips, offshore Depoe Bay and Oregon drift-boat offerings.
- `https://www.trevinhoytfishing.com/pricing`: McKenzie/Willamette trips and sourced trip types.
- `https://riverwiseanglers.com/`: Bryan Stinson; swing flies and two-handed Spey for salmon/steelhead.
- `https://yamsiflyfishing.com/`: redband/brook trout and Williamson River private-water fly fishing.
- `https://fishingbooker.com/charters/view/38631`: third-party listing for Thomas Walton, not independently verified ownership or credentials.
- `https://www.allamericanguideservice.com/`: Jason Rounsaville and public trip species.
- `https://www.willamettevalleyfishing.com/about`: Will Conable; public fly fishing and instructional identity.

## Product boundaries and next checks
**Editorial signoff still required.** Pages may change and source recency is not license validity. Across-state guides have their actual waters labeled; an Alaska salmon trip is not presented as Oregon simply because its guide appears in the Oregon registry. Public Google/Facebook business pages can be researched when source identity and reuse are established, but *no Google/Facebook reviews, ratings, images or protected content were scraped or copied* for this batch.

Do not trust arbitrary registration URLs as reviewed sites or claim verified captain status. No private identity merges, fake reviews, paid ratings, automatic claim approval, subscription checkout, guide outreach, Supabase writes, merges or production deployments.

**MVP pilot:** Test source-backed species and technique discovery with anglers, and let guides request a manual profile claim. Keep the ability to add captain-authored bios, pictures, specialties and booking links as a meaningful future verified-account benefit; paid visibility must not influence independent review integrity.
