/** Captain-contributed information is self-reported; never proof of license, availability or reviews. */
export const WATERWAY_SUGGESTIONS = [
  'Buoy 10 / Columbia Estuary', 'Lower Columbia River', 'Columbia River Gorge',
  'Willamette River', 'Multnomah Channel', 'Tillamook Bay', 'Nehalem Bay',
  'Nestucca River', 'Lower Deschutes River', 'Cowlitz River', 'Kalama River',
  'Lewis River', 'Drano Lake', 'Hanford Reach', 'Pacific Ocean / Oregon Coast',
  'Grays Harbor', 'Ilwaco / Cape Disappointment', 'Pacific City / Cape Kiwanda',
] as const;
export const TARGET_SPECIES = [
  'Chinook', 'Coho', 'Steelhead', 'Sturgeon', 'Albacore',
  'Bottomfish', 'Halibut', 'Walleye', 'Shad', 'Crab', 'Bass', 'Other',
] as const;
export const VESSEL_TYPES = [
  'Sled / jet boat', 'Ocean charter boat', 'Drift boat', 'Raft',
  'Surf-launched dory', 'Catamaran', 'Other / varies',
] as const;
export const FISH_CARE = ['Bleeding', 'Icing', 'Filleting', 'Bagging'] as const;
export const BOOKING_STYLES = ['call_to_confirm', 'per_seat', 'private_boat', 'both'] as const;
export const TRIP_DURATIONS = ['unspecified', 'half_day', 'full_day', 'multi_day'] as const;
export const MAX_OFFERINGS = 8;
export const MAX_VESSELS = 4;

export type CaptainVessel = {
  id: string;
  label: string;
  type: string;
  covered: boolean;
  heated: boolean;
  maxAnglers: number | null;
  fishCare: string[];
};
export type CaptainFishery = {
  id: string;
  title: string;
  waterway: string;
  launchArea: string;
  species: string[];
  months: number[];
  vesselId: string;
  bookingStyle: typeof BOOKING_STYLES[number];
  duration: typeof TRIP_DURATIONS[number];
};
export type CaptainFisheryDraft = {
  vessels: CaptainVessel[];
  offerings: CaptainFishery[];
};

export const EMPTY_CAPTAIN_VESSEL: CaptainVessel = {
  id:'v1', label:'Boat 1', type:'Other / varies',
  covered:false, heated:false, maxAnglers:null, fishCare:[],
};
export const EMPTY_CAPTAIN_FISHERY: CaptainFishery = {
  id:'p1', title:'', waterway:'', launchArea:'',species:[],months:[],
  vesselId:'v1',bookingStyle:'call_to_confirm', duration:'unspecified',
};
export function makeEmptyCaptainDraft(): CaptainFisheryDraft {
  return {
    vessels:[{...EMPTY_CAPTAIN_VESSEL, fishCare:[]}],
    offerings:[{...EMPTY_CAPTAIN_FISHERY,species:[],months:[]}],
  };
}
export const EMPTY_CAPTAIN_DRAFT = makeEmptyCaptainDraft();

const privateContact = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/i;
const normalized = (value:string) => value.trim().replace(/\s+/g,' ');
const meaningful=(value:string,min:number,max:number)=>
  value.length>=min && value.length<=max && !privateContact.test(value) && !/[<>]/.test(value);
const validChoice=(value:unknown, choices:readonly string[])=>typeof value==='string'&&choices.includes(value);
const hasExactKeys=(value:unknown, keys:readonly string[])=>
  !!value && typeof value==='object' && !Array.isArray(value) &&
  Object.keys(value).length===keys.length && keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
const offerKeys=['id','title','waterway','launchArea','species','months','vesselId','bookingStyle','duration'] as const;
const vesselKeys=['id','label','type','covered','heated','maxAnglers','fishCare'] as const;
const validId=(id:unknown,kind:'v'|'p'): id is string =>
  typeof id==='string' && new RegExp('^'+kind+'[1-9][0-9]{0,3}$').test(id);

