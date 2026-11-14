# Saltwater charter crew

This slice adds separate crew people and reported saltwater assignments to existing
captain profiles. It is stacked on founder-guide search PR #77. It does not change
captain IDs, imported datasets, ratings, account ownership or review inserts.

## First record

Sam identified Walter/Walt Rowe as the captain and Austin Rowe as his deckhand in
the November 13, 2026 handoff. Austin is a separate person, not a captain alias.
The relationship is explicitly labeled as a firsthand founder report. It is not
an independent credential check or confirmation of the current crew schedule.
The possible guide license remains unknown. No family relationship is published.

The directory can find Walt's existing profile by Austin's name while displaying
Austin as reported crew. Only the explicit saltwater assignment shows the crew
panel; broad registry ocean zones never imply a crew assignment. Other river and
bank profiles gain no crew controls or required vessel selection.

Crew feedback uses the existing optional review narrative and existing moderation
path. There is no separate crew score, required identification, new database field
or promise that backend submissions are active. A crew member may be mentioned
only from the reviewer's firsthand experience.

## Next source batch

Gemini is researching Dockside, Outlaw, Gambler and other requested operators.
Do not import its proposed fleet/captain mappings as verified facts without review.
Match known public captain IDs, keep person IDs separate from captain registrations,
and record evidence for each relationship before adding assignments. New evidence
types require explicit rendering and tests; do not relabel public-source research
as a founder report. Vessel-specific review tags and independent crew ratings are
not implemented in this slice.

## Validation

`npm run test:discovery` includes the crew regression tests, using the real
directory and production filter plus rendered React markup. It checks separate
identities, filter behavior, unchanged IDs, evidence labels and absent controls on
unrelated profiles. The existing CI discovery step runs these tests without a
workflow-file change. TypeScript and the full production build remain required.
