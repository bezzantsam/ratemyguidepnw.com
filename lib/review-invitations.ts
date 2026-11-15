/** Pure, neutral invitations for genuine past guided trips. No tracking or uploads. */
export const REVIEW_INVITE_TEXT =
  'Have you personally fished with this guide? Share an honest review of your experience, whether positive, mixed, or critical. No receipt or payment details needed.';

export function buildPublicReviewLink(currentPageUrl:string):string {
  const u=new URL(currentPageUrl);
  if(!['http:','https:'].includes(u.protocol))
    throw new Error('Only public website review links are supported.');
  if(!/^\/(?:guides\/[a-z0-9-]+|washington\/wa-\d{3,})\/?$/.test(u.pathname))
    throw new Error('Review sharing is available only on public guide profiles.');
  // Strip any tracking query and old fragment. Never send private session data.
  return u.origin+u.pathname+'#write-review';
}

export function formatNeutralReviewInvite(url:string):string {
  return REVIEW_INVITE_TEXT+'\n'+url;
}
