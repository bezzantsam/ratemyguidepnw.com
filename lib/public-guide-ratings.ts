import type {GuideSource} from './launch-client';

export type GuideRatingSummary = Readonly<{count: number; averageQuality: number | null}>;
const MAX_GUIDES_PER_REQUEST = 30;

export function guideRatingKey({jurisdiction, sourceId}: GuideSource): string {
 return `${jurisdiction}:${sourceId}`;
}

function record(value: unknown): Record<string, unknown> | null {
 return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function fetchPublicGuideRatings(guides: GuideSource[], signal: AbortSignal): Promise<Map<string, GuideRatingSummary>> {
 const summaries = new Map<string, GuideRatingSummary>();
 if (!guides.length) return summaries;
 const requested = new Map(guides.map(guide => [guideRatingKey(guide), guide]));
 if (requested.size > MAX_GUIDES_PER_REQUEST) throw new Error('Too many guides for one ratings request');
 const response = await fetch('/api/launch', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({operation: 'public_review_summaries', guides: [...requested.values()]}),
  mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal,
 });
 if (!response.ok) throw new Error('Ratings unavailable');
 const data = record(await response.json());
 if (!Array.isArray(data?.items) || data.items.length > MAX_GUIDES_PER_REQUEST) throw new Error('Invalid ratings response');

 const seen = new Set<string>();
 for (const value of data.items) {
  const item = record(value);
  if (!item || (item.jurisdiction !== 'OR' && item.jurisdiction !== 'WA') || typeof item.sourceId !== 'string') continue;
  const key = guideRatingKey({jurisdiction: item.jurisdiction, sourceId: item.sourceId});
  if (!requested.has(key)) continue;
  if (seen.has(key)) { summaries.delete(key); continue; }
  seen.add(key);
  const {count, averageQuality} = item;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) continue;
  if (count === 0 && averageQuality === null) summaries.set(key, {count, averageQuality});
  if (count > 0 && typeof averageQuality === 'number' && averageQuality >= 1 && averageQuality <= 5) {
   summaries.set(key, {count, averageQuality});
  }
 }
 return summaries;
}
