/** Legacy browser shortlist, retained for explicit import into an account. */
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

export type SavedGuideIdentity = Readonly<{jurisdiction: 'OR' | 'WA'; sourceId: string}>;
export type SavedGuideEntry = Readonly<{guide: SavedGuideIdentity; href: string; name: string}>;
export type SavedGuideAction = 'list' | 'save' | 'remove' | 'import';
export type SavedGuideStatus = 'listed' | 'saved' | 'removed' | 'imported' | 'full';

export function savedGuideKey({jurisdiction, sourceId}: SavedGuideIdentity): string {
  return `${jurisdiction}:${sourceId}`;
}

export function deviceGuidesForImport(paths: string[], entries: ReadonlyMap<string, SavedGuideEntry>): SavedGuideEntry[] {
  const found = new Map<string, SavedGuideEntry>();
  for (const path of paths) {
    const entry = entries.get(path);
    if (entry) found.set(savedGuideKey(entry.guide), entry);
  }
  return [...found.values()];
}

function isSavedGuide(value: unknown): value is SavedGuideIdentity {
  if (!value || typeof value !== 'object') return false;
  const {jurisdiction, sourceId} = value as Partial<SavedGuideIdentity>;
  return typeof sourceId === 'string' &&
    (jurisdiction === 'OR' ? /^OG\.[0-9]{7}(\.[A-Z0-9&]+)?$/.test(sourceId)
      : jurisdiction === 'WA' && /^wa-[0-9]{3,9}$/.test(sourceId));
}

const resultStatuses: Record<SavedGuideAction, readonly SavedGuideStatus[]> = {
  list: ['listed'], save: ['saved', 'full'], remove: ['removed'], import: ['imported', 'full'],
};

export function decodeAccountShortlist(value: unknown, action: SavedGuideAction) {
  if (!value || typeof value !== 'object') throw new Error('Invalid Saved guides response');
  const {items, status} = value as {items?: unknown; status?: SavedGuideStatus};
  if (!status || !resultStatuses[action].includes(status) || !Array.isArray(items) ||
      items.length > MAX_SAVED_GUIDES || !items.every(isSavedGuide) ||
      new Set(items.map(savedGuideKey)).size !== items.length) {
    throw new Error('Invalid Saved guides response');
  }
  return {items, status};
}
