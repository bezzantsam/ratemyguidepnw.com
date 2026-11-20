import type {TripResponses} from './trip-responses';

/** Internal presentation types; the backend wire contract is agreed separately. */
export type SubmissionStatus = 'pending' | 'published' | 'rejected' | 'removed' | 'approved' | 'denied';
export type SubmissionReceipt = Readonly<{ id:string; status: SubmissionStatus; message?: string }>;
export type RelationshipDisclosure = 'none' | 'personal' | 'financial' | 'other';
export const REVIEW_DIMENSIONS = [
  {key:'communication',label:'Communication'},
  {key:'professionalism',label:'Professionalism'},
  {key:'safety',label:'Safety'},
  {key:'equipment',label:'Equipment'},
  {key:'knowledge',label:'Knowledge'},
  {key:'effort',label:'Effort'},
  {key:'value',label:'Value'},
] as const;
export type ReviewDimension = typeof REVIEW_DIMENSIONS[number]['key'];
export type ReviewDimensions = Partial<Record<ReviewDimension, number>>;
export type ReviewRatingPatch = Partial<Record<ReviewDimension, number | null>>;

export function isReviewScore(value:unknown):value is number {
  return typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=5;
}

/** Published, edit and moderator read models use the same legacy score columns. */
export function readReviewDimensions(row:Record<string,unknown>):ReviewDimensions|null {
  const values:ReviewDimensions={};
  for(const {key} of REVIEW_DIMENSIONS) {
    const score=row[key==='value'?'value_rating':key];
    if(score===null||score===undefined)continue;
    if(!isReviewScore(score))return null;
    values[key]=score;
  }
  return values;
}

export type ReviewDraft = Readonly<{
  quality: number;
  intensity: number | null;
  wouldBookAgain: boolean | null;
  body: string;
  firsthand: boolean;
  tripMonth: string | null;
  relationship: RelationshipDisclosure | null;
  tripResponses?: TripResponses | null;
  ratingVersion?: 1;
  ratings?: ReviewRatingPatch;
}>;
export type ClaimDraft = Readonly<{claimantName:string; businessName:string; evidence:string}>;

/** Never invent a success status when a backend response is missing or malformed. */
export function isSubmissionReceipt(value: unknown, kind: 'review' | 'claim'): value is SubmissionReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Record<string, unknown>;
  const allowed = kind === 'review' ? ['pending','published','rejected','removed'] : ['pending','approved','denied'];
  return typeof receipt.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt.id) && typeof receipt.status === 'string' && allowed.includes(receipt.status) &&
    (receipt.message === undefined || typeof receipt.message === 'string');
}

export function validateReviewDraft(draft: ReviewDraft, mode:'review'|'revision'='review'): string | null {
  if (!isReviewScore(draft.quality)) return 'Choose a quality rating from 1 to 5.';
  if (draft.intensity!==null && (!Number.isInteger(draft.intensity) || draft.intensity < 1 || draft.intensity > 5)) return 'Choose an intensity rating from 1 to 5, or leave it unanswered.';
  if (draft.wouldBookAgain!==null && typeof draft.wouldBookAgain !== 'boolean') return 'Choose whether you would book again, or leave it unanswered.';
  if (draft.ratingVersion===1 && mode==='review' && draft.wouldBookAgain===null) return 'Choose Yes or No for whether you would book again.';
  if (draft.ratings!==undefined) {
    if (!draft.ratings || Array.isArray(draft.ratings) || typeof draft.ratings!=='object' ||
      Object.entries(draft.ratings).some(([key,value])=>!REVIEW_DIMENSIONS.some(field=>field.key===key) ||
        !(isReviewScore(value)||(mode==='revision'&&value===null)))) return 'Choose a rating from 1 to 5, or clear it.';
  }
  const body = draft.body.trim();
  if (Array.from(body).length < 1 || body.length > 3000) return 'Describe your experience in 1 to 3,000 characters.';
  if (!draft.firsthand) return 'Confirm that you personally took the trip.';
  if (!draft.relationship || !['none','personal','financial','other'].includes(draft.relationship)) return 'Choose the relationship that applies to you.';
  if (draft.tripMonth !== null && !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(draft.tripMonth)) return 'Enter a valid trip month.';
  return null;
}

export function validateClaimStatement(value: string): string | null {
  const evidence = value.trim();
  return Array.from(evidence).length >= 20 && evidence.length <= 1200 ? null : 'Explain your connection to this listing in 20 to 1,200 characters.';
}

export function validateClaimDraft(draft: ClaimDraft): string | null {
  if (Array.from(draft.claimantName.trim()).length < 2 || draft.claimantName.trim().length > 120) return 'Enter your name in 2 to 120 characters.';
  if (draft.businessName.trim().length > 160) return 'Use at most 160 characters for the business name.';
  return validateClaimStatement(draft.evidence);
}
