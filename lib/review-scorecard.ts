/**
 * Transparent raw mean over the *published review rows actually returned*
 * from the public_angler_reviews read model. Never infer verified trips,
 * unique anglers, all-time totals, booking conversions or future outcomes.
 *
 * The public UI currently loads up to 50 newest approved/published reviews.
 * A full-history score requires a separate server-controlled aggregate.
 */
export type VisibleReviewRating={quality:number};
export type VisibleReviewScorecard={
  count:number;
  average:number|null;
  scope:'no_reviews'|'displayed_published_reviews'|'latest_50_published_reviews';
  earlySample:boolean;
  explanation:string;
};

export const PUBLIC_REVIEW_PAGE_LIMIT=50;
export const EARLY_REVIEW_THRESHOLD=5;

export function summarizePublishedReviewSample(
  publiclyApprovedRows:readonly VisibleReviewRating[]
):VisibleReviewScorecard{
  if(!Array.isArray(publiclyApprovedRows)||publiclyApprovedRows.length>PUBLIC_REVIEW_PAGE_LIMIT)
    throw new Error('Expected at most 50 published reviews from the public review view.');
  for(const row of publiclyApprovedRows){
    if(!row||typeof row.quality!=='number'||!Number.isInteger(row.quality)||
      row.quality<1||row.quality>5)
      throw new Error('Public review view returned an invalid quality score.');
  }
  const count=publiclyApprovedRows.length;
  if(count===0)return{
    count,average:null,scope:'no_reviews',earlySample:false,
    explanation:'No published reviews yet.',
  };
  const total=publiclyApprovedRows.reduce((sum,row)=>sum+row.quality,0);
  const average=Math.round((total/count)*10)/10;
  const capped=count===PUBLIC_REVIEW_PAGE_LIMIT;
  return {
    count,average,
    scope:capped?'latest_50_published_reviews':'displayed_published_reviews',
    earlySample:count<EARLY_REVIEW_THRESHOLD,
    explanation:capped?
      'Average of the 50 most recent published reviews displayed here, not necessarily all time.':
      'Raw average of published reviews displayed here. Reviews are self-reported trips, not independently booking-verified.',
  };
}
