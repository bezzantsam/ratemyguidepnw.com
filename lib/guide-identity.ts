/**
 * Review-level guardrails for imported PNW guide identities.
 *
 * Identity is a PERSON, not a brand, website, surname, business, vessel or phone.
 * Curated negative pairs prevent future automatic merge proposals. Group membership
 * never merges reviews, captain claims, Saved Guides or licensing evidence.
 */
export const DO_NOT_MERGE_PAIRS = [
  ['OG.0003790','OG.0000914'], // William Sanborn / Bandit vs Raymond Herzman / 1 Arm Bandit
  ['wa-141','OG.0000315'], // Paul Lewis (Seattle) vs Marvin Henkel (Oregon): distinct Fast Action brands
  ['OG.0000050','OG.0000989'], // Shea vs Lance Fisher
  ['OG.0000050','OG.0003043'], // Shea vs Tony Fisher
  ['OG.0000050','OG.0003998'], // Shea vs Miles Fisher
  ['OG.0000989','OG.0003043'], // Lance vs Tony Fisher
  ['OG.0000989','OG.0003998'], // Lance vs Miles Fisher
  ['OG.0003043','OG.0003998'], // Tony vs Miles: same outfitter, separate people
  ['wa-005','wa-062'], // Andy Lockey vs Neils Humphries
  ['wa-050','wa-059'], // Mark vs Mitchell Coleman
  ['OG.0000329','OG.0000726'], // Mark Lytle vs Joseph Hay
] as const satisfies ReadonlyArray<readonly [string,string]>;

const pairKey=(a:string,b:string)=>[a,b].sort().join('|');
const excludedPairs=new Set(DO_NOT_MERGE_PAIRS.map(([a,b])=>pairKey(a,b)));

/** Identity-matching code must consult this before offering a merge action. */
export function isExplicitlyDistinctCaptain(a:string,b:string):boolean {
  return a!==b && excludedPairs.has(pairKey(a,b));
}

export type OutfitterGroup = {
  id:string;
  displayName:string;
  profileIds:readonly string[];
  /** How this limited group was established; NOT verified account ownership. */
  basis:'matching_imported_business'|'public_operator_roster';
  sourceUrl?:string;
};
export const OUTFITTER_GROUPS:readonly OutfitterGroup[]=[
  {
    id:'river-dog-outfitters',
    displayName:'River Dog Outfitters',
    profileIds:['wa-005','wa-062'],
    basis:'public_operator_roster',
    sourceUrl:'https://riverdog-outfitters.com/',
  },
  {
    id:'all-rivers-saltwater',
    displayName:'All Rivers & Saltwater Charters',
    profileIds:['wa-050','wa-059'],
    basis:'matching_imported_business',
  },
  {
    id:'fishers-catch',
    displayName:'Fishers Catch Outfitters',
    profileIds:['OG.0003043','OG.0003998'],
    basis:'matching_imported_business',
  },
];

/** A shared source business is a GROUPING, never evidence that two people are one. */
export function relatedOutfitterGroup(publicId:string):OutfitterGroup|null {
  return OUTFITTER_GROUPS.find(group=>group.profileIds.includes(publicId))??null;
}

export type ReconciliationCandidate = {
  washingtonId:string;
  oregonRegistration:string;
  reason:string;
  state:'manual_review_required';
};
/** Strong-looking but unconfirmed cross-state links. Not used in automatic de-duplication. */
export const PENDING_CROSS_STATE_REVIEW:readonly ReconciliationCandidate[]=[
  {
    washingtonId:'wa-117', oregonRegistration:'OG.0000989',
    reason:'Exact imported personal and business name: Lance Fisher / Lance Fisher Fishing. Check independent ownership evidence before linking.',
    state:'manual_review_required',
  },
  {
    washingtonId:'wa-065', oregonRegistration:'OG.0002805',
    reason:'Robert (RJ) Bennett / Robert Bennett, Lower Columbia Guide Service. Confirm same person independently before linking.',
    state:'manual_review_required',
  },
];
