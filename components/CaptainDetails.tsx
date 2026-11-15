/**
 * Legacy public guide_details writes are disabled until an authenticated,
 * human-reviewed publication service exists. This component intentionally
 * makes NO Supabase calls and cannot read pending owner-provided copy.
 *
 * Keep the captain's structured 1–4-vessel / 1–8-seasonal-trip draft workflow
 * available on the claim page. It sends proposals, never edits public records.
 */
export default function CaptainDetails({slug}:{slug:string}) {
  return (
    <section className="section card captain-details-safe" aria-labelledby="captain-details-heading" data-profile={slug}>
      <p className="eyebrow">CAPTAIN PROFILE · EDITORIAL REVIEW REQUIRED</p>
      <h2 id="captain-details-heading">About this captain and their trips</h2>
      <p>
        Captain-contributed boat, gear, experience and fishing information
        can appear here after an authorized profile claim and independent review.
      </p>
      <p className="muted">
        A historical directory listing is not a verified account, operating
        license, vessel credential or confirmed trip. Source-backed information
        is displayed separately above.
      </p>
      <p className="muted">
        Are you this captain? Use the free “Claim this profile” option on this page
        to find the current onboarding instructions. New details are not
        published directly from this page.
      </p>
    </section>
  );
}
