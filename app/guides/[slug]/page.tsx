import Link from 'next/link';
import {notFound} from 'next/navigation';
import CaptainTripCards from '@/components/CaptainTripCards';
import GuideEnrichmentPanel from '@/components/GuideEnrichmentPanel';
import ReturnToResults from '@/components/ReturnToResults';
import {AuthCheck} from '@/components/launch/AuthCheck';
import {ClaimProfile} from '@/components/launch/ClaimProfile';
import {GuideEngagement} from '@/components/launch/GuideEngagement';
import {ProfileSharing} from '@/components/launch/ProfileSharing';
import {profileShareMetadata} from '@/lib/canonical-share';
import {findGuide, guideSlug} from '@/lib/registry';
import {washingtonRecordForOregon} from '@/lib/washington';

// Generate profile pages on first request; avoid thousands of build-time routes.
export const revalidate = 600;
export function generateStaticParams(){return [] as {slug:string}[];}

type ProfileParams = {params: Promise<{slug:string}>};

export async function generateMetadata({params}: ProfileParams) {
  const {slug} = await params;
  const guide = findGuide(slug);
  if (!guide) notFound();
  return profileShareMetadata(`/guides/${guideSlug(guide)}`, guide.name, guide.business);
}

export default async function Page({params}: ProfileParams) {
  const {slug} = await params;
  const guide = findGuide(slug);
  if (!guide) notFound();
  const path = `/guides/${guideSlug(guide)}`;
  const washington = washingtonRecordForOregon(guide.registration);
  const enabled = process.env.NEXT_PUBLIC_RMG_LAUNCH_ENABLED === 'true';
  const claimsEnabled = process.env.NEXT_PUBLIC_RMG_CLAIMS_ENABLED === 'true';
  const tripsEnabled = process.env.RMG_GUIDE_OFFERINGS_ENABLED === 'true';
  const claim = claimsEnabled && <ClaimProfile key={guide.registration} sourceId={guide.registration} profilePath={path} tripsEnabled={tripsEnabled}/>;

  const registration = (
    <section className="guide-registration" aria-labelledby="registration-heading">
      <h2 id="registration-heading">Registration details</h2>
      <p><strong>Oregon registration {guide.registration}</strong>{guide.activity && <> · {guide.activity}</>}</p>
      <p className="guide-source">Source: Oregon guide registry export. Current license status unconfirmed.</p>
      <details><summary>Registration source and verification</summary>
        {guide.sourceStatus && <p>Status in the historical export: <strong>{guide.sourceStatus}</strong>.</p>}
        <Link href="/guides/verification">How verification works</Link>
        {!claimsEnabled && <p><Link href={`/claim/${guide.registration}`}>About claiming this profile</Link></p>}
      </details>
      {guide.areas.length > 0 && <details><summary>Listed service areas ({guide.areas.length})</summary>
        <ul className="guide-areas">{guide.areas.map(area=><li key={area}>{area}</li>)}</ul>
      </details>}
    </section>
  );

  return <main className="oregon-profile">
    <ReturnToResults/>
    <div className="guide-identity">
      <p className="eyebrow">Oregon guide listing</p>
      <h1>{guide.name}</h1>
      {guide.business && <p className="lead">{guide.business}</p>}
    </div>
    {enabled
      ? <GuideEngagement key={guide.registration} compactProfile source={{jurisdiction:'OR',sourceId:guide.registration}} profilePath={path} guideName={guide.name}>{claim}{registration}</GuideEngagement>
      : <><section className="guide-actions" aria-label="Profile actions">
          <ProfileSharing profilePath={path} guideName={guide.name} reviewAvailable={false}
            primaryAction={<button type="button" className="button guide-rate" disabled aria-describedby="guide-write-status">Rate {guide.name}</button>}/>
          <p className="guide-status" id="guide-write-status">Review submissions are closed.</p>
        </section>
        {process.env.NEXT_PUBLIC_RMG_AUTH_CHECK_ENABLED === 'true' && guide.registration === 'OG.0002193' && <section className="section launch-controls" id="write-review">
          <h2>Sign in for {guide.name}’s reviews</h2>
          <AuthCheck profilePath={path}/>
        </section>}
        {claim}{registration}</>}
    {washington && <section className="section card"><h2>Also listed in Washington</h2>
      <p>This captain has a matching listing in the supplied Washington directories.</p>
      <p><strong>{washington.source.source}:</strong> {washington.source.business}{washington.source.notes && <> · {washington.source.notes}</>}</p>
    </section>}
    {tripsEnabled &&
      <CaptainTripCards jurisdiction="OR" sourceId={guide.registration}/>}
    <GuideEnrichmentPanel registration={guide.registration}/>
  </main>;
}
