import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND_NAME, PUBLIC_ORIGIN } from '@/lib/canonical-share';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_ORIGIN),
  title: `${BRAND_NAME} | Fishing guide reviews`,
  applicationName: BRAND_NAME,
  openGraph: { siteName: BRAND_NAME, images: [{ url: '/share-card.png', width: 1200, height: 630, alt: `${BRAND_NAME} fishing guide directory` }] },
  description: process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true'?'Browse Oregon and Washington fishing-guide listings and angler reviews.':'Browse Oregon and Washington fishing-guide listings with transparent source information. Reviews and profile claims are currently unavailable.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link className="brand" href="/">Rate Your <span>Guide</span></Link>
          <nav aria-label="Main navigation">
            <Link href="/write-review">Write a Review</Link>
            <Link href="/guides">Find a Guide</Link>
            <Link href="/saved">Saved guides</Link>
            <Link href="/about">About</Link>
          </nav>
        </header>
        {children}
        <footer>© {new Date().getFullYear()} {BRAND_NAME} · Independent by design{process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true'?'':' · Pre-launch'}</footer>
      </body>
    </html>
  );
}
