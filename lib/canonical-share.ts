/** Public share links are independent of the current request or preview host. */
export const PUBLIC_ORIGIN = 'https://ratemyguidepnw.com';
const PROFILE_PATH = /^\/(?:guides\/og-\d{7}(?:-[a-z0-9]+)*|washington\/wa-\d{3,})$/;

export function canonicalProfileUrl(profilePath: string): string {
  if (!PROFILE_PATH.test(profilePath)) throw new Error('Invalid guide profile path');
  return PUBLIC_ORIGIN + profilePath;
}

/** The review intent must also be supported by the agreed sign-in return contract. */
export function canonicalReviewRequestUrl(profilePath: string): string {
  return `${canonicalProfileUrl(profilePath)}?intent=review#write-review`;
}

/** Accept only this profile or its review intent when restoring an authentication return. */
export function safeGuideReturnTo(candidate:string | null | undefined, profilePath:string):string {
  canonicalProfileUrl(profilePath); // Reject an invalid expected profile too.
  const reviewPath=`${profilePath}?intent=review#write-review`;
  return candidate === profilePath || candidate === reviewPath ? candidate : profilePath;
}

/** Auth providers use the fragment for their response, so keep review intent in the query. */
export function guideAuthRedirectPath(candidate:string, profilePath:string):string {
  canonicalProfileUrl(profilePath);
  if (candidate === `${profilePath}?intent=review#write-review` || candidate === `${profilePath}?intent=review`) {
    return `${profilePath}?intent=review`;
  }
  return profilePath;
}

/** Restore the review anchor only after the auth client has consumed its callback fragment. */
export function guideAuthRestoredPath(pathname:string, search:string, hash:string, profilePath:string):string | null {
  canonicalProfileUrl(profilePath);
  if (pathname !== profilePath || search !== '?intent=review' || (hash !== '' && hash !== '#write-review')) return null;
  return `${profilePath}?intent=review#write-review`;
}

export function profileShareMetadata(profilePath: string, name: string, business: string | null) {
  const url = canonicalProfileUrl(profilePath);
  const person = name.trim();
  if (!person) throw new Error('A profile name is required');
  const title = `${person} | RateMyGuidePNW`;
  const description = `${person}${business?.trim() ? ` · ${business.trim()}` : ''}. Browse this fishing guide listing on RateMyGuidePNW.`;
  return {
    title,
    description,
    alternates:{canonical:url},
    openGraph:{type:'website' as const,url,title,description,siteName:'RateMyGuidePNW',images:[{url:`${PUBLIC_ORIGIN}/share-card.png`,width:1200,height:630,alt:'RateMyGuidePNW fishing guide directory'}]},
    twitter:{card:'summary_large_image' as const,title,description,images:[`${PUBLIC_ORIGIN}/share-card.png`]},
  };
}
