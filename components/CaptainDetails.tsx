/**
 * Legacy public guide_details writes are disabled until an authenticated,
 * human-reviewed publication service exists. This component intentionally
 * makes NO Supabase calls and cannot read pending owner-provided copy.
 *
 * Claim and draft submission paths are unavailable in the read-only directory.
 */
export default function CaptainDetails({slug,claimAvailable=false}:{slug:string;claimAvailable?:boolean}) {
  return (
    <section className="section card captain-details-safe" aria-labelledby="captain-details-heading" data-profile={slug}>
      <p className="eyebrow">CAPTAIN PROFILE · EDITORIAL REVIEW REQUIRED</p>
      <h2 id="captain-details-heading">About this captain and their trips</h2>
      <p>{claimAvailable
        ? 'After a claim is approved, the captain can provide boat, gear, experience and fishing details. Those declarations are attributed to the captain.'
        : 'Captain-contributed boat, gear, experience and fishing information can appear here after an authorized profile claim and independent review.'}</p>
      <p className="muted">
        A historical directory listing is not a verified account, operating
        license, vessel credential or confirmed trip. Source-backed information
        is displayed separately above.
      </p>
      <p className="muted">
        {claimAvailable
          ? 'Are you this captain? See the rating section to check whether this listing can be claimed.'
          : 'Are you this captain? Use the “Claiming currently unavailable” link on this page to find the current onboarding instructions. New details are not published directly from this page.'}
      </p>
    </section>
  );
}
