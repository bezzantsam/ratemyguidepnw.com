import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import DockTalkTicker from '@/components/DockTalkTicker';

export const metadata: Metadata = {
  title: 'RateMyGuidePNW | Real Trips. Real Talk.',
  description: 'Independent Pacific Northwest fishing guide reviews and source-backed Chinook fishing intel',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="notice">
          PRE-LAUNCH DIRECTORY · Registry listings are real; guide ratings and current licensing are not independently verified.
        </div>
        <header>
          <Link className="brand" href="/">RateMyGuide<span>PNW</span></Link>
          <nav aria-label="Main navigation">
            <Link href="/guides">Find a Guide</Link>
            <Link href="/intel/buoy-10-chinook">Chinook Intel</Link>
            <Link href="/reviews">Dock Talk</Link>
            <Link href="/about">About</Link>
          </nav>
        </header>
        <DockTalkTicker />
        {children}
        <footer>© {new Date().getFullYear()} RateMyGuidePNW · Independent by design · Pre-launch</footer>
      </body>
    </html>
  );
}
