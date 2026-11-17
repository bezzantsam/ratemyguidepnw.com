import { ShieldCheck } from 'lucide-react';
import UnifiedSearch from '@/components/UnifiedSearch';
import { directoryEntries } from '@/lib/directory';

export default function Home() {
  return (
    <main className="home-search">
      <p className="eyebrow">RATE MY GUIDE PNW</p>
      <h1>Find a fishing guide.</h1>
      <p className="lead">
        Search Oregon and Washington fishing-guide listings by name, outfitter or service area.
        Make decisions with better evidence and fewer promotional claims.
      </p>
      <UnifiedSearch entries={directoryEntries} />
      <p className="muted" style={{ marginTop: 22 }}>
        <ShieldCheck size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Directory records are not live license checks. Review submissions are unavailable;
        guide rankings cannot be purchased.
      </p>
    </main>
  );
}
