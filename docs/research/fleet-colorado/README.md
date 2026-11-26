# Colorado fishing-directory sources and reuse

Checked 2026-11-25. The waters in scope are the Arkansas River near Salida and the Upper Colorado. This note records how the credentials differ, what each publisher allows a commercial directory to do, and the aggregate result of a three-row operator sample. Outfitter names, license numbers, guide names, hull names, registration cities, and contact details stay outside this repository.

No one was contacted. This file is not a listing, a claim on a business, or a publishing decision.

## Credentials

Four instruments show up around a Colorado fly-fishing float. A booking page establishes none of them.

**DORA outfitter registration (hunting or fishing).** C.R.S. Title 12, Article 145, as reprinted at colorado.public.law from the 2024 CRS PDF and marked current through Fall 2025. An outfitter solicits or provides, for compensation, outfitting services for hunting or fishing on land the person does not own. Outfitting services include transportation by vessel and guiding persons in the take of wildlife. A guide accompanies the outfitter's client and is employed or contracted by the outfitter. The registrant is the outfitter. Guides are not separately registered. Section 12-145-105 requires the registration to be in effect and in the person's possession before the person acts as, advertises as, or represents themselves as an outfitter. An expired, suspended, or revoked registration does not authorize continued outfitting. The Office of Outfitters Registration sits in the Division of Professions and Occupations. The program page was live on this date and carried a 2026 rulemaking notice, so the article was still being administered. Later 2026 session-law amendments were not re-read. DPO states that registrations expire on March 31.

**CPW river outfitter license (river-running).** C.R.S. Title 33, Article 32, in the same public.law edition. A river outfitter advertises or provides river-running facilities, guide services, or transportation. A river guide is an individual employed for compensation to operate vessels. CPW's program page says every guide on a regulated river trip works for a licensed outfitter. The public list is a business roster. The guide roster described in program materials is an outfitter upload used by rangers. It is not a public roster. Under the fishing step on that page, CPW says fishing outfitters must register with DORA and that a DORA fishing outfitter number is required to apply for a river outfitter license. That sentence is under the fishing step. Applications run through the CPW river-outfitter portal linked from the program page.

**Land authorization on the water.** Arkansas Headwaters Recreation Area is a CPW state park along 152 miles of the Arkansas from the Leadville end to Lake Pueblo, with the visitor center in Salida, and the park page states 102 miles of Gold Medal trout water. The park page publishes no commercial roster. An October 29, 2025 CPW news release describes one open walk-and-wade permit as one of 15 total walk-and-wade authorizations, for a one-year term beginning spring 2026. That 15 is a cap in a dated release. It was not re-counted from a holder list. Commercial boating agreements are a separate authorization, and no current public name roster was found. On the Upper Colorado, the BLM Pumphouse Recreation Area page describes the most heavily used access between Kremmling and State Bridge, in the Upper Colorado River Special Recreation Management Area, with three developed boat ramps. A direct fetch returned no article body. The description is the official page text returned by search extraction the same day. The page names no commercial permittee. The BLM special-recreation-permit program URL also returned no article body.

**Forest Service commercial use.** The commercial recreation-event page defines a commercial use on National Forest System land as a charged fee or a primary purpose of selling a good or service, whether or not profit is intended. It is not a Colorado outfitter roster and not a Pike-San Isabel permittee list. The Forest Service link on the CPW river-outfitter page points at the DORA outfitters homepage.

A walk-and-wade trip can sit on a DORA registration and an AHRA authorization. A float that uses a vessel and a compensated guide sits on a CPW river outfitter license as well, and on the land permit for that reach. A hit in only one system is not a listing.

## Vessel definition on this date

The public.law copy of C.R.S. 33-32-102 includes stand-up paddleboards in "vessel" and excludes single-chambered air-inflated devices that are not paddleboards, and seaplanes. That copy cites the 2024 CRS PDF. HB 26-1197, Sunset Water Vessel Registration Program, became law: the Governor signed it on May 29, 2026, effective August 12, 2026, chapter 230. CPW Chapter P-3, marked approved November 4, 2026, says the bill revised the statutory vessel definition and that the implementing river-outfitter rules take effect January 1, 2027. Those rules would allow single-chambered one-person vessels, including paddleboards and packrafts, on regulated trips. They are not in force on 2026-11-25. The CPW program page still labels the operative regulations as effective July 2020. That July 2020 file was not opened. Anonymous rafts were omitted from vessel counts. No named hull was documented.

## What was counted

**CPW river-outfitter spreadsheet.** Linked from the program page. The first cell reads UPDATED 06/15/26. The CSV export on 2026-11-25 had 203 business rows: 165 valid through 2026, 18 through 2027, and 20 through 2028. Columns are business name, license number, contact name, DBA names, and valid-through year. The sheet has no guides, hulls, launches, waters, or DORA numbers. It is a snapshot. Contact names on the sheet were not copied.

