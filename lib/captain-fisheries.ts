/** Public captain-self-reported trip offerings. Never proof of credentials, season openings, or bookings. */
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
export const MAX_OFFERINGS = 8;

export type CaptainFishery = {
  waterway: string;
  launchArea: string;
  species: string[];
  months: number[];
};
export type CaptainVessel = {
  type: string;
  covered: boolean;
  heated: boolean;
  maxAnglers: number | null;
  fishCare: string[];
};
export type CaptainFisheryDraft = {
  offerings: CaptainFishery[];
  vessel: CaptainVessel;
  bookingStyle: typeof BOOKING_STYLES[number];
};
export const EMPTY_CAPTAIN_FISHERY: CaptainFishery = {waterway:'',launchArea:'',species:[],months:[]};
export const EMPTY_CAPTAIN_DRAFT: CaptainFisheryDraft = {
  offerings: [{...EMPTY_CAPTAIN_FISHERY,species:[],months:[]}],
  vessel:{type:'Other / varies',covered:false,heated:false,maxAnglers:null,fishCare:[]},
  bookingStyle:'call_to_confirm',
};
const privateContact = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/i;
const normalized = (value:string) => value.trim().replace(/\s+/g,' ');
const meaningful = (value:string, min:number, max:number) =>
  value.length >= min && value.length <= max && !privateContact.test(value) && !/[<>]/.test(value);

export function validateCaptainFisheryDraft(draft:CaptainFisheryDraft): string[] {
  const errors:string[]=[];
  if(!draft||!Array.isArray(draft.offerings)||draft.offerings.length<1||draft.offerings.length>MAX_OFFERINGS)
    return ['Add between one and eight fishing offerings.'];
  const seen=new Set<string>();
  draft.offerings.forEach((offer,index)=>{
    const prefix='Fishery '+(index+1)+': ';
    const waterway=typeof offer.waterway==='string'?normalized(offer.waterway):'';
    const launchArea=typeof offer.launchArea==='string'?normalized(offer.launchArea):'';
    if(!meaningful(waterway,3,80))errors.push(prefix+'enter a waterway (3–80 characters, no private contact details).');
    if(launchArea.length>0&&!meaningful(launchArea,3,80))errors.push(prefix+'launch area must be 3–80 characters and contain no private contact details.');
    if(seen.has(waterway.toLocaleLowerCase()))errors.push(prefix+'remove duplicate waterways.');
    seen.add(waterway.toLocaleLowerCase());
    if(!Array.isArray(offer.species)||offer.species.length<1||offer.species.length>8||
      new Set(offer.species).size!==offer.species.length||
      offer.species.some(s=>!(TARGET_SPECIES as readonly string[]).includes(s)))
      errors.push(prefix+'select 1–8 valid species.');
    if(!Array.isArray(offer.months)||offer.months.length<1||offer.months.length>12||
      new Set(offer.months).size!==offer.months.length||
      offer.months.some(m=>!Number.isInteger(m)||m<1||m>12))
      errors.push(prefix+'select valid operating months.');
  });
  const vessel=draft.vessel;
  if(!vessel||!(VESSEL_TYPES as readonly string[]).includes(vessel.type))errors.push('Choose a valid vessel type.');
  if(vessel&&(typeof vessel.covered!=='boolean'||typeof vessel.heated!=='boolean'))errors.push('Invalid boat amenities.');
  if(vessel&&vessel.maxAnglers!==null&&(!Number.isInteger(vessel.maxAnglers)||vessel.maxAnglers<1||vessel.maxAnglers>30))
    errors.push('Angler capacity must be 1–30, or left unspecified.');
  if(!vessel||!Array.isArray(vessel.fishCare)||new Set(vessel.fishCare).size!==vessel.fishCare.length||
    vessel.fishCare.some(v=>!(FISH_CARE as readonly string[]).includes(v)))
    errors.push('Select only supported fish-care options.');
  if(!(BOOKING_STYLES as readonly string[]).includes(draft.bookingStyle))errors.push('Choose a valid booking style.');
  return errors;
}

export function createCaptainProposalInsert(draft:CaptainFisheryDraft, guideId:string, userId:string) {
  if(validateCaptainFisheryDraft(draft).length)throw new Error('Captain fishery draft is invalid.');
  return {
    guide_id:guideId,submitted_by:userId,
    offerings:draft.offerings.map(offer=>({
      waterway:normalized(offer.waterway),
      launch_area:normalized(offer.launchArea),
      species:[...offer.species].sort(),
      months:[...offer.months].sort((a,b)=>a-b),
    })),
    vessel:{
      type:draft.vessel.type,covered:draft.vessel.covered,heated:draft.vessel.heated,
      max_anglers:draft.vessel.maxAnglers,fish_care:[...draft.vessel.fishCare].sort(),
    },
    booking_style:draft.bookingStyle,
    review_state:'pending' as const,
  };
}
