export const BRAND_NAME = 'Rate Your Guide';
const VERCEL_FALLBACK_ORIGIN = 'https://ratemyguidepnw.vercel.app';
const CUSTOM_PUBLIC_ORIGIN = 'https://rateyourguide.com';

// Client and server bundles must agree. Preview, development and builds
// without the production marker always keep the existing public origin.
export const PUBLIC_ORIGIN =
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' &&
  process.env.NEXT_PUBLIC_RMG_CANONICAL_CUTOVER_ENABLED === 'true'
    ? CUSTOM_PUBLIC_ORIGIN
    : VERCEL_FALLBACK_ORIGIN;
const PROFILE_PATH = /^\/(?:guides\/og-\d{7}(?:-[a-z0-9]+)*|washington\/wa-\d{3,})$/;
const REVIEW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function canonicalProfileUrl(profilePath: string): string {
  if (!PROFILE_PATH.test(profilePath)) throw new Error('Invalid guide profile path');
  return PUBLIC_ORIGIN + profilePath;
}

/** The review intent must also be supported by the agreed sign-in return contract. */
export function canonicalReviewRequestUrl(profilePath: string): string {
  return `${canonicalProfileUrl(profilePath)}?intent=review#write-review`;
}

export function canonicalPublishedReviewUrl(profilePath:string,id:string):string {
  if(!REVIEW_ID.test(id))throw new Error('Invalid review ID');
  return `${canonicalProfileUrl(profilePath)}#review-${id.toLowerCase()}`;
}

export function publishedReviewIdFromHash(hash:string):string|null {
  const match=hash.match(/^#review-([0-9a-f-]+)$/i);
  return match&&REVIEW_ID.test(match[1])?match[1].toLowerCase():null;
}

/** Accept only this profile or its review intent when restoring an authentication return. */
export function safeGuideReturnTo(candidate:string | null | undefined, profilePath:string):string {
  canonicalProfileUrl(profilePath); // Reject an invalid expected profile too.
  const reviewPath=`${profilePath}?intent=review#write-review`;
  if(candidate===profilePath||candidate===reviewPath)return candidate;
  const prefix=`${profilePath}#review-`;
  if(candidate?.startsWith(prefix)&&publishedReviewIdFromHash(candidate.slice(profilePath.length)))return candidate;
  return profilePath;
}

/** Auth providers use the fragment for their response, so keep review intent in the query. */
export function guideAuthRedirectPath(candidate:string, profilePath:string):string {
  canonicalProfileUrl(profilePath);
  if (candidate === `${profilePath}?intent=review#write-review` || candidate === `${profilePath}?intent=review`) {
    return `${profilePath}?intent=review`;
  }
  const hash=candidate.startsWith(`${profilePath}#`)?candidate.slice(profilePath.length):'';
  const id=publishedReviewIdFromHash(hash);
  if(id)return `${profilePath}?review=${id}`;
  const query=candidate.startsWith(`${profilePath}?review=`)?candidate.slice(`${profilePath}?review=`.length):'';
  if(REVIEW_ID.test(query))return `${profilePath}?review=${query.toLowerCase()}`;
  return profilePath;
}

/** Restore the review anchor only after the auth client has consumed its callback fragment. */
export function guideAuthRestoredPath(pathname:string, search:string, hash:string, profilePath:string):string | null {
  canonicalProfileUrl(profilePath);
  if(pathname!==profilePath)return null;
  if(search==='?intent=review'&&(hash===''||hash==='#write-review'))return `${profilePath}?intent=review#write-review`;
  const match=search.match(/^\?review=([0-9a-f-]+)$/i);
  if(match&&REVIEW_ID.test(match[1])&&(hash===''||publishedReviewIdFromHash(hash)===match[1].toLowerCase()))return `${profilePath}#review-${match[1].toLowerCase()}`;
  return null;
}

export function profileShareMetadata(profilePath: string, name: string, business: string | null) {
  const url = canonicalProfileUrl(profilePath);
  const person = name.trim();
  if (!person) throw new Error('A profile name is required');
  const title = `${person} | ${BRAND_NAME}`;
  const description = `${person}${business?.trim() ? ` · ${business.trim()}` : ''}. Browse this fishing guide listing on ${BRAND_NAME}.`;
  return {
    title,
    description,
    alternates:{canonical:url},
    openGraph:{type:'website' as const,url,title,description,siteName:BRAND_NAME,images:[{url:`${PUBLIC_ORIGIN}/share-card.png`,width:1200,height:630,alt:`${BRAND_NAME} fishing guide directory`}]},
    twitter:{card:'summary_large_image' as const,title,description,images:[`${PUBLIC_ORIGIN}/share-card.png`]},
  };
}
