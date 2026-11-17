/** Internal presentation types; the backend wire contract is agreed separately. */
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type SubmissionReceipt = Readonly<{ status: SubmissionStatus; message?: string }>;
export type ReviewDraft = Readonly<{
  rating: number;
  body: string;
  firsthand: boolean;
}>;

/** Never invent a success status when a backend response is missing or malformed. */
export function isSubmissionReceipt(value: unknown): value is SubmissionReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Record<string, unknown>;
  return (receipt.status === 'pending' || receipt.status === 'approved' || receipt.status === 'rejected') &&
    (receipt.message === undefined || typeof receipt.message === 'string');
}

export function validateReviewDraft(draft: ReviewDraft): string | null {
  if (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5) return 'Choose a rating from 1 to 5.';
  const length = draft.body.trim().length;
  if (length < 20 || length > 500) return 'Describe your experience in 20 to 500 characters.';
  if (!draft.firsthand) return 'Confirm that you personally took the trip.';
  return null;
}

export function validateClaimStatement(value: string): string | null {
  const length = value.trim().length;
  return length >= 20 && length <= 1000 ? null : 'Explain your connection to this listing in 20 to 1,000 characters.';
}
