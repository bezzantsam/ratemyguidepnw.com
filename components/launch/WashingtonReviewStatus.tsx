import ReturnToResults from '@/components/ReturnToResults';

const messages={
  checking:'Checking review availability…',
  held:'Reviews are unavailable for this guide right now.',
  error:'Couldn’t load review information. Try again shortly.',
};

export function WashingtonReviewStatus({status='held',onRetry}:{
  status?:keyof typeof messages;onRetry?:()=>void;
}) {
  return <section className="section" id="write-review" aria-labelledby="wa-review-heading" tabIndex={-1}>
    <h2 id="wa-review-heading">Reviews</h2>
    <p role="status">{messages[status]}</p>
    {status==='error'&&onRetry&&<button type="button" className="guide-retry" onClick={onRetry}>Retry review availability</button>}
    <ReturnToResults fallback="/write-review"/>
  </section>;
}