**DORA real-time lookup.** Detail views state that they are primary source verification under C.R.S. 24-34-102. Fields read on the opened views: name, city and postal code, license number, DBA, license method, license type, status, original issue date, effective date, expiration date, and public discipline. The views have no water, launch, hull, or guide roster. Three outfitter detail views were opened for the three business names taken from the CPW sheet. Cities and postal codes from those views were not copied.

**DORA manual roster generator.** Outfitter is type OUT, all statuses, no fee. The verification page says this download is for a manual pull and is not for automated programs. The outfitter file was not downloaded, so its row count is unknown.

**Colorado Information Marketplace dataset `7s5z-vewr`.** Nightly bulk extract of all DPO license rows. Outfitter rows use license type OUT. Metadata license name is Public Domain (`PUBLIC_DOMAIN`). The catalog citation is DORA. The long description says the file is updated nightly, is for research, and is not guaranteed accurate or complete, and it points consumers to the real-time lookup. The same metadata file also labels Expected Update Frequency as both "Never" and "daily." A SODA query on 2026-11-25 of license type OUT returned 2,844 distinct license numbers and 3,188 rows. Distinct Active numbers were 935 (1,014 rows). One additional distinct license was Active - With Conditions (4 rows) and is outside the 935. Other distinct statuses: Expired 1,857; Revoked 23; Surrendered 20; Voluntary Surrender 6; Cancelled 2. The sum of those distinct-by-status figures is 2,844. This is a statewide hunting and fishing registration extract. It is not a count of Arkansas or Upper Colorado fly businesses, guides, or vessels. The live lookup was not re-counted for all 935. Personal name and address fields exist in the file and were not copied here.

**AROA member directory.** 31 unique member profile links on one page. Membership is not a CPW license, a DORA registration, an AHRA agreement, or a hull inventory. Terms prohibit copying, redistribution, use, or publication of site content, free or for pay. Member names, phones, and addresses were not copied. Sampled rows from this directory: 0.

**AHRA and BLM permittee rosters.** The current holder count is unknown. `roster_count` is null for both.

## Sample

Three CPW-list business rows were cross-checked in the live DORA lookup and, where a page rendered, on a first-party site. A multi-page operator site is one publisher. The three operator publishers are withheld from this repository.

| Population | Roster count | Sampled | Supported | Held | Independent publisher matches |
| --- | ---: | ---: | ---: | ---: | ---: |
| CPW river-outfitter businesses, sheet dated 2026-06-15 | 203 | 3 | 2 | 1 | 2 |
| Live DORA lookup of those three names | Unknown | 3 | 2 | 1 | 2 |
| Distinct Active OUT numbers in the nightly extract | 935 | 2 | 2 | 0 | 2 |
| AHRA walk-and-wade authorizations | Unknown | 0 | 0 | 0 | 0 |
| BLM Upper Colorado commercial permittees at Pumphouse | Unknown | 0 | 0 | 0 | 0 |
| AROA member profile links | 31 | 0 | 0 | 0 | 0 |

Sampled equals supported plus held on every row. The three-row sample is the same three businesses on the CPW row and the live-lookup row. The Active OUT row samples only the two supported businesses, because the held record is outside the 935 Active numbers. Those figures are not added together.

Supported rows are operators. Supported vessels: 0. Supported guides: 0. Operator pages described drift boats, rafts, or reservoir power boats without a hull name or a documentation number. Named people on those sites were not matched to a public guide credential.

The held row is a business whose CPW sheet row, dated 2026-06-15, still showed a river-outfitter license valid through 2026, while the live DORA outfitter record for that same business name was expired on 2026-03-31. The first-party URL returned only a title, so no water, launch, booking path, or hull was taken from it. The brand was not used to place the business on either target water.

Of the two supported operators, one describes Arkansas River fly-fishing trips and states that AHRA and Forest Service use fees apply. The land permit files were not opened. One describes an Upper Colorado float from Pumphouse to Catamount. That put-in is the operator's statement. It is not a BLM permittee-list confirmation. On that second operator, a registration number printed on the site did not match any outfitter license number in the nightly OUT extract. The row was supported on the legal name across the CPW list, the live DORA record, and the site. The printed number was not treated as verified. Sentences on that site about CPW and BLM special-use permits were not opened as permit files.

Registration cities on the DORA views were not treated as launches. The AHRA visitor center in Salida is a park office.

## Reuse

A current lookup, a commercial-reuse grant, and authority to claim a listing are three different things.

