# Pennsylvania fishing directory sources and reuse

Checked 2026-11-25. Target water: Lake Erie and Presque Isle Bay. This note records how the public roster works, what a purposive sample could support, and the exact reuse terms found on the pages that were opened. It does not list individual permit holders, hulls, or booking sites. Those rows stay outside this repository.

No one was contacted. No listing was published. The Fish and Boat Commission roster was used as a lookup, not copied into a directory.

## Credential

The Pennsylvania Fish and Boat Commission issues one combined Charter Boat/Fishing Guide permit. It runs for the calendar year and expires December 31. The statute and 58 Pa. Code Chapter 51, Subchapter L, use the same permit for two different activities.

A charter boat is a boat operated as a commercial enterprise that carries passengers for hire to fish. A fishing guide is a person who guides or leads others to fish for consideration. The credential holder is the person. The public roster does not name a hull and does not mark a row as charter boat or fishing guide.

Posted purchase prices on the application page are $101.97 resident and $401.97 nonresident, including a $1.00 issuing-agent fee and a $0.97 transaction fee. The official fee statute lists $100 resident and $400 nonresident before those add-ons. Online catalog codes in the how-to PDF are 178 resident and 179 nonresident. When a boat is used, the operator also needs a Commission or NASBLA boating-safety certificate or a U.S. Coast Guard boat-operator license. The insurance minimum, amended effective August 30, 2025, is $250,000 each occurrence and $500,000 aggregate. A Pennsylvania boat launch creates a rebuttable presumption of operating on Commonwealth boundary waters. A Coast Guard merchant-mariner credential is a separate federal document. The roster does not display it.

## How the roster is published

The landing page offers three static HTML files. There is no search box, no water filter, and no port filter.

| Sort | URL | Last-Modified |
| --- | --- | --- |
| County of business | https://pfbc.pa.gov/images/admin/guides/Report1.htm | Wed, 25 Nov 2026 02:05:03 GMT |
| Business name | https://pfbc.pa.gov/images/admin/guides/Report2.htm | Wed, 25 Nov 2026 02:05:02 GMT |
| Guide name | https://pfbc.pa.gov/images/admin/guides/Report3.htm | Wed, 25 Nov 2026 02:05:04 GMT |

Report2 columns are business name and address, county of business, and guide name and cell phone. Some rows add a free-text Business Website control. The file has no vessel, hull, port, departure, water, permit-type, or permit-number field. The agency does not print a total. Counts below are parses of the HTML on the checked date.

Report2 parsed to 579 business rows and 658 guide-name slots. Thirty-five businesses list more than one guide name. Report1 parsed to the same 579 business rows. Report3 parsed to 656 rows. The person-level total is unverified, so it is left null. Eight business-name strings appear on more than one row. Sixty-eight county values appear. Address counties outside a Pennsylvania name include New York 29, Ohio 8, New Jersey 10, Maryland 7, West Virginia 2, and Other 12. Words in a business name are not a legal class. Across the file, 70 names contain “charter,” 151 contain “guide,” and 41 contain “outfit.”

The website control is present on 303 of 579 rows. Of those controls, 255 look like URLs, 18 look like street addresses, 6 are email addresses, 15 are blank claims such as “n/a” or “none,” and 9 are other text. Addresses, phone numbers, and email addresses from the roster are not repeated here.

A legacy path printed inside the HTML, https://fishandboat.com/Fish/Pages/CharterBoatsFishingGuides.aspx, redirects to the agency home page. It is not a second directory.

## Why the Lake Erie count is null

County of business is the address county on the permit record. It does not identify the departure water. Erie County of business is 74 business rows and 78 guide-name slots. That is an address count. It includes businesses whose trips may leave another state, and it excludes permit holders who fish Lake Erie from an address in another county.

The Erie Pennsylvania Charter Boat Association captain page is a membership directory. It parsed to 32 named entries after dropping a blank template row. One entry names a New York port. The count is directory rows, not unique hulls, and the page has no as-of date. Association membership is not the licensed population.

Walnut Creek Marina, a Commission landing on Lake Erie at Fairview, links charter boats and guides back to the statewide roster. It does not publish a marina fleet. The Lake Erie and Presque Isle Bay departure population is null.

Boat-title facts cannot fill that gap in bulk. 58 Pa. Code § 93.117 releases owner, lienholder, title date, and make, model, and year for one identified boat at a time, and it withholds title-holder mailing lists except for official government use.

## Sample

The sample is purposive. It is four Report2 business rows that show a Pennsylvania Lake Erie or Presque Isle Bay departure on a page the business itself publishes. It is not the first four rows of the file, and it is not an Erie County slice.

Each booking site was treated as one publisher even when more than one page was opened. A row was recorded as a vessel only when the booking page named a physical hull and a second publisher agreed on that hull. A brand, a boat model offered as a menu choice, or an association line alone was not treated as a hull.

| Roster | Population | Parsed count | Sampled | Supported | Held | Independent publisher matches |
| --- | --- | --- | --- | --- | --- | --- |
| Report2 business file | Statewide business rows. Departure population is null. | 579 | 4 | 2 | 2 | 4 |
| Report3 guide file | Same permits, person sort. Person total unverified. | null | 0 | 0 | 0 | 0 |
| Association captain page | Members, not licensees. | 32 | 3 | 2 | 1 | 3 |

Arithmetic: 4 = 2 + 2 on the Commission business file, 0 = 0 + 0 on the guide file, and 3 = 2 + 1 on the association page. The association sample is the three overlapping member rows inside the four. The fourth Commission row is not on the association page. The two samples are not added together.

