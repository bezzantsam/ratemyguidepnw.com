import Link from 'next/link';

export default function DockTalkTicker() {
  return <section className="dock-ticker" aria-label="Dock Talk">
    <Link href="/reviews" className="dock-ticker-label"><span className="dock-ticker-dot" aria-hidden="true" />DOCK TALK</Link>
    <div className="dock-ticker-empty">{process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true'?'Find a guide to read angler reviews.':'Review data and submissions are currently unavailable.'}</div>
    <Link href="/reviews" className="dock-ticker-view">Learn more →</Link>
  </section>;
}
