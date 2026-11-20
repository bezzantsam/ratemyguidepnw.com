import CaptainTripCards from '@/components/CaptainTripCards';
import SaveGuideButton from '@/components/SaveGuideButton';
import ReturnToResults from '@/components/ReturnToResults';
import GuideEnrichmentPanel from '@/components/GuideEnrichmentPanel';
import GuideTrustPanel from '@/components/GuideTrustPanel';
import {ProfileSharing} from '@/components/launch/ProfileSharing';
import {GuideEngagement} from '@/components/launch/GuideEngagement';
import {WashingtonReviewStatus} from '@/components/launch/WashingtonReviewStatus';
import {profileShareMetadata} from '@/lib/canonical-share';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {washingtonGuide,washingtonGuides} from '@/lib/washington';

// Render registry profiles on demand with ISR without prebuilding the directory.
export const revalidate = 600;
export function generateStaticParams(){return [] as {id:string}[];}

export async function generateMetadata({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const g=washingtonGuide(id);
  if(!g)notFound();
  return profileShareMetadata(`/washington/${g.id}`,g.name,g.business);
}

export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const g=washingtonGuide(id);
  if(!g)notFound();
  const path=`/washington/${g.id}`;
  const prospectivePilot=process.env.RMG_WA_REVIEW_PILOT_SOURCE_ID;
  const listedPilot=process.env.RMG_WA_LISTED_REVIEW_PILOT_SOURCE_ID;
  const pilot=process.env.RMG_LAUNCH_ENABLED==='true' &&
    /^wa-[0-9]{3,9}$/.test(g.id) &&
    ((g.id===listedPilot&&!prospectivePilot)||(g.id===prospectivePilot&&!listedPilot));
  const legacyClosed=process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED!=='true';

  return <main>
    <ReturnToResults/>
    <p className="eyebrow">WASHINGTON DIRECTORY LISTING · UNVERIFIED</p>
    <h1>{g.name}</h1>
    <p className="lead">{g.business||'Independent fishing guide'}</p>
    {washingtonGuides.some(guide => guide.id === g.id) && <SaveGuideButton href={path} name={g.name}/>}
    {pilot
      ? <GuideEngagement key={g.id} compactProfile source={{jurisdiction:'WA',sourceId:g.id}} profilePath={path} guideName={g.name}/>
      : <WashingtonReviewStatus/>}
    <section className="card">
      <h2>Directory information</h2>
      <p><strong>Source:</strong> {g.source}</p>
      <p><strong>Location / notes:</strong> {g.notes||'Washington (specific area not listed)'}</p>
      <p className="muted">This source listing does not constitute verification of an active guide license.</p>
    </section>
    <GuideTrustPanel jurisdiction="Washington" sourceLabel={g.source}/>
    {!pilot&&<>
      {legacyClosed&&<section className="section card">
        <h2>Are you {g.name}?</h2>
        <Link className="button" href={`/claim/${g.id}`}>Claiming currently unavailable →</Link>
        <p>Captain profile claiming and verification are coming soon. Your independent ratings will remain unaffected by paid features.</p>
      </section>}
      <ProfileSharing profilePath={path} guideName={g.name} reviewAvailable={false}/>
    </>}
    {process.env.RMG_GUIDE_OFFERINGS_ENABLED==='true'&&<CaptainTripCards jurisdiction="WA" sourceId={g.id}/>}
    <GuideEnrichmentPanel registration={g.id}/>
  </main>;
}
