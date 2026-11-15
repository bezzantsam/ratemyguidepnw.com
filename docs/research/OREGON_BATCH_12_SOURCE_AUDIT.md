# Oregon Batch 12: 100 researched records and source-linked MVP discovery
**Date:** 2026-11-15  
**Branch:** `feature/batch12-100-guides-mvp-discovery-20261115`  
**Status:** Draft, no merge, publication, live database writes or guide outreach.

## Evidence and the denominator
- **100 distinct additional Oregon registry identities** selected. None overlap the previous 100 reviewed lead IDs and none existed in the prior 194-entry draft enrichment JSON.
- **19** researched against readable public business/operator or third-party sources. Their **35 named waterway claims** were transcribed conservatively into draft enrichment. Source-only is appropriate when the page does not name current fishing water.
- **81** imported website strings remain unverified candidates. They are saved in the review manifest but **not** added to public source-linked enrichment.
- Draft source-linked/enriched profiles increase **194 → 213**. This is not 213 claimed, licensed, paid or complete profiles.
- Every source-linked guide profile still needs editorial URL, person/business attribution, fishery and currency review before merge. Observed date indicates when this research was reviewed, not when a license or trip was last confirmed.
- Full manifest: `docs/research/OREGON_BATCH_12_100_REVIEW.json`.

## Source-reviewed records
| ID | Imported person | Evidence URL | Conservative named fishing waters |
|---|---|---|---|
| OG.0003311 | James Dyer | https://tightlinesridgelines.com/ | Rogue River |
| OG.0003122 | Zachary Shirley | https://www.shirleycatch.com/fishing-faqs | Columbia River, Sandy River |
| OG.0004099 | Halston West | https://eastbywestguideservice.com/ | Lake Roosevelt, Long Lake, Columbia River, Snake River |
| OG.0001256 | Griffith Marshall | https://www.griffmarshalloutdoors.com/lower-deschutes-river-day-trips | Lower Deschutes River |
| OG.0000738 | Curtis Currey | https://curreyguideservice.com/about/ | none claimed |
| OG.0000643 | James Andras | https://www.andrasoutfitters.com/ | Rogue River, Klamath River, South Umpqua River |
| OG.0003708 | James Parsons | https://www.parsonsfishing.com/ | Columbia River, Pacific Ocean |
| OG.0003709 | Robert Parsons | https://www.parsonsfishing.com/ | Columbia River, Pacific Ocean |
| OG.0004072 | Garrett Cochran | https://www.cochransguideservice.com/ | Buoy 10 |
| OG.0003572 | Ryan Taylor | https://www.catchingchromeguideservice.com/about | Columbia River, Willamette River |
| OG.0000416 | Robert Crandall | https://watertimeoutfitters.com/meet-our-guides/ | Deschutes River |
| OG.0002710 | Gordon Webster | https://blackdoggguideservice.com/our-story | Pacific Ocean, Buoy 10, Columbia River |
| OG.0003455 | Kyle Wattenburg | https://firstalarmfishingguide.com/ | Wallowa Lake |
| OG.0003604 | Daniel Cornell | https://silvertrainfishing.com/ | none claimed |
| OG.0001556 | Jason Schultz | https://www.hellscanyonsportfishing.com/fishing-guides | Snake River, Clearwater River, Columbia River |
| OG.0003972 | Evan Libby | https://www.blackstarfishing.com/ | Columbia River, Wynoochee River, Cowlitz River, Skagit River, Sauk River |
| OG.0003071 | Neil Bohne | https://www.rockbottomfish.com/about | Pacific Ocean, Columbia River |
| OG.0003631 | Russell Pearson | https://www.roamaboutoutdoors.com/ | none claimed |
| OG.0003923 | Michael Buzbee | https://fishingbooker.com/profile/view/1279876 | Columbia River, Buoy 10 |

## Deliberate exclusions and conflicts
- OG.0004090: Chrome Quest business page and third-party listing disagree on the operator first name; do not equate David/Matt Ellington.
- OG.0003455: First Alarm's current website explicitly says its 2026 season ended July 21; **never** mark it open or accepting current bookings because of a website link.
- OG.0004099: East By West's fishing services are described in Eastern Washington, even though the imported registration is in the Oregon source. Do not fabricate an Oregon trip.
- OG.0003923: fishingbooker profile is a third-party source for Michael Buzbee. Do not turn it into verified Oregon state credentials.
- OG.0003708 and OG.0003709 are distinct people listed together by Parsons Fishing. Neither receives the other's personal review or identity.
- OG.0002710: "Gordy" and Gordon Webster are not automatically asserted to be the same legal-name record beyond the matched business source.
- OG.0000738: childhood Clackamas fishing in the operator bio does not establish a current Clackamas guiding service.
- Unrelated goods vendors (Hayes Custom Boats and Vertical Jigs & Lures), explicitly held/rejected candidates and generic marketplaces were excluded from selection.
- No current status, availability, rates, license, credential, boat, personal phone, review score or booking assertion was imported. Prices displayed on public sources are **not** included because they may change.

## MVP use
This branch also introduces an optional **Only show source-linked guide profiles** checkbox in guide discovery. It uses the same editorial enrichment already displayed on each guide profile, not imported broad registration zones. It defaults off so the full directory remains searchable and does not represent source-linked guides as certified.

Do not merge until CI, interactive smoke testing, and source-level editorial checks complete. Do not deploy without a separate explicit release decision.
