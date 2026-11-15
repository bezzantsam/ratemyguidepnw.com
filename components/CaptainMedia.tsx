/**
 * No public media storage reads or writes until a protected moderation and
 * publication layer is independently verified against the live database.
 *
 * Existing guide_media and guide-photos records are NOT deleted.
 * This public profile does not infer publication approval from owner control
 * of the storage path or a previously approved account claim.
 */
export default function CaptainMedia({slug}:{slug:string}) {
  return (
    <section className="section card captain-media-safe" aria-labelledby="captain-media-heading" data-profile={slug}>
      <p className="eyebrow">CAPTAIN MEDIA · REVIEWED PUBLICATION</p>
      <h2 id="captain-media-heading">Photos &amp; welcome video</h2>
      <p className="muted">
        Captain media is unavailable while our independent review and
        publication process is being connected. No photo or video on this page
        should be interpreted as independently verified trip evidence.
      </p>
      <p className="muted">
        We are not accepting direct photo uploads or public video edits through
        this listing. Existing stored media is preserved without being shown
        until appropriate authorization and publication controls are verified.
      </p>
    </section>
  );
}
