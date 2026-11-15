# Angler review policy — useful feedback without financial surveillance

**Product decision: RateMyProfessors-style firsthand reviews, not receipt-verified booking reviews.**

Many guided fishing trips are arranged privately, paid in cash, organized by a friend, or booked for a party by one person. An angler who actually fished should be able to review their guide without needing the booker's card statement or the captain's authorization. Review requirements must not be calibrated around whether a guide uses a particular payment platform.

## What a review requires

- **Firsthand self-attestation:** The author must have personally *attended* the trip with the rated captain or guiding operation. Merely booking a future trip or hearing a friend's story is not sufficient. No mandatory receipt, bank statement, payment evidence, tax-related document, booking ID, exact trip date, photograph, full legal name shown publicly, or captain confirmation.
- **A usable 1–5 overall rating and 40–500 character account of the experience.** The other category ratings and catch outcome are optional. The review should discuss the guide's communication, professionalism, preparation, safety/handling, fish-care decisions, realistic expectations, value and how the captain responded to the conditions. The catch alone is not a measure of how well someone guided.
- **Privacy by default:** Trip month/year is optional. Do not request an exact spot, home address, GPS coordinates, companions' names, phone numbers, booking amount, or private communications. The author can avoid identifying details, but should understand that a small charter crew may infer who wrote a review from the story.
- **Publicly anonymous, privately accountable:** A signed-in author account is kept for abuse control and moderator access; the captain and public readers see "Anonymous angler," not account identity. This is NOT an anonymous-to-the-platform guarantee. The app must document private-account retention/deletion, moderator access and future opt-out terms before activating live review storage.
- **No self-promotion or hidden material connections:** A guide, employee, agent, competitor, relative, or someone who received a complimentary/discounted trip must disclose material relationships for independent review. A free trip is not automatically dishonest, but failing to disclose a material connection or posting an operator-created review is a trust risk. Do not condition incentives on positive or negative sentiment.
- **Viewpoint-neutral:** Negative reviews and positive reviews pass the SAME rules. A negative review isn't removed solely because the guide disagrees or because an advertiser sponsors the corridor. Moderation does not promise to determine the objective truth of every disputed memory.

**Conflict of interest disclosure:** Guides, competitors, employees, family members and recipients of material incentives must disclose their relationships to the platform for review. This is not permission to penalize a genuine negative rating solely because a guide dislikes it.

## Moderator guardrails and fair appeals

A review may be held or removed for reasonable evidence of fabricated experience, duplicate/repeat rating manipulation, bot/coordinated brigade activity, direct threats, harassment, discriminatory attacks, defamation risk from serious unsubstantiated factual accusations, private financial/criminal-life allegations unrelated to the trip, explicit identifying details, unsafe precise fishing spots, irrelevant material or undisclosed insider/commercial relationships. No list of banned words can independently resolve authenticity; enforce rules **consistently**, with case-specific human decisions.

Guide flags should produce a review queue, not automatic deletion. Reviewers may respond about the service, but never see the private author's account ID, email, receipt, trip members or moderation evidence. A legitimate disputed opinion remains visible unless it breaches a neutral content rule. The reviewer must have a corrections and appeals path. Track reasons and decisions privately; do not let paying guides override the outcome.

**Anti-brigading engineering gate:** Before live release, test signed-in author ownership, duplicate trip abuse, rapid multi-account bursts, manual appeals, rate limits and tamper-resistant review audit history with actual deployed JWT/RLS policies. A user account alone does not establish that a trip occurred. Anonymous-public is compatible with authenticated-private review writes and documented deletion rights.

## How ratings should average over time

- `refresh_guide_rating` in the initial SQL scaffold averages **all published** `quality` values. It does not currently give a verified-trip weight or penalize criticism. This is intended: an unproved booking must not be silently scored as zero, and a poor firsthand opinion is as numerically eligible as praise.
- The *current public list UI* loads the most recent 50 rows of `public_angler_reviews`; `summarizePublishedReviewSample` reports the raw mean and exact number **of visible published reviews**, not a fabricated all-time average. If exactly 50 are loaded, clearly label the mean as for the **latest 50**, because older reviews might exist. A full-history metric will require a separate published-only server aggregate.
- Samples of fewer than five reviews carry a prominent **early sample** warning. This is context, not removal or a hidden shrinkage/paid ranking adjustment.
- Time and recency matter: future analysis can offer yearly trend, sample size, category distributions and a confidence interval once enough independent ratings exist. All must label the observation window, review count and selection process. Small amounts of data should never be presented as proof of excellence or misconduct.
- No premium product can buy higher scores, bury criticism or change moderator thresholds. Sponsorship labels stay separate from editorial rankings.

## Important distinctions for the first beta

- **Moderated firsthand review** = an account submitted an attested experience that passed conduct rules.
- **Independently verified completed trip** = a separate, optional future provenance label that we are **not** implementing and will never require for a standard review.
- **Captain account claim** = an independent business-representation check; neither booking proof nor license verification.
- **Published review count** = actual approved reviews, not an estimate of anglers served or successful bookings.
- **No evidence-backed review quota:** Gemini's November 2026 beta plan included an illustrative "71% proof rate," a target of 25 "evidence-backed" reviews and claims about scraped/prepopulated boats. These are NOT deployed system facts or prerequisites. The realistic first-beta KPI is simply *genuine, moderated, public reviews with an honest sample size*, alongside approved captain profiles and referrals observed by trusted server controls.

The moderation UI and backend are still not connected to a live verified database. No reviews are automatically published by this PR; Supabase remains inactive; no PII, receipts, social account histories or trip-party records have been collected.

## Legal and platform references

The [FTC Consumer Reviews and Testimonials Rule](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials) prohibits buying sentiment-dependent reviews, fake reviews and certain undisclosed insider endorsements and review-suppression practices. The FTC's [FAQ](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers) discusses mere review hosting and aggregation separately from the platform authoring fake reviews. This policy is product guidance, not legal advice. [RateMyProfessors guidelines](https://www.ratemyprofessors.com/guidelines) provide a helpful example of firsthand, viewpoint-neutral, flaggable public-anonymous reviews with account-level abuse safeguards.

**Release gate:** independent security review of actual deployed auth/RLS/moderation, public privacy notice and founder approval before activating review intake or publishing new user-generated content.
