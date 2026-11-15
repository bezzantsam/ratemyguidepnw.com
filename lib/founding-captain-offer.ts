/** First 30-day pilot hypothesis, NOT evidence of willingness to pay.
 * A reservation email is neither a purchase nor a verified guide ownership claim.
 * One public email address keeps the pilot operational without an untested database
 * write endpoint. Replace with a verified business inbox before broad marketing.
 */
export const FOUNDING_CAPTAIN_YEARLY_TEST_PRICE = 99;
export const FOUNDING_CAPTAIN_CONTACT_EMAIL = 'bezzantsam@gmail.com';
const CRLF = /[\r\n]/g;

export type FoundingCaptainInterest = {
  guideId?: string;
  guideName?: string;
  choice: 'founding-profile' | 'free-claim';
};

export function foundingCaptainInterestHref(input: FoundingCaptainInterest): string {
  const id = (input.guideId ?? '').replace(CRLF, ' ').slice(0, 50);
  const name = (input.guideName ?? '').replace(CRLF, ' ').slice(0, 120);
  const paid = input.choice === 'founding-profile';
  const subject = paid
    ? 'RateMyGuidePNW: Founding Captain pilot interest ($99/year)'
    : 'RateMyGuidePNW: Free guide listing claim';
  const body = [
    'Hi,',
    '',
    paid
      ? 'I am interested in the $99/year Founding Captain pilot. Please send details when the paid pilot is ready. I understand this is not a purchase.'
      : 'I would like to request the free manual review of my guide listing.',
    '',
    name ? `Guide name: ${name}` : 'Guide name:',
    id ? `Public listing ID: ${id}` : 'Public listing ID:',
    'Business website or public proof of affiliation:',
    'Best business contact:',
    '',
    'Please do not send government IDs, tax information, passwords, or other sensitive personal documents by email.',
  ].join('\n');
  return `mailto:${FOUNDING_CAPTAIN_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