/** Deterministic IDs for draft additions, never reused while an earlier ID is present. */
export function nextDraftId(items:{id:string}[],kind:'v'|'p'):string {
  const ids=items.map(item=>Number(item.id.slice(1))).filter(Number.isSafeInteger);
  return kind+String(Math.max(0,...ids)+1);
}

/** Accept incomplete but structurally safe tab-local drafts; do not require filled-in trips. */
export function isSafeCaptainDraft(input:unknown):input is CaptainFisheryDraft {
  if(!hasExactKeys(input,['vessels','offerings']))return false;
  const d=input as CaptainFisheryDraft;
  if(!Array.isArray(d.vessels)||d.vessels.length<1||d.vessels.length>MAX_VESSELS||
     !Array.isArray(d.offerings)||d.offerings.length<1||d.offerings.length>MAX_OFFERINGS)return false;
  const vesselIds=new Set<string>();
  for(const v of d.vessels){
    if(!hasExactKeys(v,vesselKeys)||!validId(v.id,'v')||vesselIds.has(v.id)||
       typeof v.label!=='string'||v.label.length>80||
       !validChoice(v.type,VESSEL_TYPES)||typeof v.covered!=='boolean'||typeof v.heated!=='boolean'||
       (v.maxAnglers!==null&&(!Number.isInteger(v.maxAnglers)||v.maxAnglers<1||v.maxAnglers>30))||
       !Array.isArray(v.fishCare)||v.fishCare.length>4||
       new Set(v.fishCare).size!==v.fishCare.length||
       v.fishCare.some(c=>!validChoice(c,FISH_CARE)))return false;
    vesselIds.add(v.id);
  }
  const packageIds=new Set<string>();
  for(const o of d.offerings){
    if(!hasExactKeys(o,offerKeys)||!validId(o.id,'p')||packageIds.has(o.id)||
       typeof o.title!=='string'||o.title.length>80||
       typeof o.waterway!=='string'||o.waterway.length>80||
       typeof o.launchArea!=='string'||o.launchArea.length>80||
       !Array.isArray(o.species)||o.species.length>8||
       new Set(o.species).size!==o.species.length||
       o.species.some(s=>!validChoice(s,TARGET_SPECIES))||
       !Array.isArray(o.months)||o.months.length>12||
       new Set(o.months).size!==o.months.length||
       o.months.some(m=>!Number.isInteger(m)||m<1||m>12)||
       typeof o.vesselId!=='string'||!vesselIds.has(o.vesselId)||
       !validChoice(o.bookingStyle,BOOKING_STYLES)||
       !validChoice(o.duration,TRIP_DURATIONS))return false;
    packageIds.add(o.id);
  }
  return true;
}

