import Link from 'next/link';
import { BookOpenCheck, CircleHelp, ClipboardList, ShieldAlert } from 'lucide-react';

type Props = {
  jurisdiction: 'Oregon' | 'Washington';
  sourceLabel: string;
  registration?: string | null;
  importedStatus?: string | null;
};

/**
 * This component shows ONLY facts supported by already-imported public
 * source files. It is not an official real-time guide-license check.
 *
 * Source presence !== license validity
 * Approved account claim !== verified boat/USCG/license credentials
 * Moderated review !== independently proved completed trip
 */
export default function GuideTrustPanel({
  jurisdiction,
  sourceLabel,
  registration,
  importedStatus,
}: Props) {
  const isOregon = jurisdiction === 'Oregon';

  return (
    <section className="section trust-panel" aria-labelledby="guide-evidence-title">
      <div className="trust-panel-heading">
        <div>
          <p className="eyebrow">TRANSPARENCY / SOURCE PROVENANCE</p>
          <h2 id="guide-evidence-title">What we actually know</h2>
        </div>
        <Link href="/guides/verification" className="trust-explainer-link">
          How verification works <CircleHelp size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="trust-evidence-grid">
        <article className="trust-evidence-item">
          <div className="trust-evidence-title">
            <ClipboardList size={19} aria-hidden="true" />
            <strong>Directory source</strong>
          </div>
          <span className="trust-state trust-state-source">Listed in imported source</span>
          <p>
            {isOregon
              ? 'This profile matches a record in an imported Oregon outfitter/guide registration dataset.'
              : 'This profile comes from an imported Washington guide directory or association source. This is not, by itself, a government license check.'}
          </p>
          <dl className="trust-source-fields">
            <div><dt>Source label</dt><dd>{sourceLabel}</dd></div>
            {registration && <div><dt>Listed registration</dt><dd>{registration}</dd></div>}
            {importedStatus && <div>
              <dt>Imported status text</dt>
              <dd>{importedStatus} <small>(historical file value)</small></dd>
            </div>}
          </dl>
        </article>

        <article className="trust-evidence-item">
          <div className="trust-evidence-title">
            <ShieldAlert size={19} aria-hidden="true" />
            <strong>Current license and credentials</strong>
          </div>
          <span className="trust-state trust-state-unknown">Not live-verified</span>
          <p>
            We have not established this guide&apos;s current licensing status, expiration
            date, insurance, or any applicable USCG credential from a recent independent check.
          </p>
          <p className="trust-note">
            A source field labeled &ldquo;ACTIVE&rdquo; does not establish today&apos;s
            status. Fishing-guide registration and USCG credentials are separate checks.
          </p>
        </article>

        <article className="trust-evidence-item">
          <div className="trust-evidence-title">
            <BookOpenCheck size={19} aria-hidden="true" />
            <strong>Reviews and trip evidence</strong>
          </div>
          <span className="trust-state trust-state-unknown">Trip proof not certified</span>
          <p>
            RateMyGuidePNW requires an account and moderation for review publication.
            Those safeguards alone do not independently prove that a fishing trip occurred.
          </p>
          <p className="trust-note">
            Owner-supplied vessel details, ratings, and promotional claims are not
            official catch statistics or verified safety endorsements.
          </p>
        </article>
      </div>
      <p className="trust-panel-footnote">
        An imported source entry is evidence that the name appears in that source.
        It is not an endorsement or a real-time license lookup. Please independently
        check current requirements before booking.
      </p>
    </section>
  );
}
