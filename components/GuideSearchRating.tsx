import type {GuideRatingSummary} from '@/lib/public-guide-ratings';

const countFormat = new Intl.NumberFormat('en-US');

export default function GuideSearchRating({summary, loading}: {summary?: GuideRatingSummary; loading: boolean}) {
 if (summary?.count === 0) return <div className="rating-tile guide-rating-tile"><span>No reviews yet</span></div>;
 if (!summary || summary.averageQuality === null) return <div className="rating-tile guide-rating-tile">
  <span>{loading ? 'Loading rating' : 'Rating unavailable'}</span>
 </div>;

 const average = summary.averageQuality.toFixed(1);
 const count = countFormat.format(summary.count);
 const noun = summary.count === 1 ? 'review' : 'reviews';
 return <div className="rating-tile guide-rating-tile">
  <div aria-hidden="true"><strong>{average}</strong><span> / 5</span></div>
  <span aria-hidden="true">{count} {noun}</span>
  <span className="guide-rating-description">{average} out of 5, {count} published {noun}</span>
 </div>;
}
