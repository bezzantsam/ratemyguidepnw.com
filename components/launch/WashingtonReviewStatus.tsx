import ReturnToResults from '@/components/ReturnToResults';

export function WashingtonReviewStatus({checking=false}:{checking?:boolean}) {
  return <section className="section" id="write-review" aria-labelledby="wa-review-heading" tabIndex={-1}>
    <h2 id="wa-review-heading">Reviews</h2>
    <p role="status">{checking?'Checking review availability…':'Reviews are unavailable for this guide right now.'}</p>
    <ReturnToResults fallback="/write-review"/>
  </section>;
}
