import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, KeyRound, ShieldAlert, UserRoundCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'What Guide Verification Means | RateMyGuidePNW',
  description: 'Learn what a source listing establishes, what licenses and claimed pages do not prove, and how guide trip reviews are moderated.',
};

const terms = [
  {
    heading: 'Listed in a source',
    description: 'A name or business appears in a dataset we imported. Oregon source records can include registration numbers and historical status text. Some Washington sources are directories or associations, not government license registers.',
    warning: 'Listing does not establish a current license, insurance, vessel credentials, or endorsement.',
  },
  {
    heading: 'Current registration and USCG credentials',
    description: 'A current status badge would require a dated check against the applicable authoritative agency source, recorded jurisdiction, matching identity, scope and expiration where available. USCG credentials, when applicable, are a separate verification from state fishing-guide registration.',
    warning: 'We do not currently display a live-verified license or USCG credential badge on these imported profiles.',
  },
  {
    heading: 'Claimed guide profile',
    description: 'A guide can request control of the public listing. The claim process is meant to check who controls an account before owner editing is authorized. It does not establish fishing ability, safety, a current guide license, or any USCG credential.',
    warning: 'Without a publicly verified claim-state lookup, we do not label imported directory results as “Unclaimed.”',
  },
  {
    heading: 'Published angler review',
    description: 'Reviews are firsthand self-reports from signed-in accounts and pass the same moderation rules whether positive or negative. Reviewer account identities are not displayed publicly. No receipt, financial proof or captain confirmation is needed to submit a standard review.',
    warning: 'Authentication and moderation do not, by themselves, mean the reviewer supplied independently confirmed booking or completed-trip evidence.',
  },
  {
    heading: 'Independently verified trip — future standard',
    description: 'Ordinary reviews never require receipts, payment records, captain confirmation or an exact date. Any optional future independently verified-trip designation would require privacy-safe independent checks and a dispute process, never a barrier to submitting regular reviews.',
    warning: 'A “Verified trip” badge must not appear until that optional evidence workflow is actually implemented and tested.',
  },
];

export default function GuideVerificationExplained() {
  return (
    <main className="guide-verification-page">
      <Link className="trust-breadcrumb" href="/guides">
        <ArrowLeft size={17} aria-hidden="true" /> Back to guide directory
      </Link>
      <p className="eyebrow">THE STANDARD BEHIND OUR LABELS</p>
      <h1>Listed isn&apos;t the same as verified.</h1>
      <p className="lead">
        A trustworthy guide directory should explain exactly what it checked.
        We distinguish imported public records, verified credentials, owner-provided
        details, and real angler experiences rather than blending them into one
        impressive-looking badge.
      </p>

      <div className="trust-legend" aria-label="Current verification states">
        <span className="trust-state trust-state-source"><ClipboardList size={15} /> Listed in source</span>
        <span className="trust-state trust-state-unknown"><ShieldAlert size={15} /> Not independently verified</span>
      </div>

      <section className="trust-term-list" aria-labelledby="trust-definitions-title">
        <h2 id="trust-definitions-title">What each label actually means</h2>
        <div className="trust-terms">
          {terms.map((term, i) => (
            <article className="trust-term" key={term.heading}>
              <div className="trust-term-index">{String(i + 1).padStart(2, '0')}</div>
              <div>
                <h3>{term.heading}</h3>
                <p>{term.description}</p>
                <p className="trust-term-limit"><strong>Important distinction:</strong> {term.warning}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="trust-next-steps">
        <div>
          <KeyRound size={26} aria-hidden="true" />
          <h2>Are you listed as a captain?</h2>
          <p>
            You can request your listing through the profile page. Establishing
            control of a page never gives anyone the ability to change independent
            angler reviews.
          </p>
          <Link className="button" href="/guides">Find your listing</Link>
        </div>
        <div>
          <UserRoundCheck size={26} aria-hidden="true" />
          <h2>Have you taken a trip?</h2>
          <p>
            Use the guide profile&apos;s review form to describe a firsthand
            experience. Reviews go through moderation before appearing publicly,
            and should disclose relevant personal or financial relationships.
          </p>
          <Link className="button" href="/guides">Find a guide to review</Link>
        </div>
      </section>
      <p className="muted trust-policy-footer">
        This is a description of our platform&apos;s evidence labels, not an official
        licensing database or advice about applicable operating requirements.
        Status and review safeguards will evolve as independently tested features
        become available.
      </p>
    </main>
  );
}
