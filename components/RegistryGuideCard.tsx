import Link from 'next/link';
import type {RegistryGuide} from '@/lib/registry';
import {guideSlug} from '@/lib/registry';
export function RegistryGuideCard({guide}:{guide:RegistryGuide}){
 return <Link className="guide-result" href={`/guides/${guideSlug(guide)}`}>
 <div className="rating-tile"><strong>—</strong><span>See reviews</span></div>
 <div className="guide-result-body"><div className="guide-result-top"><h3>{guide.name}</h3><span className="listing-chip">Source listing</span></div>
 <p className="outfit-name">{guide.business||'Independent fishing guide'}</p>
 <p className="guide-meta">{guide.areas.slice(0,3).join(' · ')}{guide.areas.length>3?' · + more':''}</p>
 <p className="guide-submeta">Oregon registration {guide.registration} · Review information on profile</p></div>
 <span className="result-chevron" aria-hidden="true">›</span></Link>
}