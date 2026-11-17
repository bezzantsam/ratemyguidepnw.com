/** Display data is supplied by an adapter after the backend contract is agreed. */
export type PublishedReview = Readonly<{
  id: string;
  guideKey: string;
  status: 'published';
  rating: number;
  body: string;
  publishedAt: string;
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
        !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5 || typeof review.body !== 'string' || !review.body.trim() || typeof review.publishedAt !== 'string' || !review.publishedAt) return false;
    ids.add(review.id);
    return true;
  });
}

export type ReviewLoadState = Readonly<{status:'loading'}> | Readonly<{status:'error'}> | Readonly<{status:'ready'; page:PublishedReviewPage}>;

export function PublishedReviews({guideKey, state}: {guideKey:string; state:ReviewLoadState}) {
  if (state.status === 'loading') return <p role="status">Loading reviews…</p>;
  if (state.status === 'error' || !validReviewPage(guideKey, state.page)) return <p role="status">Reviews are temporarily unavailable.</p>;
  const {page} = state;
  if (!page.total) return <p>No published reviews yet.</p>;
  return <section aria-labelledby="published-reviews-heading">
    <h2 id="published-reviews-heading">Angler reviews</h2>
    <p><strong>{page.average?.toFixed(1)} / 5</strong> · {page.total} {page.total === 1 ? 'published review' : 'published reviews'}</p>
    {page.reviews.map(review=><article className="card" key={review.id}>
      <p><strong>{review.rating} / 5</strong> · Published {review.publishedAt}</p><p>{review.body}</p>
    </article>)}
  </section>;
}
