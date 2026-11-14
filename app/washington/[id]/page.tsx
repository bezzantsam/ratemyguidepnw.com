import GuideEnrichmentPanel from '@/components/GuideEnrichmentPanel';
import CharterCrewPanel from '@/components/CharterCrewPanel';
import CaptainDetails from '@/components/CaptainDetails';
import CaptainReviews from '@/components/CaptainReviews';
import {backendWriteAvailability} from '@/lib/backend-write-availability';
import CaptainMedia from '@/components/CaptainMedia';
import GuideTrustPanel from '@/components/GuideTrustPanel';
import RelatedOutfitterCaptains from '@/components/RelatedOutfitterCaptains';
import {classifyWashingtonSource} from '@/lib/washington-provenance';
import SaveGuideButton from '@/components/SaveGuideButton';
import Link from 'next/link';import {notFound} from 'next/navigation';import {washingtonGuides,washingtonGuide} from '@/lib/washington';
// Render registry profiles on demand with ISR; never prebuild thousands of entries.
export const revalidate = 600;
export function generateStaticParams(){return [] as {id:string}[];}
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const g=washingtonGuide(id);if(!g)notFound();const provenance=classifyWashingtonSource(g.source);return <main><Link href="/washington">← All Washington guides</Link><p className="eyebrow">WASHINGTON DIRECTORY LISTING · UNVERIFIED</p><h1>{g.name}</h1><SaveGuideButton href={`/washington/${g.id}`} name={g.name}/><p className="lead">{g.business||'Independent fishing guide'}</p><div className="profile-summary"><div className="rating-tile"><strong>—</strong><span>See reviews</span></div><div><strong>Angler reviews</strong><p className="muted">Source information comes from an imported directory; review details appear below.</p></div></div><section className="card"><h2>Directory information</h2><p><strong>Source:</strong> {g.source}</p><p><strong>Source category:</strong> {provenance.label}</p><p><strong>Location / notes:</strong> {g.notes||'Washington (specific area not listed)'}</p><p className="muted">This source listing does not constitute verification of an active guide license.</p></section><RelatedOutfitterCaptains publicId={g.id}/><CharterCrewPanel publicId={g.id}/><GuideEnrichmentPanel registration={g.id}/><GuideTrustPanel jurisdiction="Washington" sourceLabel={g.source}/><CaptainDetails slug={id}/><CaptainMedia slug={id}/><CaptainReviews slug={id} allowWrites={backendWriteAvailability().reviews}/><section className="section card"><h2>Are you {g.name}?</h2><Link className="button" href={`/claim/${g.id}`}>Claim this profile →</Link><p>Captain profile claiming and verification are coming soon. Your independent ratings will remain unaffected by paid features.</p></section></main>}
