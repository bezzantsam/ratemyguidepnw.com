import {ReviewShare} from './ReviewShare';
import {ReportReview} from './ReportReview';
import {REVIEW_DIMENSIONS,type ReviewDimensions} from './submission-model';
import type {ReportReason} from '@/lib/launch-client';
type ReportAction=(id:string,reason:ReportReason)=>Promise<{id:string;status:'submitted';existing:boolean}>;

/** Display data is supplied by the published-only backend adapter. */
export type PublishedReview = Readonly<{
  id: string;
  guideKey: string;
  status: 'published';
  rating: number;
  wouldBookAgain?: boolean;
  ratings?: ReviewDimensions;
  body: string;
  publishedAt: string;
  tripMonth?: string | null;
  tripDetails?: readonly string[] | null;
}>;
export type PublishedReviewPage = Readonly<{
  guideKey: string;
  total: number;
  average: number | null;
  reviews: readonly PublishedReview[];
}>;

/** Refuse mismatched identities and malformed summaries rather than showing a wrong rating. */
export function validReviewPage(requestedGuide: string, page: PublishedReviewPage): boolean {
  if (!requestedGuide || !page || page.guideKey !== requestedGuide || !Number.isSafeInteger(page.total) || page.total < 0 || !Array.isArray(page.reviews) || page.reviews.length > page.total) return false;
  if (page.total === 0 ? page.average !== null : typeof page.average !== 'number' || !Number.isFinite(page.average) || page.average < 1 || page.average > 5) return false;
  const ids = new Set<string>();
  return page.reviews.every(review=>{
    if (!review || typeof review.id !== 'string' || !review.id || ids.has(review.id) || review.guideKey !== requestedGuide || review.status !== 'published' ||
        !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5 || typeof review.body !== 'string' || !review.body.trim() || typeof review.publishedAt !== 'string' || !review.publishedAt || (review.tripMonth!==undefined&&review.tripMonth!==null&&!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(review.tripMonth)) || (review.tripDetails!==undefined&&review.tripDetails!==null&&(!Array.isArray(review.tripDetails)||!review.tripDetails.every((item:unknown)=>typeof item==='string')))) return false;
    ids.add(review.id);
    return true;
  });
}

export type ReviewLoadState = Readonly<{status:'loading'}> | Readonly<{status:'error'}> | Readonly<{status:'ready'; page:PublishedReviewPage}>;

export function ReviewCard({review,profilePath,guideName,onReport,allowSignIn=true}:{review:PublishedReview;profilePath?:string;guideName?:string;onReport?:ReportAction;allowSignIn?:boolean}) {
  return <article className="card" id={`review-${review.id}`}>
    <p><strong>Overall quality: {review.rating} / 5</strong> · Published {review.publishedAt}</p>
    {typeof review.wouldBookAgain==='boolean'&&<p>Would book again: <strong>{review.wouldBookAgain?'Yes':'No'}</strong></p>}
    {!!review.ratings&&Object.keys(review.ratings).length>0&&<dl className="published-review-dimensions" aria-label="Individual ratings">
      {REVIEW_DIMENSIONS.map(({key,label})=>review.ratings?.[key]===undefined?null:<div key={key}>
        <dt>{label}</dt><dd>{review.ratings[key]} / 5</dd>
      </div>)}
    </dl>}
    <p>{review.body}</p>
    {review.tripMonth&&<p>Trip month reported by the angler: {review.tripMonth}</p>}
    {review.tripDetails===null?<p>Trip details are temporarily unavailable.</p>:!!review.tripDetails?.length&&<details><summary>Trip details reported by the angler</summary><ul>{review.tripDetails.map((item,index)=><li key={index}>{item}</li>)}</ul></details>}
    {profilePath&&guideName&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(review.id)&&<ReviewShare profilePath={profilePath} reviewId={review.id} guideName={guideName}/>}
    <ReportReview onReport={onReport?(reason=>onReport(review.id,reason)):undefined} allowSignIn={allowSignIn}/>
  </article>;
}

export function PublishedReviews({guideKey, state,profilePath,guideName,onReport,allowSignIn=true,compactProfile=false,inviteFirst=false}: {guideKey:string; state:ReviewLoadState;profilePath?:string;guideName?:string;onReport?:ReportAction;allowSignIn?:boolean;compactProfile?:boolean;inviteFirst?:boolean}) {
  if (state.status === 'loading') return compactProfile ? null : <p role="status">Loading reviews…</p>;
  if (state.status === 'error' || !validReviewPage(guideKey, state.page)) return compactProfile ? null : <p role="status">Reviews are temporarily unavailable.</p>;
  const {page} = state;
  if (!page.total) {
    if (compactProfile) return inviteFirst ? <p>Fished with this guide? Be the first to share your experience.</p> : null;
    return <p>No published reviews yet.</p>;
  }
  return <section aria-labelledby="published-reviews-heading">
    <h2 id="published-reviews-heading">Angler reviews</h2>
    {!compactProfile && <p><strong>{page.average?.toFixed(1)} / 5</strong> · {page.total} {page.total === 1 ? 'published review' : 'published reviews'}</p>}
    {page.reviews.map(review=><ReviewCard key={review.id} review={review} profilePath={profilePath} guideName={guideName} onReport={onReport} allowSignIn={allowSignIn}/>)}
  </section>;
}