/** Invalid or unexpectedly extended JSON is rejected rather than sent to the database. */
export function validateCaptainFisheryDraft(draft:CaptainFisheryDraft):string[] {
  const errors:string[]=[];
  if(!hasExactKeys(draft,['vessels','offerings']))return ['Invalid captain draft structure.'];
  if(!Array.isArray(draft.vessels)||draft.vessels.length<1||draft.vessels.length>MAX_VESSELS)
    return ['Add between one and four vessels.'];
  if(!Array.isArray(draft.offerings)||draft.offerings.length<1||draft.offerings.length>MAX_OFFERINGS)
    return ['Add between one and eight fishing offerings.'];

  const vesselIDs=new Set<string>();
  draft.vessels.forEach((v,index)=>{
    const prefix='Boat '+(index+1)+': ';
    if(!hasExactKeys(v,vesselKeys)){errors.push(prefix+'invalid boat fields.');return}
    if(!validId(v.id,'v')||vesselIDs.has(v.id))errors.push(prefix+'invalid or duplicate vessel ID.');
    vesselIDs.add(v.id);
    if(typeof v.label!=='string'||!meaningful(normalized(v.label),3,80))
      errors.push(prefix+'give the boat a name (3–80 characters; no contact details).');
    if(!validChoice(v.type,VESSEL_TYPES))errors.push(prefix+'choose a valid vessel type.');
    if(typeof v.covered!=='boolean'||typeof v.heated!=='boolean')
      errors.push(prefix+'invalid boat amenities.');
    if(v.maxAnglers!==null&&(!Number.isInteger(v.maxAnglers)||v.maxAnglers<1||v.maxAnglers>30))
      errors.push(prefix+'angler capacity must be 1–30 or unspecified.');
    if(!Array.isArray(v.fishCare)||v.fishCare.length>4||
       new Set(v.fishCare).size!==v.fishCare.length||
       v.fishCare.some(c=>!validChoice(c,FISH_CARE)))
      errors.push(prefix+'select only supported fish-care options.');
  });

  const seenPackages=new Set<string>();
  const seenIDs=new Set<string>();
  draft.offerings.forEach((offer,index)=>{
    const prefix='Fishery '+(index+1)+': ';
    if(!hasExactKeys(offer,offerKeys)){errors.push(prefix+'invalid trip-package fields.');return}
    if(!validId(offer.id,'p')||seenIDs.has(offer.id))errors.push(prefix+'invalid or duplicate package ID.');
    seenIDs.add(offer.id);
    const title=typeof offer.title==='string'?normalized(offer.title):'';
    const waterway=typeof offer.waterway==='string'?normalized(offer.waterway):'';
    const launch=typeof offer.launchArea==='string'?normalized(offer.launchArea):'';
    if(!meaningful(title,3,80))errors.push(prefix+'provide a trip name (3–80 characters, no private contact details).');
    if(!meaningful(waterway,3,80))errors.push(prefix+'enter a waterway (3–80 characters, no private contact details).');
    if(launch.length>0&&!meaningful(launch,3,80))
      errors.push(prefix+'launch area must be 3–80 characters with no private contact details.');
    const signature=title.toLocaleLowerCase()+'|'+waterway.toLocaleLowerCase();
    if(seenPackages.has(signature))errors.push(prefix+'remove duplicate trip name/waterway combinations.');
    seenPackages.add(signature);
    if(!Array.isArray(offer.species)||offer.species.length<1||offer.species.length>8||
       new Set(offer.species).size!==offer.species.length||
       offer.species.some(s=>!validChoice(s,TARGET_SPECIES)))
      errors.push(prefix+'select 1–8 valid species.');
    if(!Array.isArray(offer.months)||offer.months.length<1||offer.months.length>12||
       new Set(offer.months).size!==offer.months.length||
       offer.months.some(m=>!Number.isInteger(m)||m<1||m>12))
      errors.push(prefix+'select valid operating months.');
    if(typeof offer.vesselId!=='string'||!vesselIDs.has(offer.vesselId))
      errors.push(prefix+'assign an existing vessel to this trip.');
    if(!validChoice(offer.bookingStyle,BOOKING_STYLES))
      errors.push(prefix+'choose a valid booking style.');
    if(!validChoice(offer.duration,TRIP_DURATIONS))
      errors.push(prefix+'choose a valid duration.');
  });
  return errors;
}

export function createCaptainProposalInsert(draft:CaptainFisheryDraft,guideId:string,userId:string){
  if(validateCaptainFisheryDraft(draft).length)throw new Error('Captain fishery draft is invalid.');
  return {
    guide_id:guideId,
    submitted_by:userId,
    vessels:draft.vessels.map(v=>({
      id:v.id,label:normalized(v.label),type:v.type,
      covered:v.covered,heated:v.heated,max_anglers:v.maxAnglers,
      fish_care:[...v.fishCare].sort(),
    })),
    offerings:draft.offerings.map(o=>({
      id:o.id,title:normalized(o.title),waterway:normalized(o.waterway),
      launch_area:normalized(o.launchArea),species:[...o.species].sort(),
      months:[...o.months].sort((a,b)=>a-b),vessel_id:o.vesselId,
      booking_style:o.bookingStyle,duration:o.duration,
    })),
    // Review state and timestamps are database-generated; never client-supplied.
  };
}
