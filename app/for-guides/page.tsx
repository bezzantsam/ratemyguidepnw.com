import Link from 'next/link';
import type {Metadata} from 'next';
import {foundingCaptainInterestHref,FOUNDING_CAPTAIN_YEARLY_TEST_PRICE} from '@/lib/founding-captain-offer';

export const metadata:Metadata = {
  title:'For Fishing Guides | RateMyGuidePNW Founding Captain Pilot',
  description:'Claim your free Pacific Northwest fishing guide listing. Explore a founding captain profile pilot with direct booking links, photos, biography and documented fishing trips.'
};

export default function ForGuides(){
  const paid=foundingCaptainInterestHref({choice:'founding-profile'});
  const free=foundingCaptainInterestHref({choice:'free-claim'});
  return <main className="for-guides">
    <p className="eyebrow">FOR WORKING FISHING GUIDES</p>
    <h1>Get found. Fill your boat. Keep your clients.</h1>
    <p className="lead">Your basic listing stays free. We&apos;re testing whether a better profile that sends anglers directly to a guide&apos;s own booking channel is worth paying for.</p>
    <div className="grid">
      <section className="card founding-offer" aria-labelledby="free-guide-title">
        <p className="eyebrow">FREE DIRECTORY</p>
        <h2 id="free-guide-title">Free listing</h2>
        <p className="founding-offer-price">$0</p>
        <ul>
          <li>Your existing name and business in the Oregon/Washington directory</li>
          <li>Search by name and available public guide research</li>
          <li>A way to request corrections and ownership review</li>
        </ul>
        <a className="button" href={free}>Request a free manual claim</a>
        <p className="muted">Manual verification by email during this pilot. No sensitive IDs or tax documents.</p>
      </section>
      <section className="card founding-offer" aria-labelledby="paid-guide-title">
        <p className="eyebrow">FOUNDING CAPTAIN · PRICE TEST</p>
        <h2 id="paid-guide-title">Better profile, direct bookings</h2>
        <p className="founding-offer-price">{"$"}{FOUNDING_CAPTAIN_YEARLY_TEST_PRICE}<span>/year proposed</span></p>
        <ul>
          <li>A biography, guide photos, boat details and featured fishing specialties</li>
          <li>A clear direct link to your own booking site or business contact</li>
          <li>Ability to request corrections to your listing and reply to moderated reviews when enabled</li>
          <li>Early input into features for filling unsold charter seats</li>
        </ul>
        <a className="button" href={paid}>I'm interested at $99/year</a>
        <p className="muted">This is an early offer test, not a checkout. No payment is collected or subscription activated from this link. Some profile features are still in development.</p>
      </section>
    </div>
    <section className="section card">
      <h2>What this does and doesn&apos;t promise</h2>
      <p>We can build you a more complete place for anglers to learn about your trips and reach your booking channel. We cannot promise bookings, control independent reviews, or sell better ratings. Your actual willingness to pay will determine whether we launch the paid product.</p>
      <p><Link href="/guides" className="button">Find your guide listing</Link></p>
      <p className="muted">This pilot uses a direct email conversation with the founder. We do not collect payment-card data or claim that an email inquiry is a paid subscription.</p>
    </section>
  </main>;
}
