import type {TripResponses} from './trip-responses';

/** Internal presentation types; the backend wire contract is agreed separately. */
export type SubmissionStatus = 'pending' | 'published' | 'rejected' | 'removed' | 'approved' | 'denied';
export type SubmissionReceipt = Readonly<{ id:string; status: SubmissionStatus; message?: string }>;
export type RelationshipDisclosure = 'none' | 'personal' | 'financial' | 'other';
export type ReviewDraft = Readonly<{
  quality: number;
  intensity: number;
  wouldBookAgain: boolean | null;
  body: string;
  firsthand: boolean;
  tripMonth: string | null;
  relationship: RelationshipDisclosure | null;
  tripResponses?: TripResponses | null;
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

export function validateReviewDraft(draft: ReviewDraft): string | null {
  if (!Number.isInteger(draft.quality) || draft.quality < 1 || draft.quality > 5) return 'Choose a quality rating from 1 to 5.';
  if (!Number.isInteger(draft.intensity) || draft.intensity < 1 || draft.intensity > 5) return 'Choose an intensity rating from 1 to 5.';
  if (typeof draft.wouldBookAgain !== 'boolean') return 'Choose whether you would book again.';
  const body = draft.body.trim();
  if (Array.from(body).length < 80 || body.length > 3000) return 'Describe your experience in 80 to 3,000 characters.';
  if (!draft.firsthand) return 'Confirm that you personally took the trip.';
  if (!draft.relationship || !['none','personal','financial','other'].includes(draft.relationship)) return 'Choose the relationship that applies to you.';
  if (draft.tripMonth !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.tripMonth)) return 'Enter a valid trip month.';
  return null;
}

export function validateClaimStatement(value: string): string | null {
  const evidence = value.trim();
  return Array.from(evidence).length >= 20 && evidence.length <= 2000 ? null : 'Explain your connection to this listing in 20 to 2,000 characters.';
}

export function validateClaimDraft(draft: ClaimDraft): string | null {
  if (Array.from(draft.claimantName.trim()).length < 2 || draft.claimantName.trim().length > 120) return 'Enter your name in 2 to 120 characters.';
  if (draft.businessName.trim().length > 160) return 'Use at most 160 characters for the business name.';
  return validateClaimStatement(draft.evidence);
}