Of the four Commission rows, two are supported as vessels. Each booking page names a hull, and the association directory names the same length and model. One of those states a public-dock departure in Presque Isle Bay. The other states a seasonal Erie, Pennsylvania departure and also a seasonal departure outside Pennsylvania. For that second vessel, the marina name appears only on the association page.

Two rows are held as operator services. On one, the booking page and the association directory name different boat models, and the roster website field is a street address rather than the booking URL. On the other, the booking form offers two boat models, names no dock, does not print the roster guide name, and the business is absent from the association page. Neither is recorded as a vessel.

Other booking pages were opened and left out of the row set when the hull or the dock did not reconcile. No separate inland-guide row was added. A business name was not turned into a hull.

## Reuse

Public viewing, a Right-to-Know response, and a license to keep a commercial directory current are different things.

The roster footer links to https://pfbc.pa.gov/webprivacy.htm. That page is an index to the Commonwealth accessibility, privacy, and security policies. https://www.pa.gov/privacy-policy governs information the Commonwealth collects from visitors. It says the Commonwealth will not sell or rent personal information it collects online, except as provided by law. That sentence is about the Commonwealth’s own use of visitor data. It does not grant or deny a third-party copy of the roster. The pages state no copyright license and no public-domain dedication for the directory. Reuse status for the roster: no affirmative grant.

30 Pa.C.S. § 324 says Commission records that contain a home address or other personal information, including permits and applications, are not public records under the cited Right-to-Know Law. The 1957 citation on that page was repealed and replaced by the 2008 Right-to-Know Law. The HTML roster still prints business addresses and cell phones. That posting was not read as permission to copy them.

58 Pa. Code § 51.9 and the Commission Right-to-Know page require a written request. Anonymous and oral requests are refused. Fees can apply. A granted request is access to a record. It is not a standing license to republish a commercial directory or to claim a listing.

The Pennsylvania Code site, including Subchapter L and § 93.117, states that no part of the information on the site may be reproduced for profit or sold for profit. The code database was current through 56 Pa.B. 6006 (September 5, 2026) on the checked date.

https://data.pa.gov/data-policy offers data sets on that portal free and without restriction. Attribution is requested and not required. A catalog search limited to data.pa.gov did not find a charter boat or fishing guide roster. PALS sales outlets on the portal are license-sales locations, not permit holders. The portal grant does not cover this roster.

The association’s June 2015 Rev3 bylaws say a captain member is listed in the captain directory and that an unpaid member’s online listing is removed. The bylaws contain no copyright license, no commercial-reuse grant, and no bulk download. Joining the association is not permission for a third party to republish the directory.

Of the four booking sites, three state no terms of use and no directory grant. One homepage prints a 2023 all-rights-reserved line and states no permission to copy the page into another directory. Operator names and URLs are omitted here because they identify individual people.

The Coast Guard National Maritime Center page linked by the Commission, https://www.dco.uscg.mil/nmc/charter_boat_captain/, returned HTTP 403. No federal reuse terms were read.

## Unresolved

The first permission question is whether the Commission authorizes a commercial directory to copy, redistribute, and keep current the posted roster. The HTML files and the privacy policy they link do not grant that license.

Also unresolved: the person-level roster total, the Lake Erie and Presque Isle Bay departure denominator, and any written process that would allow a directory to claim a listing in the permit holder’s name. Until the Commission states those terms, Report2 is a current credential lookup only.

## Sources opened

- Landing page: https://www.pa.gov/agencies/fishandboat/about-us/affiliates/charter-boats-and-fishing-guides
- Rosters: Report1, Report2, and Report3 at the paths in the table above
- Apply: https://www.pa.gov/services/fishandboat/apply-to-become-a-charter-boat-operator-or-fishing-guide
- How-to PDF: https://www.pa.gov/content/dam/copapwp-pagov/en/fishandboat/documents/about-us/affiliates/charters-guides/charterboatfishingguide-howtoguide.pdf
- 58 Pa. Code Chapter 51, Subchapter L: https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/058/chapter51/subchapLtoc.html&d=reduce
- 30 Pa.C.S. § 2907.3: https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/30/00.029.007.003..HTM
- 30 Pa.C.S. § 324: https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/30/00.003.024.000..HTM
- Right-to-Know instructions: https://www.pa.gov/services/fishandboat/submit-a-fish-and-boat-commission-right-to-know-request
- 58 Pa. Code § 51.9: https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/058/chapter51/chap51toc.html&d=#51.9.
- 58 Pa. Code § 93.117: https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/058/chapter93/s93.117.html&d=reduce
- data.pa.gov policy: https://data.pa.gov/data-policy
- Commonwealth privacy policy: https://www.pa.gov/privacy-policy
- Roster policy index: https://pfbc.pa.gov/webprivacy.htm
- Walnut Creek Marina: https://www.pa.gov/agencies/fishandboat/boating/where-to-boat/walnut-creek-marina
- Association directory: https://epacba.com/captains.htm
- Association bylaws: https://epacba.com/business/EPACBA%20By-Laws%20-%20june2015rev3.pdf
- Association home: https://epacba.com/
- Legacy roster URL, redirects away: https://fishandboat.com/Fish/Pages/CharterBoatsFishingGuides.aspx
- Coast Guard page, HTTP 403: https://www.dco.uscg.mil/nmc/charter_boat_captain/

Machine-readable fields for the same sources and counts are in `source-index.json` in this directory.
