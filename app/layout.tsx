import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'RateMyGuidePNW | Fishing guide reviews',
  description: process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true'?'Browse Oregon and Washington fishing-guide listings and angler reviews.':'Browse Oregon and Washington fishing-guide listings with transparent source information. Reviews and profile claims are currently unavailable.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link className="brand" href="/">RateMyGuide<span>PNW</span></Link>
          <nav aria-label="Main navigation">
            <Link href="/write-review">Write a Review</Link>
            <Link href="/guides">Find a Guide</Link>
            <Link href="/about">About</Link>
          </nav>
        </header>
        {children}
        <footer>© {new Date().getFullYear()} RateMyGuidePNW · Independent by design{process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true'?'':' · Pre-launch'}</footer>
      </body>
    </html>
  );
}
