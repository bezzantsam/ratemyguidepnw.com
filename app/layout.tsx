import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import DockTalkTicker from '@/components/DockTalkTicker';

export const metadata: Metadata = {
  title: 'RateMyGuidePNW | Real Trips. Real Talk.',
  description: process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true'?'Browse Oregon and Washington fishing-guide listings and angler reviews.':'Browse Oregon and Washington fishing-guide listings with transparent source information. Reviews and profile claims are currently unavailable.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="notice">
          {process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true'?'DIRECTORY · Registry listings are real; guide ratings and current licensing are not independently verified.':'PRE-LAUNCH DIRECTORY · Registry listings are real; guide ratings and current licensing are not independently verified.'}
        </div>
        <header>
          <Link className="brand" href="/">RateMyGuide<span>PNW</span></Link>
          <nav aria-label="Main navigation">
            <Link href="/guides">Find a Guide</Link>
            <Link href="/guides/verification">About the Listings</Link>
            <Link href="/reviews">Dock Talk</Link>
            <Link href="/about">About</Link>
          </nav>
        </header>
        <DockTalkTicker />
        {children}
        <footer>© {new Date().getFullYear()} RateMyGuidePNW · Independent by design{process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true'?'':' · Pre-launch'}</footer>
      </body>
    </html>
  );
}
