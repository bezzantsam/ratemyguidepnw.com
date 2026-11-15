# Oregon Batch 13: 100 distinct guide research records

**DRAFT ONLY. No merge, live database write or production deployment.**

100 additional Oregon roster IDs were selected without duplication of enriched records or prior two 100-record review queues.
12 profiles have inspected public business or third-party sources; 88 registry candidates or explicitly held mismatches are unverified and do not appear in public enrichment JSON.
37 narrowly source-attributed named fishing waters were added to draft enrichment. Cumulative enriched entries: 213 to 225.
Species and techniques from operator sources are *research-only* fields in OREGON_BATCH13_100_REVIEW.json. They are not verified expertise and are not yet published as search filters.

## Source-reviewed business evidence

| ID | Registry name | Source URL | Waters | Staged species | Staged techniques |
|---|---|---|---:|---|---|
| OG.0000137 | Jesse Zalonis | https://www.madrivermanufacturing.com/pro-staff.aspx | 0 |  |  |
| OG.0000382 | Kevin Hawkins | https://www.khfishing.com/ | 1 | Chinook salmon, Coho salmon, Trout | Fly fishing |
| OG.0000387 | Vernon Grieve | https://grievesfishing.com/trips/ | 5 | Chinook salmon, Steelhead, Smallmouth bass |  |
| OG.0000408 | Alan Borges | https://alansguideservice.com/fish/ | 5 | Chinook salmon, Steelhead, Trout | Fly fishing |
| OG.0000415 | Timothy Barnett | https://www.madrivermanufacturing.com/pro-staff.aspx | 5 | Salmon, Steelhead | Drift boat |
| OG.0000427 | Ethan Nickel | https://enickeloutfitters.com/about/ | 3 | Trout, Steelhead, Chinook salmon | Fly fishing, Drift boat |
| OG.0000741 | Robert Rees | https://kastking.com/pages/pro-guide | 2 | Salmon, Steelhead, Sturgeon, Bottom fish |  |
| OG.0001116 | Neal Burrell | https://www.nbflyfish.com/about | 1 | Trout, Steelhead | Fly fishing |
| OG.0000617 | Jonathan Geyer | https://jongeyerfishing.com/ | 8 | Chinook salmon, Coho salmon, Steelhead, Trout, Bass |  |
| OG.0002596 | Benjamin Stephenson | https://www.outfishingadventures.com/ | 1 | Trout, Steelhead | Fly fishing |
| OG.0002329 | John Plughoff | https://plughoffoutfitters.com/trips | 6 | Walleye, Chinook salmon, Coho salmon, Sockeye salmon |  |
| OG.0000782 | Drake Radditz | https://www.blm.gov/sites/default/files/uploads/deschutes_shuttles.pdf | 0 |  |  |

## Editorial limitations

- Source link / observed date means researched public information, NOT current guide licensing, captain identity ownership, credentials, operation, trip availability or present rates.
- The roster may list geographically cross-state operators. Kevin Hawkins now guides Montana's Bitterroot and advertises Astoria salmon trips, but Astoria does not prove an offshore Pacific Ocean trip.
- One May 2025 BLM roster lists Drake Radditz; an older roster does not prove current services.
- Historic manufacturer profiles establish Jesse Zalonis and Tim Barnett business association and advertised trips, not new license verification.
- Four explicit holds were assigned to conflicting or unrelated operators: OG.0004090, OG.0003361, OG.0002938, OG.0003834. No held record enters enrichment.
- Generic Google/Facebook pages, social photographs and reviews must never be copied without appropriate permission, and prohibited scraping/login bypasses are out of scope.
- Guides may claim and customize profile information only through a secure affiliation verification flow, with correction, disputes and independent review moderation.
- The 88 unverified records are useful research leads, NOT 88 finished profiles.

## Taxonomy handoff

Future species, method and expertise search should ingest advertised_species_staging_only and advertised_techniques_staging_only only after per-claim source and identity review. Keep advertised offerings, independent evidence and captain-claimed specialties in separate fields. Do not infer skill from broad registrations. Preserve authorship and provenance.

Run automated tests and manually audit source pages before any publication.
