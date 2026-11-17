/** Internal presentation types; the backend wire contract is agreed separately. */
export type SubmissionStatus = 'pending' | 'published' | 'rejected' | 'removed' | 'approved' | 'denied';
export type SubmissionReceipt = Readonly<{ status: SubmissionStatus; message?: string }>;
export type ReviewDraft = Readonly<{
  quality: number;
  intensity: number;
  wouldBookAgain: boolean | null;
  body: string;
  firsthand: boolean;
  tripMonth: string | null;
}>;

/** Never invent a success status when a backend response is missing or malformed. */
export function isSubmissionReceipt(value: unknown, kind: 'review' | 'claim'): value is SubmissionReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Record<string, unknown>;
  const allowed = kind === 'review' ? ['pending','published','rejected','removed'] : ['pending','approved','denied'];
  return typeof receipt.status === 'string' && allowed.includes(receipt.status) &&
    (receipt.message === undefined || typeof receipt.message === 'string');
}

export function validateReviewDraft(draft: ReviewDraft): string | null {
  if (!Number.isInteger(draft.quality) || draft.quality < 1 || draft.quality > 5) return 'Choose a quality rating from 1 to 5.';
  if (!Number.isInteger(draft.intensity) || draft.intensity < 1 || draft.intensity > 5) return 'Choose an intensity rating from 1 to 5.';
  if (typeof draft.wouldBookAgain !== 'boolean') return 'Choose whether you would book again.';
  const length = Array.from(draft.body.trim()).length;
  if (length < 80 || length > 3000) return 'Describe your experience in 80 to 3,000 characters.';
  if (!draft.firsthand) return 'Confirm that you personally took the trip.';
  if (draft.tripMonth !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.tripMonth)) return 'Enter a valid trip month.';
  return null;
}

export function validateClaimStatement(value: string): string | null {
  const length = Array.from(value.trim()).length;
  return length >= 8 && length <= 1200 ? null : 'Explain your connection to this listing in 8 to 1,200 characters.';
}
