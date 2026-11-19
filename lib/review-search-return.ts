import {safeDirectoryReturn} from './directory-url';

const lifetime = 60 * 60 * 1000;

export function reviewSearchReturn(search: string): string | null {
 const values = new URLSearchParams(search).getAll('returnTo');
 if (values.length !== 1) return null;
 const value = values[0];
 return value === safeDirectoryReturn(value) ? value : null;
}

export function rememberReviewSearch(profilePath: string, search: string) {
 const key = 'rmg-review-search:' + profilePath;
 const target = reviewSearchReturn(search);
 try {
  if (target) window.localStorage.setItem(key, JSON.stringify({target, expiresAt: Date.now() + lifetime}));
  else window.localStorage.removeItem(key);
 } catch {
  // Sign-in can continue when browser storage is unavailable.
 }
}

export function takeReviewSearch(profilePath: string): string | null {
 const key = 'rmg-review-search:' + profilePath;
 try {
  const saved = window.localStorage.getItem(key);
  if (!saved) return null;
  window.localStorage.removeItem(key);
  const {target, expiresAt} = JSON.parse(saved);
  const now = Date.now();
  if (typeof expiresAt !== 'number' || expiresAt <= now || expiresAt > now + lifetime) return null;
  return typeof target === 'string' && target === safeDirectoryReturn(target) ? target : null;
 } catch {
  return null;
 }
}
