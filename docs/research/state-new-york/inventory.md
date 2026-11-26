# New York fishing directory inventory

Checked 2026-11-25. Water in scope: Montauk. This note records the licensing lookups, the reuse terms that were actually printed, and aggregate sample counts. Individual boats, captains, and booking sites are not named here.

No one was contacted. No listing was published.

## What was found

New York publishes two different credentials.

A licensed guide is a person. The DEC guide program page says a guide is someone 18 or older who offers hired services that include directing, instructing, or aiding another person in fishing or in other listed outdoor activities. The license lasts five years. The page states $100 for the first category, including the application fee, and $20 for each added category. There is no added fee for boats and canoes. Environmental Conservation Law section 11-0533, as printed in the DEC guide PDF, caps the fee at $200 and says the department shall publish a list of guides annually. The same section exempts a person who is operating or assisting on a public vessel for hire, licensed by the U.S. Coast Guard or New York State, on the Atlantic Ocean and other marine and coastal waters. The program page states that exemption for Coast Guard licensed passenger vessels and names the Atlantic Ocean, other marine and coastal waters, and several large rivers and lakes. A Montauk party or charter boat sits in that setting when it is such a vessel. The guide file is therefore not a Montauk boat roster. Absence from it does not show that a boat lacks the marine license.

The marine party and charter boat license is the vessel credential. ECL section 13-0336, displayed by the Senate site as revised 2014-09-22, requires the owner or operator to hold a $250 annual license and a recreational marine fishing registration before carrying recreational fishing passengers in the marine and coastal district or landing fish taken outside state waters. The license must be on the vessel and expires December 31. The DEC page uses the same fee and expiration. It asks for a Coast Guard captain's license, the vessel registration or documentation, and a certificate of inspection when the vessel carries more than six passengers. A numerical cap is mentioned only for six-passenger-or-fewer licenses. The cap number is not printed. Party and charter are not defined on that page as different hire units. Both are vessels carrying passengers for hire to take marine fish.

## The two public files

The guide dataset on Open NY is a person file. Its rows were last updated on 2026-10-01. Metadata says it is refreshed once a year, includes only licenses active at publication, and that an expiration date beyond five years is a data error. Columns include name, residence, badge, activity, business name, and a telephone column. There is no vessel or port. On this check the API returned 1,457 fishing-activity rows and 1,445 distinct badges. All 1,457 rows have a badge. Twelve badges appear twice. Suffolk County accounts for 41 fishing rows and 41 badges. Two fishing badges list Montauk as the residence city. That is not a count of boats leaving Montauk. The dataset notes point to a DEC search application for newer information. The old search address redirects there. Two requests to the new host were reset before a form or a count appeared.

The party and charter dataset is also on Open NY. Its rows were last updated on 2026-11-20, and the metadata says it is posted weekly. The description says it is the current year's license holders and that each vessel needs its own license. Columns include the holder, mailing city, vessel name, and a registration or documentation number. There is no length, builder, passenger capacity, or hailing port. The file warns that city, county, and state come from the mailing address and may not be where the boat operates. The API returned 39 rows, 39 distinct vessel names, and 39 distinct registration values. No name was blank and no name was repeated. Mailing counties were OTHER 17, Suffolk 11, Nassau 9, Putnam 1, and Queens 1. Two rows use Montauk as the mailing city. That is not a departure census. Hulls named on Montauk booking pages opened the same day are absent from the 39 names. The licensed Montauk departure population is null.

## Reuse

DEC website pages and Open NY datasets are under different terms.

The DEC web-content policy encourages educational use of DEC website work. It says any other use, including commercial use, needs explicit written permission. It discourages resale of publicly funded work and refuses uses that imply DEC sponsorship. A permission form is linked and was not opened. The guide program page, the party-and-charter page, and the guide statute PDF are DEC website material.

The OPEN-NY terms of use were last modified March 8, 2013. The welcome text says they do not require attribution, share-alike, or pre-approval, and that lawful private-sector reuse is allowed. The contract also grants only a non-exclusive revocable license, allows content-specific terms, withholds third-party graphics and marks, disclaims accuracy after download, and says use does not create an endorsement or an agency relationship. Those terms cover the two datasets. They do not cover operator websites. The Open Data Handbook documents CSV, JSON, and other downloads and a REST API for datasets that are actually published.

