import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata: Metadata = { title: 'RateMyGuidePNW | Real Trips. Real Talk.', description: 'Independent Pacific Northwest fishing guide reviews', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><div className="notice">PRE-LAUNCH DEMO — All guide names, ratings and reviews are fictional.</div><header><Link className="brand" href="/">RateMyGuide<span>PNW</span></Link><nav><Link href="/guides">Oregon Guides</Link><Link href="/washington">Washington Guides</Link><Link href="/waterways">Waterways</Link><Link href="/reviews">Dock Talk</Link><Link href="/about">About</Link></nav></header>{children}<footer>© {new Date().getFullYear()} RateMyGuidePNW · Independent by design · Pre-launch demonstration</footer></body></html>; }
