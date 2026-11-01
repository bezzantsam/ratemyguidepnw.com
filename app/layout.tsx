import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata: Metadata = { title: 'RateMyGuidePNW | Real Trips. Real Talk.', description: 'Independent Pacific Northwest fishing guide reviews', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><div className="notice">PRE-LAUNCH DIRECTORY — Real source listings; reviews and captain verification are not yet active.</div><header><Link className="brand" href="/">RateMyGuide<span>PNW</span></Link><nav><Link href="/guides">Find a Guide</Link><Link href="/about">About</Link></nav></header>{children}<footer>© {new Date().getFullYear()} RateMyGuidePNW · Independent by design · Pre-launch demonstration</footer></body></html>; }