The guide file contains telephone numbers. They were not copied. The portal terms do not add a separate ban on fields the agency has already posted. Copying them into a directory was not done.

## Montauk sample

No agency page filters party and charter licenses by port. The landing page that could be opened is the charter page of one marina on West Lake Drive. Its footer claims a 2014 copyright and all rights reserved. The body still uses 2016 booking language. Six hull labels can be separated. Four were checked. One agrees with the operator's own page on length and builder or type, and those two pages do not agree on the passenger authorization, so only the length and type are supported. One operator page repeats the marina's physical sentences so closely that it was not counted as a second look, and that label stays held. One label describes two different models and stays held. One linked operator host did not resolve on two attempts, so that label stays held. None of the opened pages showed a documentation number.

A second Montauk source is one operator's own fleet page. It names seven hulls and mixes party fishing, ferry service, cruise use, and a commercial vessel. One hull was sampled. Two pages of that same operator agree on length and disagree on the passenger license. The second page is not an independent publisher, so the hull stays held. The other six names were not given rows.

The samples are not added to each other or to the 39-row license file.

## Counts

| Source | What was counted | Count | Sampled | Supported | Held | Second publisher agrees |
| --- | --- | --- | --- | --- | --- | --- |
| One marina charter page | Named hull labels, not licenses | 6 | 4 | 1 | 3 | 1 |
| One operator fleet page | Hulls named by that operator | 7 | 1 | 0 | 1 | 0 |
| Party and charter license file | Posted current licenses | 39 | 0 | 0 | 0 | 0 |
| Guide license file, fishing activity | Person rows, not boats | 1,457 | 0 | 0 | 0 | 0 |

Arithmetic: 4 = 1 + 3, 1 = 0 + 1, and 0 = 0 + 0. The private sample is five candidates, one supported and four held. The licensed departure population for Montauk is null.

## Unresolved

The first permission question is whether the 39 posted party and charter rows are the complete issued set. The agency page calls the file the current list. The file's own mailing-address warning, and the Montauk hulls that are not in it, leave the departure count open.

Also unresolved: whether the guide exemption covers six-pack boats as well as inspected passenger vessels. The statute and the program page state the exemption for public vessels for hire licensed by the Coast Guard. They do not define a six-pack.

The live guide search could not be opened. The DEC permission form was not opened. A federal charter and party permit list was not opened. That federal list is the most useful next primary source, because the state page says federal for-hire trips need it and the state file has no hailing port or length.

## Sources opened

- Guide program: https://dec.ny.gov/regulatory/permits-licenses/fish-wildlife-plant/licensed-guide-program
- Guide statute PDF: https://dec.ny.gov/docs/legal_protection_pdf/guidesregs.pdf
- Guide dataset: https://data.ny.gov/Recreation/Guides-Currently-Licensed-in-New-York-State/q9d5-zxbn
- OPEN-NY terms: https://data.ny.gov/api/views/77gx-ii52/files/ef0c1840-ad54-4240-92fd-6397c49fde46?download=true
- Open Data Handbook, public use: https://ny.github.io/open-data-handbook/publicuse.html
- Guide search, redirected and then reset: https://appfactory.dec.ny.gov/LicensedGuides/
- Party and charter license: https://dec.ny.gov/things-to-do/saltwater-fishing/marine-permits-licenses/marine-district-party-charter-boat-license
- Marine permit index: https://dec.ny.gov/things-to-do/saltwater-fishing/marine-permits-licenses
- Party and charter application: https://dec.ny.gov/sites/default/files/2024-01/bmrpartycharterpermitapp.pdf
- ECL 13-0336: https://www.nysenate.gov/legislation/laws/ENV/13-0336
- Party and charter dataset: https://data.ny.gov/Energy-Environment/List-of-Current-Party-and-Charter-Boat-License-Hol/mxx4-xx35
- DEC web content policy: https://dec.ny.gov/about/website-usage-and-policies/website-content-usage
- Marina charter page: https://www.marinebasin.com/charter_boats

Machine-readable fields are in `inventory-sources.json`. Booking-site addresses are kept out of this directory because they identify individual operations.
