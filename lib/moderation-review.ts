import {
  validateCaptainFisheryDraft,
  type CaptainFisheryDraft,
  type CaptainFishery,
  type CaptainVessel,
} from './captain-fisheries';

/**
 * READ-ONLY triage summary. This helper grants no roles and approves NOTHING.
 * The actual moderator identity and current approved snapshot must come from
 * trusted server-side storage when a real backend is eventually configured.
 */
export type ReviewRisk = 'low' | 'medium' | 'high';
export type ReviewChange = {
  path:string;
  label:string;
  kind:'added'|'removed'|'changed';
  before:string;
  after:string;
  risk:ReviewRisk;
};
export type ReviewSummary = {
  risk:ReviewRisk;
  changes:ReviewChange[];
  hasChanges:boolean;
  humanApprovalRequired:true;
  warnings:string[];
};

type ReviewContext = {
  /** Must be computed by trusted server on a future authenticated endpoint. */
  ownership:'approved'|'unapproved';
};

const severity:Record<ReviewRisk,number>={low:1,medium:2,high:3};
const highest=(a:ReviewRisk,b:ReviewRisk):ReviewRisk=>severity[a]>=severity[b]?a:b;
const compact=(value:unknown):string=>{
  if(value===null||value===undefined||value==='')return 'Not specified';
  if(typeof value==='boolean')return value?'Yes':'No';
  if(Array.isArray(value))return value.map(String).join(', ')||'None';
  return String(value);
};
const stableArray=(value:readonly (number|string)[])=>[...value].sort((a,b)=>String(a).localeCompare(String(b),'en',{numeric:true}));
const equality=(a:unknown,b:unknown,unordered:boolean)=>
  JSON.stringify(unordered&&Array.isArray(a)?stableArray(a):a)===
  JSON.stringify(unordered&&Array.isArray(b)?stableArray(b):b);

function compareField<T extends object>(
  path:string,label:string,before:T,after:T,field:keyof T,
  risk:ReviewRisk,output:ReviewChange[],unordered=false
){
  if(equality(before[field],after[field],unordered))return;
  output.push({
    path:path+'.'+String(field),label,kind:'changed',
    before:compact(before[field]),after:compact(after[field]),risk,
  });
}

const vesselFields=[
  ['label','Boat name','low'],
  ['type','Vessel type','medium'],
  ['covered','Covered','low'],
  ['heated','Heated','low'],
  ['maxAnglers','Maximum anglers','low'],
  ['fishCare','Fish care','low'],
] as const;
const tripFields=[
  ['title','Trip name','medium'],
  ['waterway','Advertised fishing water','medium'],
  ['launchArea','General launch area','medium'],
  ['species','Target species','medium'],
  ['months','Operating months','low'],
  ['vesselId','Assigned boat','medium'],
  ['bookingStyle','Booking style','low'],
  ['duration','Duration','low'],
] as const;
function addChange(changes:ReviewChange[],path:string,label:string,kind:ReviewChange['kind'],
  before:string,after:string,risk:ReviewRisk){
  changes.push({path,label,kind,before,after,risk});
}
function compareVessels(before:CaptainVessel[],after:CaptainVessel[],changes:ReviewChange[]){
  const previous=new Map(before.map(v=>[v.id,v]));
  const following=new Map(after.map(v=>[v.id,v]));
  const ids=[...new Set([...previous.keys(),...following.keys()])].sort();
  for(const id of ids){
    const old=previous.get(id),next=following.get(id);
    if(!old){addChange(changes,'vessels.'+id,'Boat '+id,'added','Not listed',next!.label,'medium');continue}
    if(!next){addChange(changes,'vessels.'+id,'Boat '+id,'removed',old.label,'Not listed','medium');continue}
    for(const [field,label,risk] of vesselFields){
      compareField('vessels.'+id,'Boat '+id+' · '+label,old,next,field,risk,changes,field==='fishCare');
    }
  }
}
function compareTrips(before:CaptainFishery[],after:CaptainFishery[],changes:ReviewChange[]){
  const previous=new Map(before.map(v=>[v.id,v]));
  const following=new Map(after.map(v=>[v.id,v]));
  const ids=[...new Set([...previous.keys(),...following.keys()])].sort();
  for(const id of ids){
    const old=previous.get(id),next=following.get(id);
    if(!old){addChange(changes,'offerings.'+id,'Seasonal trip '+id,'added','Not listed',next!.title,'medium');continue}
    if(!next){addChange(changes,'offerings.'+id,'Seasonal trip '+id,'removed',old.title,'Not listed','medium');continue}
    for(const [field,label,risk] of tripFields){
      compareField('offerings.'+id,'Trip '+id+' · '+label,old,next,field,risk,changes,
        field==='species'||field==='months');
    }
  }
}

/**
 * Compare existing moderator-approved fleet with a validated, unapproved proposal.
 * 'low' is a QUEUE PRIORITY, never permission to auto-publish.
 * If no public snapshot exists, it is a high-risk first-time proposal.
 */
export function reviewCaptainProposal(
  published:CaptainFisheryDraft|null,
  proposed:CaptainFisheryDraft,
  context:ReviewContext,
):ReviewSummary {
  const errors=validateCaptainFisheryDraft(proposed);
  if(errors.length)throw new Error('Invalid proposed captain details: '+errors.join(' '));
  if(published){
    const baseErrors=validateCaptainFisheryDraft(published);
    if(baseErrors.length)throw new Error('Invalid published baseline: '+baseErrors.join(' '));
  }
  if(context.ownership!=='approved'&&context.ownership!=='unapproved')
    throw new Error('Invalid claim state.');

  const changes:ReviewChange[]=[];
  compareVessels(published?.vessels??[],proposed.vessels,changes);
  compareTrips(published?.offerings??[],proposed.offerings,changes);
  if(changes.length>140)throw new Error('Review diff exceeds safe size.');

  let risk:ReviewRisk=published?'low':'high';
  for(const change of changes)risk=highest(risk,change.risk);
  if(context.ownership==='unapproved')risk='high';

  const warnings:string[]=[];
  if(context.ownership==='unapproved')
    warnings.push('No approved ownership claim: moderator must verify profile authority separately.');
  if(!published)
    warnings.push('First proposal: there is no moderator-approved public baseline.');
  if(changes.some(c=>c.path.endsWith('.waterway')))
    warnings.push('Waterway changes are captain statements, not confirmed current operating locations.');
  if(changes.some(c=>c.path.endsWith('.vesselId')))
    warnings.push('Check that trips were assigned to the correct vessel and capacity.');
  warnings.push('Review priority is not permission to publish. Human approval and source labeling are required.');

  return {risk,changes,hasChanges:changes.length>0,humanApprovalRequired:true,warnings};
}
