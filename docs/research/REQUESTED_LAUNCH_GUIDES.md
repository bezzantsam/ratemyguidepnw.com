# Requested launch guide integration, 2026-11-14

This change adds 13 enrichments to existing profiles, not 13 new people. The separate JSON review queue is not imported by the application. Public-source claims do not change historical records, credentials, reviews, ownership or publication permissions. This is a draft branch, not a production publication.

| Existing ID | Imported person | Public names / source scope |
| --- | --- | --- |
| OG.0001093 | Cameron Black | Gone Catchin’; operator site plus Addicted roster |
| OG.0002882 | Cameron Kennedy | CK Sport Fishing; named waters on operator site |
| OG.0003549 | Daniel Coelho | Dan Coelho / Twin Spin; tourism directory supports name/business only |
| OG.0003348 | Keondre Menefee | Dre Menefee / Valley Coast Outdoors; operator site |
| OG.0003790 | William Sanborn | Bandit Guide Services / Beach Bandit Crab Snares; explicit registration number on operator page |
| OG.0001778 | Nicolai Popov | Nick Popov / Peel The Reel; operator site and roster |
| OG.0004032 | Jason Harmsen | Steel Obsession; operator site and roster |
| OG.0000218 | David Manners | Big Dave Manners; operator site and roster |
| OG.0004079 | Clifford Sallee | Cliff Sallee / Reel Adrenaline; operator site and roster |
| OG.0001248 | Ryan McCaughan | Riverside Guide Service; operator site and roster |
| wa-021 | Charles Stahley | Bonk ’Em All Adventures; operator site and roster |
| OG.0003644 | James Moore | Moore Fishing Guide Service; roster only (operator URL not readable in this check) |
| OG.0003023 | Branden Trager | Adventures With Mayhem Outfitters; roster only |

Exact source URLs and observation dates are attached to each enrichment in `lib/guide-enrichment.json`. All nine named booking cards on the checked Addicted page are represented; a listed affiliation is not proof of credentials or ongoing commercial availability. Testimonials and older appearances are not treated as current roster cards. No legal allegations are added to guide profiles.

## Conservative exclusions

- Bandit's shore activities do not by themselves substantiate Columbia/Willamette waterway tags. Its imported person is William Sanborn. Do not merge with Raymond Herzman's 1 Arm Bandit operation.
- Twin Spin's conflicting tourism phone numbers and unnamed brother are excluded. A Drano trip video is not treated as a current advertised package. Daniel's existing profile remains separate from the unresolved co-guide.
- Valley Coast LLC is not added as an alias from unrelated hospitality listings. A business site's name does not certify a legal identity.
- Cameron Black and Ryan McCaughan also have Washington records. These remain manual cross-state reconciliation candidates rather than automatic merges.
- Existing Walt/Austin separation from PR #79 is preserved. No automatic assignment of shared outfitter deckhands to individual vessels.
- Dockside's fleet page supports seven publicly listed vessel/captain pairings. Full names for Captain JT, dual assignments, historical transitions, specs and deckhand assignments require additional evidence. Gambler pages returned no readable text, so the supplied exact hull/captain mappings remain pending.
- Kodi Cherry and Cleve Lorton remain named priority entries in the private review queue. No genealogy, obituary, residential-phone, tribal membership or permit claims are inferred.
- The earlier eight Oregon enrichment profiles are retained, not relabeled as comprehensively re-audited by this change. No new unsupported boats, seasons, credentials or current booking claims are adopted from the pasted report.

## Validation

Discovery tests exercise actual directory searches, resolved IDs, source-only React rendering, and exclusion of unsupported waterways/aliases. Identity tests check all negative pairs. Full `npm run check` includes typecheck and production build. No live Supabase or credential-upload behavior is introduced or claimed.