| Publisher | Reuse status | Basis |
| --- | --- | --- |
| Colorado Information Marketplace extract `7s5z-vewr` | public_domain | Metadata license name Public Domain. Research-use disclaimer. The license is not authority to claim a listing. The real-time lookup does not restate this license. |
| DORA verification page and manual roster generator | conditional | Automated programs are directed to the Information Marketplace. The roster download is for a manual pull. No commercial-directory grant. |
| DORA live lookup | unknown | Primary-source verification statement. Silent on commercial directory reuse. |
| CPW pages and the river-outfitter spreadsheet | unknown | Privacy statement covers CORA, cookies, accuracy, and non-endorsement. Silent on copyright, redistribution, and commercial directory reuse. The spreadsheet has no terms. |
| U.S. Forest Service commercial-use page and BLM Pumphouse page | unknown | No copyright or commercial-directory grant was stated on the text that could be read. |
| Statute and bill pages | unknown | Silent on commercial directory reuse. |
| Arkansas River Outfitters Association | prohibited | Terms prohibit copying, redistribution, use, or publication, free or for monetary gain. No permission process is stated. |
| Three first-party operator publishers | not_granted (1), unknown (2) | One privacy policy covers privacy and cookies and grants no directory reuse. One site presented no terms URL. The held page body did not render. |

The highest-priority permission question: the nightly DORA extract is labeled public domain, while the real-time outfitter lookup does not restate that license, and the CPW river-outfitter list is silent on reuse. None of those facts authorizes a commercial directory to claim an outfitter listing or to treat a current lookup as the outfitter's consent. The Arkansas River Outfitters Association terms separately prohibit republication of association content.

## Where to start

Start with the DORA live outfitter lookup for the hunting or fishing registration, then the CPW river-outfitter list for river-running, then the land authorization that covers the water: an AHRA agreement on the Arkansas and a BLM special recreation permit for commercial use of the Upper Colorado. A hit in only one system is not a listing. Add a guide or a hull only when a public record names that person or that hull.

## Unresolved

- No public current roster or count of AHRA commercial agreements, including boating, was found. The figure 15 is a walk-and-wade cap in an October 29, 2025 release.
- No public roster or count of BLM Upper Colorado special recreation permit holders was readable. The Pumphouse article body and the BLM permit program page did not return on direct fetch.
- The CPW list dated 2026-06-15 can still show a river-outfitter row after the matching DORA outfitter registration has expired.
- No public guide roster. CPW guide records sit inside the outfitter's application. DORA does not register guides separately.
- No named hull, documentation number, or ownership record was tied to a boat in the sample.
- CPW commercial-reuse terms are silent. The live lookup does not restate the Information Marketplace public-domain license.
- Information Marketplace metadata disagrees with itself on update frequency ("Never", "daily", and "nightly").
- Chapter P-3 as approved November 4, 2026 takes effect January 1, 2027. The post-August 2026 statutory vessel text was not re-read from the session laws. The July 2020 regulation file linked by CPW was not opened.
- The public.law Article 145 text was not reconciled to 2026 session laws.
- AROA directory content cannot be republished under the terms that were read. No permission path is stated.
- The manual OUT roster file was not downloaded.

## Links

Start: [cpw.state.co.us](https://cpw.state.co.us/).

River outfitters: [program page](https://cpw.state.co.us/river-outfitter-license), [published list](https://docs.google.com/spreadsheets/d/1eeu7A5AafTQkWA0x5dpgynuDGdY5kdQDMpCTvVA9EMI/edit?usp=sharing), [privacy and security statement](https://cpw.state.co.us/privacy-and-security-statement), [Chapter P-3 as approved November 4, 2026](https://cpw.state.co.us/sites/default/files/dam/k3c5yh2s0k/ch-p3-as-apprpved-nov-2026.pdf).

DORA: [Office of Outfitters Registration](https://dpo.colorado.gov/Outfitters), [verification channels](https://dpo.colorado.gov/CustomerService/Verification), [live lookup](https://apps2.colorado.gov/dora/licensing/lookup/licenselookup.aspx), [manual roster generator](https://apps2.colorado.gov/dora/licensing/Lookup/GenerateRoster.aspx), [Information Marketplace dataset](https://data.colorado.gov/Regulations/Professional-and-Occupational-Licenses-in-Colorado/7s5z-vewr), [dataset metadata](https://data.colorado.gov/api/views/7s5z-vewr.json).

Statutes and the vessel bill: [C.R.S. 12-145-103](https://colorado.public.law/statutes/crs_12-145-103), [C.R.S. 12-145-105](https://colorado.public.law/statutes/crs_12-145-105), [C.R.S. 33-32-102](https://colorado.public.law/statutes/crs_33-32-102), [HB 26-1197](https://leg.colorado.gov/bills/HB26-1197).

Water and association: [AHRA](https://cpw.state.co.us/state-parks/arkansas-headwaters-recreation-area), [walk-and-wade notice, October 29, 2025](https://cpw.state.co.us/news/10292025/updated-cpw-seeks-applicants-arkansas-headwaters-recreation-area-walk-and-wade-permit), [Forest Service commercial special use](https://www.fs.usda.gov/managing-land/lands-minerals-geology/special-uses/applying-for-permit/commercial), [BLM Pumphouse](https://www.blm.gov/visit/pumphouse-recreation-area), [AROA](https://arkansasriveroutfitters.org/), [AROA terms](https://arkansasriveroutfitters.org/terms-and-conditions/).

Machine-readable rows are in `source-index.json`. Operator publishers are omitted from that file.
