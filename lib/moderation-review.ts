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
export type ReviewFlag = {
  code:'credential_or_insurance_claim';
  path:string;
  priority:'high';
  message:string;
};
export type ReviewSummary = {
  risk:ReviewRisk;
  flags:ReviewFlag[];
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
/** Expand complete allowed fields when adding/removing an entire boat or trip. */
const vesselDescription=(v:CaptainVessel)=>[
  'Boat: '+v.label,
  'Type: '+v.type,
  'Covered: '+compact(v.covered),
  'Heated: '+compact(v.heated),
  'Max anglers: '+compact(v.maxAnglers),
  'Fish care: '+compact(v.fishCare),
].join(' · ');
const tripDescription=(t:CaptainFishery,vessels:CaptainVessel[])=>{
  const assigned=vessels.find(v=>v.id===t.vesselId);
  return [
    'Trip: '+t.title,
    'Waterway: '+t.waterway,
    'Launch area: '+compact(t.launchArea),
    'Species: '+compact(t.species),
    'Months: '+compact(t.months),
    'Boat: '+(assigned?.label??'Unknown')+' ('+t.vesselId+')',
    'Booking: '+t.bookingStyle,
    'Duration: '+t.duration,
  ].join(' · ');
};

/** Escalate self-stated credentials without declaring them valid or invalid. */
const credentialLanguage=/(?:\bUSCG\b|\bU\.?S\.?\s*Coast\s*Guard\b|\bCoast\s*Guard\b|\b\d{1,3}[-‐‑‒–—\s]?(?:ton|tonne)\b|\blicen[sc](?:ed|e)\b|\binsured\b|\bbonded\b|\b(?:credentialed|certified)\s+(?:captain|guide)\b)/i;
function claimFlags(published:CaptainFisheryDraft|null,proposed:CaptainFisheryDraft):ReviewFlag[]{
  const flags:ReviewFlag[]=[];
  const beforeBoats=new Map(published?.vessels.map(v=>[v.id,v])??[]);
  const beforeTrips=new Map(published?.offerings.map(t=>[t.id,t])??[]);
  function flag(path:string,beforeValue:string|undefined,afterValue:string){
    if(beforeValue===afterValue||!credentialLanguage.test(afterValue))return;
    flags.push({
      code:'credential_or_insurance_claim',path,priority:'high',
      message:'Captain-provided wording appears to claim licensing, credentials, bonding or insurance. Obtain independent evidence before publishing this field.',
    });
  }
  for(const v of proposed.vessels){
    const previous=beforeBoats.get(v.id);
    flag('vessels.'+v.id+'.label',previous?.label,v.label);
  }
  for(const t of proposed.offerings){
    const previous=beforeTrips.get(t.id);
    flag('offerings.'+t.id+'.title',previous?.title,t.title);
    flag('offerings.'+t.id+'.waterway',previous?.waterway,t.waterway);
    flag('offerings.'+t.id+'.launchArea',previous?.launchArea,t.launchArea);
  }
  return flags;
}
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
  ['maxAnglers','Maximum anglers','medium'],
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
    if(!old){addChange(changes,'vessels.'+id,'Boat '+id,'added','Not listed',vesselDescription(next!),'medium');continue}
    if(!next){addChange(changes,'vessels.'+id,'Boat '+id,'removed',vesselDescription(old),'Not listed','medium');continue}
    for(const [field,label,risk] of vesselFields){
      compareField('vessels.'+id,'Boat '+id+' · '+label,old,next,field,risk,changes,field==='fishCare');
    }
  }
}
function compareTrips(before:CaptainFishery[],after:CaptainFishery[],beforeBoats:CaptainVessel[],afterBoats:CaptainVessel[],changes:ReviewChange[]){
  const previous=new Map(before.map(v=>[v.id,v]));
  const following=new Map(after.map(v=>[v.id,v]));
  const ids=[...new Set([...previous.keys(),...following.keys()])].sort();
  for(const id of ids){
    const old=previous.get(id),next=following.get(id);
    if(!old){addChange(changes,'offerings.'+id,'Seasonal trip '+id,'added','Not listed',tripDescription(next!,afterBoats),'medium');continue}
    if(!next){addChange(changes,'offerings.'+id,'Seasonal trip '+id,'removed',tripDescription(old,beforeBoats),'Not listed','medium');continue}
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
  compareTrips(published?.offerings??[],proposed.offerings,published?.vessels??[],proposed.vessels,changes);
  if(changes.length>140)throw new Error('Review diff exceeds safe size.');

  const flags=claimFlags(published,proposed);
  let risk:ReviewRisk=published?'low':'high';
  for(const change of changes)risk=highest(risk,change.risk);
  for(const flag of flags)risk=highest(risk,flag.priority);
  if(context.ownership==='unapproved')risk='high';

  const warnings:string[]=[];
  if(context.ownership==='unapproved')
    warnings.push('No approved ownership claim: moderator must verify profile authority separately.');
  if(!published)
    warnings.push('First proposal: there is no moderator-approved public baseline.');
  if(changes.some(c=>c.path.endsWith('.waterway')||(c.path.startsWith('offerings.')&&c.kind==='added')))
    warnings.push('Waterway changes are captain statements, not confirmed current operating locations.');
  if(changes.some(c=>c.path.endsWith('.vesselId')))
    warnings.push('Check that trips were assigned to the correct vessel and capacity.');
  if(flags.length)warnings.push('Potential license, USCG, insurance or bond claims need independent evidence, regardless of account-claim approval.');
  warnings.push('Review priority is not permission to publish. Human approval and source labeling are required.');

  return {risk,changes,flags,hasChanges:changes.length>0,humanApprovalRequired:true,warnings};
}
