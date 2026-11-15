/** Crew relationships never create captain aliases, credentials or review owners. */
export type CharterCrewMember = {
  personId: string;
  name: string;
  role: 'deckhand' | 'mate';
};

export type CharterCrewAssignment = CharterCrewMember & {
  captainProfileId: string;
  context: 'saltwater_charter';
  evidence: {
    basis: 'firsthand_founder_report';
    reportedOn: string;
  };
  /** A crew report is not evidence of any license or permit. */
  credentialStatus: 'unknown';
};

export const CHARTER_CREW_ASSIGNMENTS: readonly CharterCrewAssignment[] = [
  {
    personId: 'crew-austin-rowe',
    name: 'Austin Rowe',
    role: 'deckhand',
    captainProfileId: 'OG.0003297',
    context: 'saltwater_charter',
    evidence: {basis: 'firsthand_founder_report', reportedOn: '2026-11-13'},
    credentialStatus: 'unknown',
  },
];

export function charterCrewFor(captainProfileId: string): readonly CharterCrewAssignment[] {
  return CHARTER_CREW_ASSIGNMENTS.filter(assignment =>
    assignment.captainProfileId === captainProfileId && assignment.context === 'saltwater_charter'
  );
}

/** Send only the fields needed to label crew matches in client-side search. */
export function charterCrewSearchMembers(captainProfileId: string): CharterCrewMember[] {
  return charterCrewFor(captainProfileId).map(({personId, name, role}) => ({personId, name, role}));
}
