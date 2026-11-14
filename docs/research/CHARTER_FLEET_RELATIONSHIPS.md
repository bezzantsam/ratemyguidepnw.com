# Private charter-fleet relationship research

Saltwater charter operations have an outfitter, one or more distinct vessels,
captains attached to individual vessels, and sometimes an outfitter-wide crew
roster. **Never merge captains, co-captains or deckhands into personal aliases.**
This distinction is not relevant to ordinary river/bank guides, who should
never be required to select a charter vessel.

The Gemini handoff has two researched fleets: Dockside Charters in Depoe Bay
and Gambler Charter in Ilwaco. Its 2026-11-13.v2 structured source reports
seven Dockside vessels and two Gambler/Outlaw vessels. Some Gambler crew names
are duplicated under BOTH boats, although the supporting source identifies
an outfitter crew roster rather than verified vessel-specific assignments.

This tool conservatively relocates **only repeated within-fleet deckhand
relationships** into an outfitter-level roster. Those crew members remain
searchable in editorial work, but are NOT automatically assigned to every
boat. Other crew and captain relationships also remain **unverified source
claims** until separately reviewed.

## Workflow (offline)

Save the original Gemini 2026-11-13.v2 JSON under ignored research-drafts,
not under public lib/:

~~~bash
python3 scripts/charter_fleet_research.py \
  --input research-drafts/charter-source-v2.json \
  --out research-drafts/charter-fleet-review.json
~~~

The result has:
- Fleet keys, names as reported and **null** public directory IDs.
- Vessel names and original textual specifications with
  current_hull_verified=false.
- Captains as separate **research-only** people with unknown credentials,
  separate from crew members.
- Crew as claimed for a vessel or marked outfitter_roster_only when the
  identical name appears on more than one vessel in that fleet.
- Per-vessel claim URL, reported observation date and a marker that the
  contents have **not** been independently rechecked.
- Review-only status and conflict notes from the original research.

The normalized object does not claim active individual licenses, registered
operators, ship manifests, current hull delivery, ratings or verified identity.

In particular:
- The two boats **The Gambler** and **The Outlaw** are separate vessels.
- Jed Stout and Dustin Greene remain proposed separate captains.
- Hunter Stout, Eric, Serge and Chad must not be duplicated as verified
  deckhands on both boats merely because Gemini listed a shared crew roster.
- On Dockside's Tacklebuster and Surfrider, Tyler Turner's same-name
  references share a **fleet-local research key only**, never a public
  directory ID or captain-review identity.
- The Sunrise's crew member Grant has only a first name, so any vessel
  association remains under review with unknown credentials.
- A proposed future boat hull in operator marketing is not proof it was
  delivered or is currently in service.

Human editorial review must inspect each operator source and independently
match business, hull, individual captain and crew before proposing a public
charter profile.

Input and output live exclusively in gitignored research-drafts. The script
never modifies lib/, Next.js pages, Supabase, review identity data, or actual
guide ratings.

## Tests

~~~bash
python3 -m unittest discover -s tests -p 'test_charter_fleet_research.py' -v
~~~

Tests use synthetic charter businesses only and check duplicate outfitter
rosters, distinct vessels, captain identity isolation, HTTPS citations,
unknown credentials, noncharter exclusion and output-path safety.
