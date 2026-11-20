/** Browser-only shortlist of public guide profile routes. */
export const SAVED_GUIDES_KEY = 'rmgpnw:saved-guides:v1';
export const MAX_SAVED_GUIDES = 50;
const SAVED_GUIDES_CHANGED = 'rmgpnw:saved-guides-changed';
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

// Null means storage could not be read. An invalid value can be replaced.
export function readSavedGuides(): string[] | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(SAVED_GUIDES_KEY);
  } catch {
    return null;
  }
  try {
    return normalizeSavedGuides(JSON.parse(raw ?? '[]'));
  } catch {
    return [];
  }
}

export function subscribeSavedGuides(sync: () => void): () => void {
  function onStorage(event: StorageEvent) {
    if (event.key === SAVED_GUIDES_KEY || event.key === null) sync();
  }
  window.addEventListener(SAVED_GUIDES_CHANGED, sync);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(SAVED_GUIDES_CHANGED, sync);
    window.removeEventListener('storage', onStorage);
  };
}

export function toggleSavedGuide(href: string): 'saved' | 'removed' | 'full' | 'unavailable' {
  if (!ALLOWED_PATH.test(href)) return 'unavailable';
  const list = readSavedGuides();
  if (list === null) return 'unavailable';
  const has = list.includes(href);
  if (!has && list.length >= MAX_SAVED_GUIDES) return 'full';
  const next = has ? list.filter(item => item !== href) : [...list, href];
  try {
    window.localStorage.setItem(SAVED_GUIDES_KEY, JSON.stringify(next));
  } catch {
    return 'unavailable';
  }
  window.dispatchEvent(new Event(SAVED_GUIDES_CHANGED));
  return has ? 'removed' : 'saved';
}
