import Link from 'next/link';

export const metadata = { title: 'Dock Talk | RateMyGuidePNW', description: 'Information about fishing guide reviews.' };

export default function ReviewsPage() {
  if(process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true')return <main><div className="eyebrow">DOCK TALK</div><h1>Angler reviews</h1><section className="card"><p>Find a guide to read published reviews or share a firsthand trip. Review and claim availability varies by listing.</p><Link className="button" href="/guides">Browse guide listings</Link></section></main>;
  return <main><div className="eyebrow">DOCK TALK</div><h1>Angler reviews</h1>
    <section className="card" role="status"><h2>Reviews are currently unavailable</h2>
      <p>Review data and submissions are unavailable while the review and publication process is being prepared.</p>
      <Link className="button" href="/guides">Browse guide listings</Link>
    </section>
  </main>;
}
