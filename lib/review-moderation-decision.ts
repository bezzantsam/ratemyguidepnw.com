/**
 * Offline, deterministic moderator decision rules. Not authorization.
 * Real privilege checks MUST occur in a protected transactional database
 * function, called exclusively by a server that verified a real user JWT.
 */
export type ReviewModerationDecision='publish'|'reject';
export type ReviewModerationStatus='pending'|'published'|'rejected'|'removed';
export type ModeratorReviewContext={
  reviewStatus:ReviewModerationStatus;
  authorId:string;
  moderatorId:string;
  moderatorActive:boolean;
  moderatorIsApprovedGuideOwner:boolean;
  guideIsPublished:boolean;
  firsthandAttested:boolean;
  body:string;
};
export type ReviewDecisionPlan={
  decision:ReviewModerationDecision;
  previousStatus:'pending';
  nextStatus:'published'|'rejected';
  reason:string;
  requiresPublicationTimestamp:boolean;
  requiresPrivateAuditEvent:true;
};

export class ReviewModerationError extends Error {
  constructor(message:string){super(message);this.name='ReviewModerationError';}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_REASON_MIN=12;
const REVIEW_REASON_MAX=500;

/**
 * This is a pure plan, not proof of an authorized moderator.
 * The caller can supply booleans; a real server must derive all flags from a
 * trusted DB query under service-role authorization after validating JWTs.
 */
export function planReviewDecision(
  context:ModeratorReviewContext,
  decision:unknown,
  internalReason:unknown
):ReviewDecisionPlan{
  if(decision!=='publish'&&decision!=='reject')
    throw new ReviewModerationError('Only publish or reject is supported.');
  if(typeof internalReason!=='string')
    throw new ReviewModerationError('Moderator reason must be text.');
  const reason=internalReason.trim().replace(/\s+/g,' ');
  if(reason.length<REVIEW_REASON_MIN||reason.length>REVIEW_REASON_MAX)
    throw new ReviewModerationError('Moderator reason must be 12–500 characters.');
  if(!uuid.test(context.authorId)||!uuid.test(context.moderatorId))
    throw new ReviewModerationError('Review actors must have validated UUIDs.');
  if(!context.moderatorActive)
    throw new ReviewModerationError('Inactive or unknown moderator.');
  if(context.moderatorId.toLowerCase()===context.authorId.toLowerCase())
    throw new ReviewModerationError('Moderators cannot decide their own reviews.');
  if(context.moderatorIsApprovedGuideOwner)
    throw new ReviewModerationError('Moderators cannot decide reviews of their own guides.');
  if(context.reviewStatus!=='pending')
    throw new ReviewModerationError('Only a pending review can be decided.');
  if(decision==='publish'){
    if(!context.guideIsPublished)
      throw new ReviewModerationError('Cannot publish a review on a suspended or draft guide.');
    if(!context.firsthandAttested)
      throw new ReviewModerationError('No firsthand self-attestation.');
    const length=context.body.trim().length;
    if(length<40||length>500)
      throw new ReviewModerationError('Review text does not satisfy publication limits.');
  }
  return {
    decision,previousStatus:'pending',
    nextStatus:decision==='publish'?'published':'rejected',
    reason,requiresPublicationTimestamp:decision==='publish',
    requiresPrivateAuditEvent:true,
  };
}
