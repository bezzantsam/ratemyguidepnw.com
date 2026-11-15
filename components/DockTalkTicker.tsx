import Link from 'next/link';
import { getPublishedDockReviews } from '@/lib/dock-talk';

export default async function DockTalkTicker() {
  const reviews = await getPublishedDockReviews(12);
  return (
    <section className="dock-ticker" aria-label="Dock Talk — latest published fishing guide reviews">
      <Link href="/reviews" className="dock-ticker-label">
        <span className="dock-ticker-dot" aria-hidden="true" />
        DOCK TALK
      </Link>
      {reviews.length === 0 ? (
        <div className="dock-ticker-empty">First moderated angler reviews coming soon. No ratings published yet.</div>
      ) : (
        <div className="dock-ticker-window">
          <div className="dock-ticker-track">
            {[false, true].map(duplicate => (
              <div key={String(duplicate)} className="dock-ticker-group" aria-hidden={duplicate}>
                {reviews.map(review => (
                  duplicate
                    ? <span key={review.id} className="dock-ticker-item">
                        <span className="dock-ticker-stars">{'★'.repeat(review.score)}{'☆'.repeat(5 - review.score)}</span>
                        <span>{review.waterway}</span><span aria-hidden="true">·</span><strong>{review.guideName}</strong>
                      </span>
                    : <Link key={review.id} href={`/reviews#review-${review.id}`} className="dock-ticker-item">
                        <span className="dock-ticker-stars" aria-label={`${review.score} out of five stars`}>{'★'.repeat(review.score)}{'☆'.repeat(5 - review.score)}</span>
                        <span>{review.waterway}</span><span aria-hidden="true">·</span><strong>{review.guideName}</strong>
                      </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <Link href="/reviews" className="dock-ticker-view">View feed →</Link>
    </section>
  );
}
