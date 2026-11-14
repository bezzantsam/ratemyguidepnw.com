/** Browser-only shortlist of public guide profile routes. No account, tracking, or server storage. */
export const SAVED_GUIDES_KEY = 'rmgpnw:saved-guides:v1';
export const SAVED_GUIDES_CHANGED = 'rmgpnw:saved-guides-changed';
export const MAX_SAVED_GUIDES = 50;
const ALLOWED_PATH = /^\/(?:guides\/[a-zA-Z0-9_-]+|washington\/[a-zA-Z0-9_-]+)$/;

export function normalizeSavedGuides(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const path of value) {
    if (typeof path !== 'string' || !ALLOWED_PATH.test(path)) continue;
    seen.add(path);
    if (seen.size >= MAX_SAVED_GUIDES) break;
  }
  return [...seen];
}

export function readSavedGuides(): string[] {
  if (typeof window === 'undefined') return [];
  try { return normalizeSavedGuides(JSON.parse(window.localStorage.getItem(SAVED_GUIDES_KEY) || '[]')); }
  catch { return []; }
}

export function toggleSavedGuide(href: string): {saved: boolean; full: boolean} {
  const list = readSavedGuides();
  if (!ALLOWED_PATH.test(href)) return {saved: false, full: false};
  const has = list.includes(href);
  if (!has && list.length >= MAX_SAVED_GUIDES) return {saved: false, full: true};
  const next = has ? list.filter(item => item !== href) : [...list, href];
  try {
    window.localStorage.setItem(SAVED_GUIDES_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(SAVED_GUIDES_CHANGED));
    return {saved: !has, full: false};
  } catch { return {saved: has, full: false}; }
}
