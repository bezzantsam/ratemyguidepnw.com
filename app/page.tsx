import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import UnifiedSearch from '@/components/UnifiedSearch';
import { directoryEntries } from '@/lib/directory';

export default function Home() {
  const enabled=process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true';
  return (
    <main className="home-search">
      <p className="eyebrow">RATE MY GUIDE PNW</p>
      <h1>Rate your guide.</h1>
      <p className="lead">
        Find the guide you fished with and share your firsthand experience.
      </p>
      <p><Link className="button" href="/write-review">Rate your guide</Link></p>
      {!enabled && <p role="status">Review submissions are not open yet.</p>}
      <UnifiedSearch entries={directoryEntries} reviewMode reviewEnabled={enabled} />
      <section style={{ marginTop: 32 }} aria-labelledby="angler-trip-heading">
        <h2 id="angler-trip-heading">How was your trip?</h2>
        <p>Help the next angler choose. Rate your guide and share your experience.</p>
        {!enabled && <p>Review submissions are not open yet.</p>}
        <Link className="button" href="/write-review">Rate your guide</Link>
      </section>
      <section style={{ marginTop: 32 }} aria-labelledby="captain-listing-heading">
        <h2 id="captain-listing-heading">Captain or guide?</h2>
        <p>{!enabled && 'Claims are currently unavailable. '}Claiming never gives anyone control over independent angler reviews.</p>
        <Link href="/guides"><strong>Find your profile</strong></Link>
      </section>
      <p className="muted" style={{ marginTop: 22 }}>
        <ShieldCheck size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Directory records are not live license checks. {enabled?'Reviews are checked before publication;':'Review submissions are unavailable;'}
        guide rankings cannot be purchased.
      </p>
    </main>
  );
}
