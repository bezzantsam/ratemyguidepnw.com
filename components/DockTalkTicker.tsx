'use client';
import Link from 'next/link';
import { reviews } from '@/lib/data';

/**
 * Prelaunch Dock Talk ticker: all review fixtures are fictional and clearly labeled.
 * Use approved/published reviews only when switching to Supabase.
 * Hover or focus pauses the scrolling strip; reduced-motion users see static items.
 */
export default function DockTalkTicker() {
  return (
    <section className="dock-ticker" aria-label="Dock Talk review ticker">
      <Link href="/reviews" className="dock-ticker-label">
        <span aria-hidden="true" className="dock-ticker-dot" />
        DOCK TALK
      </Link>
      <div className="dock-ticker-window">
        <div className="dock-ticker-track">
          <div className="dock-ticker-group">
            {reviews.map((review) => (
              <Link key={review.id} href="/reviews" className="dock-ticker-item">
                <span className="dock-ticker-stars" aria-label={`${review.score} out of 5 stars`}>{'★'.repeat(review.score)}{'☆'.repeat(5 - review.score)}</span>
                <span>{review.waterway}</span>
                <span aria-hidden="true">·</span>
                <strong>{review.guideName}</strong>
                <span className="dock-ticker-demo">DEMO REVIEW</span>
              </Link>
            ))}
          </div>
          <div className="dock-ticker-group" aria-hidden="true">
            {reviews.map((review) => (
              <span key={review.id} className="dock-ticker-item">
                <span className="dock-ticker-stars">{'★'.repeat(review.score)}{'☆'.repeat(5 - review.score)}</span>
                <span>{review.waterway}</span>
                <span aria-hidden="true">·</span>
                <strong>{review.guideName}</strong>
                <span className="dock-ticker-demo">DEMO REVIEW</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <Link href="/reviews" className="dock-ticker-view">View feed →</Link>
    </section>
  );
}
