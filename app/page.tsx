import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import UnifiedSearch from '@/components/UnifiedSearch';
import { directoryEntries } from '@/lib/directory';

export default function Home() {
  const enabled=process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true';
  return (
    <main className="home-search">
      <p className="eyebrow">RATE MY GUIDE PNW</p>
      <h1>Find a fishing guide.</h1>
      <p className="lead">
        Search Oregon and Washington fishing-guide listings by name, outfitter or service area.
        Make decisions with better evidence and fewer promotional claims.
      </p>
      <UnifiedSearch entries={directoryEntries} />
      <section style={{ marginTop: 32 }} aria-labelledby="captain-listing-heading">
        <h2 id="captain-listing-heading">Are you listed as a captain?</h2>
        <p>{enabled?'Find your listing to request ownership. Establishing control of a page never gives anyone the ability to change independent angler reviews.':'Claims are currently unavailable. Establishing control of a page never gives anyone the ability to change independent angler reviews.'}</p>
        <Link href="/guides"><strong>Find your listing</strong></Link>
      </section>
      <section style={{ marginTop: 32 }} aria-labelledby="angler-trip-heading">
        <h2 id="angler-trip-heading">Have you taken a trip?</h2>
        <p>{enabled?'Find your guide to share a firsthand experience and disclose relevant personal or financial relationships. Submissions are reviewed before publication.':'Review submissions are currently unavailable. Any future review should describe a firsthand experience and disclose relevant personal or financial relationships.'}</p>
        <Link href="/guides"><strong>Browse guide listings</strong></Link>
      </section>
      <p className="muted" style={{ marginTop: 22 }}>
        <ShieldCheck size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Directory records are not live license checks. {enabled?'Reviews are checked before publication;':'Review submissions are unavailable;'}
        guide rankings cannot be purchased.
      </p>
    </main>
  );
}
