/** Frontend form validation only. DB/RLS and moderator approvals remain authoritative. */
export const REVIEW_MIN_CHARS = 80;
export const REVIEW_MAX_CHARS = 500; // current SQL review body constraint
export const REVIEW_RATING_KEYS = [
  'quality', 'communication', 'safety', 'effort',
  'equipment', 'professionalism', 'knowledge', 'value_rating'
] as const;
export type ReviewRatingKey = typeof REVIEW_RATING_KEYS[number];
export type ReviewDraft = {
  month: string;
  ratings: Partial<Record<ReviewRatingKey, number>>;
  wouldBook: '' | 'yes' | 'no';
  outcome: 'not_disclosed' | 'limited' | 'caught' | 'slow';
  body: string;
  context: string;
  attested: boolean;
};
export const EMPTY_REVIEW_DRAFT: ReviewDraft = {
  month: '', ratings: {}, wouldBook: '', outcome: 'not_disclosed',
  body: '', context: '', attested: false,
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export function isValidTripMonth(month: string, latestMonth: string): boolean {
  return typeof month === 'string' && MONTH_PATTERN.test(month) &&
    month >= '2000-01' && month <= latestMonth;
}
export function isRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}
export function reviewStepError(step: 0|1|2, draft: ReviewDraft, latestMonth: string): string | null {
  if (step === 0 && !isValidTripMonth(draft.month, latestMonth)) return 'Choose a past trip month and year.';
  if (step === 1 && !isRating(draft.ratings.quality)) return 'Select an overall rating to continue.';
  if (step === 2) {
    const length = draft.body.trim().length;
    if (length < REVIEW_MIN_CHARS || length > REVIEW_MAX_CHARS) return 'Write 80–500 characters describing your firsthand trip.';
    if (draft.context.length > 140) return 'Keep trip context to 140 characters or fewer.';
    if (draft.wouldBook !== 'yes' && draft.wouldBook !== 'no') return 'Tell us whether you would book again.';
    if (!draft.attested) return 'Confirm this is your genuine firsthand experience.';
  }
  return null;
}
export function reviewPrivacyWarning(text: string): boolean {
  return /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}|\bmy name is\b/i.test(text);
}
export function createPendingReviewInsert(draft: ReviewDraft, guideId: string, authorId: string) {
  const ratings = draft.ratings;
  return {
    guide_id: guideId, author_id: authorId,
    quality: ratings.quality, intensity: 3, // existing required DB field; not a captain-quality score
    communication: ratings.communication ?? null, safety: ratings.safety ?? null,
    effort: ratings.effort ?? null, equipment: ratings.equipment ?? null,
    professionalism: ratings.professionalism ?? null,
    knowledge: ratings.knowledge ?? null, value_rating: ratings.value_rating ?? null,
    would_book_again: draft.wouldBook === 'yes', catch_outcome: draft.outcome,
    body: draft.body.trim(), trip_month: draft.month + '-01',
    trip_context: draft.context.trim() || null,
    // Database default must force pending; clients must not choose moderation status.
  };
}
