import {REVIEW_DIMENSIONS, isReviewScore, type ReviewDimensions, type RelationshipDisclosure} from './submission-model';
import {TRIP_FIELDS, type TripDraft} from './trip-responses';

export type ReviewDraftScope = Readonly<{
  accountId: string;
  jurisdiction: 'OR' | 'WA';
  sourceId: string;
  reviewId?: string;
}>;
export type ReviewDraftMode = 'review' | 'revision';

/** Editable values, including incomplete answers which are not yet valid submissions. */
export type SavedReviewDraft = {
  quality: string;
  intensity: string;
  wouldBookAgain: string;
  ratings: ReviewDimensions;
  body: string;
  tripMonth: string;
  tripDraft: TripDraft | null;
  relationship: RelationshipDisclosure | '';
  firsthand: boolean;
  needsCheck: boolean;
};

const PREFIX = 'rmg:review-draft:v1:';
export const REVIEW_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 200;

export function reviewDraftStorageKey(scope: ReviewDraftScope, mode: ReviewDraftMode = 'review'): string | null {
  if (!scope || !identifier(scope.accountId) || !identifier(scope.sourceId) ||
      !['OR', 'WA'].includes(scope.jurisdiction) || !['review', 'revision'].includes(mode) ||
      (scope.reviewId !== undefined && !identifier(scope.reviewId)) ||
      (mode === 'revision' && !identifier(scope.reviewId))) return null;
  return PREFIX + [scope.accountId, scope.jurisdiction, scope.sourceId, mode, scope.reviewId ?? '']
    .map(encodeURIComponent).join(':');
}

function cleanDraft(value: unknown): SavedReviewDraft | null {
  if (!isRecord(value) || !['', '1', '2', '3', '4', '5'].includes(value.quality as string) ||
      !['', '1', '2', '3', '4', '5'].includes(value.intensity as string) ||
      !['', 'yes', 'no'].includes(value.wouldBookAgain as string) ||
      typeof value.body !== 'string' || value.body.length > 3000 ||
      typeof value.tripMonth !== 'string' || value.tripMonth.length > 32 ||
      !['', 'none', 'personal', 'financial', 'other'].includes(value.relationship as string) ||
      typeof value.firsthand !== 'boolean' || typeof value.needsCheck !== 'boolean' ||
      !isRecord(value.ratings)) return null;
  const ratings: ReviewDimensions = {};
  for (const [key, score] of Object.entries(value.ratings)) {
    const dimension = REVIEW_DIMENSIONS.find(field => field.key === key);
    if (!dimension || !isReviewScore(score)) return null;
    ratings[dimension.key] = score;
  }
  let tripDraft: Record<string, string> | null = null;
  if (value.tripDraft !== null) {
    if (!isRecord(value.tripDraft)) return null;
    tripDraft = {};
    for (const [key, entry] of Object.entries(value.tripDraft)) {
      // Do not encode here: values such as "value:" are legitimate unfinished inputs.
      if (!TRIP_FIELDS.some(field => field.key === key) || typeof entry !== 'string' || entry.length > 128) return null;
      tripDraft[key] = entry;
    }
  }
  return {
    quality: value.quality as string, intensity: value.intensity as string,
    wouldBookAgain: value.wouldBookAgain as string, ratings, body: value.body,
    tripMonth: value.tripMonth, tripDraft, relationship: value.relationship as SavedReviewDraft['relationship'],
    firsthand: value.firsthand, needsCheck: value.needsCheck,
  };
}

type ReadResult = {status: 'empty' | 'unavailable'; draft?: never} | {status: 'restored'; draft: SavedReviewDraft};

export function readReviewDraft(scope: ReviewDraftScope, mode: ReviewDraftMode = 'review', now = Date.now()): ReadResult {
  const key = reviewDraftStorageKey(scope, mode);
  if (!key) return {status: 'unavailable'};
  try {
    const storage = window.localStorage;
    const raw = storage.getItem(key);
    if (raw === null) return {status: 'empty'};
    let saved: unknown;
    try { saved = raw.length <= 15000 ? JSON.parse(raw) : null; } catch { saved = null; }
    const savedScope = isRecord(saved) && isRecord(saved.scope) ? saved.scope : null;
    const draft = isRecord(saved) ? cleanDraft(saved.draft) : null;
    if (!isRecord(saved) || saved.version !== 1 || saved.mode !== mode || !draft ||
        !savedScope || savedScope.accountId !== scope.accountId || savedScope.jurisdiction !== scope.jurisdiction ||
        savedScope.sourceId !== scope.sourceId || (savedScope.reviewId ?? '') !== (scope.reviewId ?? '') ||
        typeof saved.updatedAt !== 'number' || !Number.isFinite(saved.updatedAt) ||
        saved.updatedAt > now || now - saved.updatedAt >= REVIEW_DRAFT_MAX_AGE_MS) {
      storage.removeItem(key);
      return {status: 'empty'};
    }
    return {status: 'restored', draft};
  } catch { return {status: 'unavailable'}; }
}

export function saveReviewDraft(scope: ReviewDraftScope, mode: ReviewDraftMode, value: SavedReviewDraft, now = Date.now()): boolean {
  const key = reviewDraftStorageKey(scope, mode), draft = cleanDraft(value);
  if (!key || !draft) return false;
  try {
    // Deliberately reconstruct the envelope: no account session, tokens, or extra props are stored.
    window.localStorage.setItem(key, JSON.stringify({
      version: 1, updatedAt: now, mode,
      scope: {accountId: scope.accountId, jurisdiction: scope.jurisdiction, sourceId: scope.sourceId,
        ...(scope.reviewId ? {reviewId: scope.reviewId} : {})},
      draft,
    }));
    return true;
  } catch { return false; }
}

export function clearReviewDraft(scope: ReviewDraftScope, mode: ReviewDraftMode = 'review'): boolean {
  const key = reviewDraftStorageKey(scope, mode);
  if (!key) return false;
  try { window.localStorage.removeItem(key); return true; } catch { return false; }
}

export function clearReviewDraftsForAccount(accountId: string): boolean {
  if (!identifier(accountId)) return false;
  try {
    const storage = window.localStorage, prefix = PREFIX + encodeURIComponent(accountId) + ':';
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    return true;
  } catch { return false; }
}
