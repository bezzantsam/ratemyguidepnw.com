import Link from 'next/link';
import { getPublishedDockReviews } from '@/lib/dock-talk';

export const metadata = { title: 'Dock Talk | RateMyGuidePNW', description: 'Latest published fishing guide reviews across the Pacific Northwest.' };

export default async function ReviewsPage() {
  const reviews = await getPublishedDockReviews(50);
  return (
    <main>
      <div className="eyebrow">REAL TRIPS. REAL TALK.</div>
      <h1>Dock Talk</h1>
      <p className="lead">The latest published experiences with fishing guides across the Pacific Northwest. Reviews are independent of captain subscriptions and advertising.</p>
      {reviews.length === 0 ? (
        <section className="card" role="status">
          <h2>Be first to share your fishing story.</h2>
          <p>No customer reviews have been published yet. We're getting our review submission and moderation process ready. We won't invent ratings or testimonials to fill the page.</p>
          <Link className="button" href="/guides">Browse Oregon fishing guides</Link>
        </section>
      ) : (
        <div className="grid">
          {reviews.map(review => (
            <article className="card" key={review.id} id={`review-${review.id}`}>
              <div className="metric" aria-label={`${review.score} out of five stars`}>{'★'.repeat(review.score)}{'☆'.repeat(5 - review.score)}</div>
              <h2><Link href={`/guides/${review.guideSlug}`}>{review.guideName}</Link></h2>
              <p className="muted">{review.waterway} · {new Date(review.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}</p>
              <p>{review.body}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
