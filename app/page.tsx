import Link from 'next/link';
import { ArrowUpRight, Fish, ShieldCheck } from 'lucide-react';
import UnifiedSearch from '@/components/UnifiedSearch';
import AppInstall from '@/components/AppInstall';
import { directoryEntries } from '@/lib/directory';

export default function Home() {
  return (
    <main className="home-search">
      <p className="eyebrow">RATE MY GUIDE PNW</p>
      <h1>Find a guide. Rate your trip.</h1>
      <p className="lead">
        Search Oregon and Washington fishing-guide listings by name, outfitter or service area.
        Make decisions with better evidence and fewer promotional claims.
      </p>
      <AppInstall />
      <Link href="/intel/buoy-10-chinook" className="home-intel-feature">
        <div className="home-intel-feature-icon"><Fish size={28} aria-hidden="true" /></div>
        <div className="home-intel-feature-copy">
          <span>NEW RESEARCH PREVIEW · CHINOOK ONLY</span>
          <strong>Buoy 10 Chinook Intel</strong>
          <p>Official WDFW sampling and NOAA tides alongside independent guide experiences.</p>
        </div>
        <ArrowUpRight className="home-intel-feature-arrow" size={24} aria-hidden="true" />
      </Link>
      <UnifiedSearch entries={directoryEntries} />
      <p className="muted" style={{ marginTop: 22 }}>
        <ShieldCheck size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Directory records are not live license checks. Published reviews require moderation;
        guide rankings cannot be purchased.
      </p>
    </main>
  );
}
