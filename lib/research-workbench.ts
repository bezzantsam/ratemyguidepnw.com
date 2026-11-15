/** Local research decisions never grant credentials or publish directory records. */
export type ResearchEntity = {
 publicName:string;
 entityType:'person'|'vessel'|'business';
 directoryId:string|null;
 publicationStatus:'manual_review_required';
 credentialStatus:'unknown';
 reason:string;
 sourceUrl:string|null;
 incomingClaims?:{claim:string;sourceUrl:string|null;basis:'supplied_research_unchecked'|'operator_page_checked';reportedObservedOn:string;checkedOn:string|null}[];
};
export type ResearchQueue = {
 checkedOn:string;
 pendingEntities:ResearchEntity[];
 crossStateCandidates:{oregonId:string;washingtonId:string;status:string}[];
 corrections:string[];
};
export const RESEARCH_STATES = {
 unreviewed:'Not reviewed',
 needs_evidence:'Needs evidence',
 ready_for_review:'Ready for engineering review',
 exclude:'Exclude from this batch',
} as const;
export type ResearchState=keyof typeof RESEARCH_STATES;
export type ResearchDecision={state:ResearchState;note:string;evidenceUrl:string};
export type ResearchDecisions=Record<string,ResearchDecision>;
export const emptyDecision=():ResearchDecision=>({state:'unreviewed',note:'',evidenceUrl:''});
/** Local queue key, not a generated public person or business identity. */
export const researchKey=(entity:ResearchEntity)=>`${entity.entityType}:${entity.publicName}`;
export function safeResearchUrl(value:string):string|null {
 try {
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||url.username||url.password)return null;
  return url.href;
 }catch{return null;}
}
export function decisionError(decision:ResearchDecision):string|null {
 if(!Object.prototype.hasOwnProperty.call(RESEARCH_STATES,decision.state))return 'Choose a valid review state.';
 if(decision.note.length>2000)return 'Keep notes within 2,000 characters.';
 if(decision.evidenceUrl.length>2000)return 'Keep the evidence URL within 2,000 characters.';
 if(decision.evidenceUrl.trim()&&!safeResearchUrl(decision.evidenceUrl))return 'Use a complete HTTPS evidence URL without credentials.';
 if(decision.state==='ready_for_review'&&(!decision.note.trim()||!safeResearchUrl(decision.evidenceUrl)))
  return 'Add an evidence URL and explain the exact claim it supports before marking ready for review.';
 return null;
}
export function filterResearchQueue(entities:ResearchEntity[],decisions:ResearchDecisions,query:string,type:string,state:string){
 const term=query.trim().toLowerCase();
 return entities.filter(entity=>{
  const decision=decisions[researchKey(entity)]??emptyDecision();
  return (type==='all'||entity.entityType===type)&&(state==='all'||decision.state===state)&&
   (!term||[entity.publicName,entity.directoryId??'',entity.reason,decision.note].join(' ').toLowerCase().includes(term));
 });
}
export function buildResearchHandoff(queue:ResearchQueue,decisions:ResearchDecisions,exportedAt:string){
 const items=queue.pendingEntities.flatMap(entity=>{
  const decision=decisions[researchKey(entity)];
  if(!decision||decision.state==='unreviewed'&&!decision.note.trim()&&!decision.evidenceUrl.trim())return [];
  const error=decisionError(decision);
  if(error)throw new Error(`${entity.publicName}: ${error}`);
  return [{queueKey:researchKey(entity),entity:{...entity},review:{...decision,note:decision.note.trim(),evidenceUrl:decision.evidenceUrl.trim()||null},publicationStatus:'pending_review' as const}];
 });
 return {schemaVersion:1,purpose:'Research handoff only; not a publication or credential approval',exportedAt,sourceCheckedOn:queue.checkedOn,items};
}
