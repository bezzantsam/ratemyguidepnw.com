import ReturnToResults from '@/components/ReturnToResults';
import GuideEnrichmentPanel from '@/components/GuideEnrichmentPanel';
import CaptainReviews from '@/components/CaptainReviews';
import GuideTrustPanel from '@/components/GuideTrustPanel';
import {ProfileSharing} from '@/components/launch/ProfileSharing';
import {GuideEngagement} from '@/components/launch/GuideEngagement';
import {profileShareMetadata} from '@/lib/canonical-share';
import { browseableProfilePaths, publicRobots } from '@/lib/discoverability';
import Link from 'next/link';import {notFound} from 'next/navigation';import {washingtonGuides,washingtonGuide} from '@/lib/washington';
// Render registry profiles on demand with ISR; never prebuild thousands of entries.
export const revalidate = 600;
export function generateStaticParams(){return [] as {id:string}[];}
export async function generateMetadata({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const g=washingtonGuide(id);
  if(!g)notFound();
  const path=`/washington/${g.id}`;
  return {
    ...profileShareMetadata(path,g.name,g.business),
    ...(browseableProfilePaths.has(path) ? { robots: publicRobots } : {}),
  };
}
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const g=washingtonGuide(id);if(!g)notFound();const enabled=process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED==='true';return <main><ReturnToResults/><p className="eyebrow">WASHINGTON DIRECTORY LISTING · UNVERIFIED</p><h1>{g.name}</h1><p className="lead">{g.business||'Independent fishing guide'}</p>{enabled&&<GuideEngagement source={{jurisdiction:'WA',sourceId:g.id}} profilePath={`/washington/${g.id}`} guideName={g.name}/>}{!enabled&&<section className="section" aria-label={`Rate ${g.name}`}><h2>Rate {g.name}</h2><p role="status">Review submissions are not open yet.</p></section>}{!enabled&&<div className="profile-summary"><div className="rating-tile"><strong>—</strong><span>Reviews unavailable</span></div><div><strong>Angler reviews</strong><p className="muted">Source information comes from an imported directory; review details appear below.</p></div></div>}<section className="card"><h2>Directory information</h2><p><strong>Source:</strong> {g.source}</p><p><strong>Location / notes:</strong> {g.notes||'Washington (specific area not listed)'}</p><p className="muted">This source listing does not constitute verification of an active guide license.</p></section><GuideEnrichmentPanel registration={g.id}/><GuideTrustPanel jurisdiction="Washington" sourceLabel={g.source}/>{!enabled&&<><CaptainReviews key={JSON.stringify([g.id,g.name,g.business])} slug={g.id} expectedName={g.name} expectedBusiness={g.business}/><section className="section card"><h2>Are you {g.name}?</h2><Link className="button" href={`/claim/${g.id}`}>Claiming currently unavailable →</Link><p>Captain profile claiming and verification are coming soon. Your independent ratings will remain unaffected by paid features.</p></section><ProfileSharing profilePath={`/washington/${g.id}`} guideName={g.name} reviewAvailable={false}/></>}</main>}
