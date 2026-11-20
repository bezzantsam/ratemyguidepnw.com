/** Versioned optional answers about the trip, separate from overall quality. */
type Option = Readonly<{value:string;label:string}>;
export type TripField = Readonly<{
  key:string;
  label:string;
  kind:'boolean'|'rating'|'minutes'|'count'|'enum';
  options?:readonly Option[];
}>;
export const FISH_LANDED_MAX=2147483647;
export const REVIEW_TRIP_RATINGS:readonly TripField[]=[
  {key:'kindness',label:'Kindness',kind:'rating'},
  {key:'organization',label:'Organization',kind:'rating'},
  {key:'fishiness',label:'Finding fish',kind:'rating'},
];
export const FISH_LANDED_FIELD:TripField={key:'fish_landed',label:'How many fish did your group land?',kind:'count'};
export const isTripHighlight=(key:string)=>key===FISH_LANDED_FIELD.key||REVIEW_TRIP_RATINGS.some(field=>field.key===key);
const options=(...values:string[]):Option[]=>values.map(value=>({value,label:value.replaceAll('_',' ')}));
export const TRIP_FIELDS:readonly TripField[]=[
  {key:'target_species',label:'What species were you targeting?',kind:'enum',options:options('chinook','coho','steelhead','other','unknown')},
  {key:'setting',label:'Where did you fish?',kind:'enum',options:options('river','ocean','estuary','other','unknown')},
  {key:'teaching_requested',label:'Did you ask for instruction?',kind:'boolean'},
  {key:'teaching_experience',label:'How was the instruction you received?',kind:'rating'},
  {key:'children_present',label:'Were children on the trip?',kind:'boolean'},
  {key:'guide_patience',label:'How patient was the guide with the children?',kind:'rating'},
  {key:'effort',label:'How would you rate the guide’s effort?',kind:'rating'},
  {key:'attentiveness',label:'How attentive was the guide?',kind:'rating'},
  ...REVIEW_TRIP_RATINGS,
  FISH_LANDED_FIELD,
  {key:'cleanliness',label:'How clean was the equipment and setting?',kind:'rating'},
  {key:'agreed_duration_minutes',label:'What duration did you agree on, in minutes?',kind:'minutes'},
  {key:'actual_duration_minutes',label:'How long was the trip, in minutes?',kind:'minutes'},
  {key:'duration_change_reason',label:'If the duration changed, what reason were you given?',kind:'enum',options:options('weather','safety','customer_request','guide_decision','other','unknown')},
  {key:'response_slow_catch',label:'How did the guide respond when fishing was slow or there was no catch?',kind:'rating'},
  {key:'dog_present',label:'Was a dog present?',kind:'boolean'},
  {key:'dog_previously_disclosed',label:'Was the dog disclosed before the trip?',kind:'boolean'},
  {key:'conversation_preference',label:'What level of conversation did you prefer?',kind:'enum',options:options('talkative','quiet','no_preference')},
  {key:'respect_for_boundaries',label:'How well were your conversational boundaries respected?',kind:'rating'},
];

export type TripDraft=Readonly<Record<string,string>>;
export type TripAnswer={state:'not_applicable'}|{state:'answered';value:boolean|number|string};
export type TripResponses={version:1;answers:Record<string,TripAnswer>};

/** No empty answer is turned into a negative, zero or not-applicable response. */
export function encodeTripResponses(draft:TripDraft):{value:TripResponses|null;error:null}|{value:null;error:string} {
  const answers:Record<string,TripAnswer>={};
  if(Object.keys(draft).some(key=>!TRIP_FIELDS.some(field=>field.key===key))) return {value:null,error:'An unrecognized trip answer was provided.'};
  for(const field of TRIP_FIELDS) {
    const entry=draft[field.key]??'';
    if(entry==='') continue;
    if(entry==='na') {answers[field.key]={state:'not_applicable'};continue}
    if(!entry.startsWith('value:')) return {value:null,error:`Complete or clear: ${field.label}`};
    const raw=entry.slice(6);
    let value:boolean|number|string;
    if(field.kind==='boolean') {
      if(raw!=='yes'&&raw!=='no') return {value:null,error:`Choose an answer: ${field.label}`};
      value=raw==='yes';
    } else if(field.kind==='rating') {
      if(!/^[1-5]$/.test(raw)) return {value:null,error:`Choose a rating: ${field.label}`};
      value=Number(raw);
    } else if(field.kind==='count') {
      if(!/^\d{1,10}$/.test(raw)||Number(raw)>FISH_LANDED_MAX) return {value:null,error:'Enter a nonnegative whole number for fish landed, or leave it blank.'};
      value=Number(raw);
    } else if(field.kind==='minutes') {
      if(!/^\d{1,4}$/.test(raw)||Number(raw)>1440) return {value:null,error:`Enter 0 to 1440 minutes: ${field.label}`};
      value=Number(raw);
    } else {
      if(!field.options?.some(option=>option.value===raw)) return {value:null,error:`Choose an answer: ${field.label}`};
      value=raw;
    }
    answers[field.key]={state:'answered',value};
  }
  return {value:Object.keys(answers).length?{version:1,answers}:null,error:null};
}

/** Fail closed on unknown versions/fields so an edit cannot erase answers it cannot represent. */
export function decodeTripResponses(value:unknown):TripDraft|null {
  if(value===null||value===undefined)return {};
  if(typeof value!=='object'||Array.isArray(value))return null;
  const doc=value as Record<string,unknown>;
  if(doc.version!==1||Object.keys(doc).some(k=>!['version','answers'].includes(k))||!doc.answers||typeof doc.answers!=='object'||Array.isArray(doc.answers))return null;
  const draft:Record<string,string>={};
  for(const [key,entry] of Object.entries(doc.answers as Record<string,unknown>)) {
    const field=TRIP_FIELDS.find(item=>item.key===key);
    if(!field||!entry||typeof entry!=='object'||Array.isArray(entry))return null;
    const answer=entry as Record<string,unknown>;
    if(answer.state==='not_applicable'&&Object.keys(answer).length===1)draft[key]='na';
    else if(answer.state==='answered'&&Object.keys(answer).length===2&&Object.hasOwn(answer,'value')) {
      const raw=answer.value;
      if(field.kind==='boolean') {if(typeof raw!=='boolean')return null;draft[key]=`value:${raw?'yes':'no'}`}
      else if(field.kind==='rating'||field.kind==='minutes'||field.kind==='count') {if(typeof raw!=='number'||!Number.isInteger(raw))return null;draft[key]=`value:${raw}`}
      else {if(typeof raw!=='string')return null;draft[key]=`value:${raw}`}
    } else return null;
  }
  return encodeTripResponses(draft).error?null:draft;
}

export type TripResponseDescription=Readonly<{key:string;label:string;answer:string}>;

/** Human-readable, attributed answers for a public review or authorized queue. */
export function describeTripResponseEntries(value:unknown):TripResponseDescription[]|null {
  const draft=decodeTripResponses(value);if(!draft)return null;
  const entries:TripResponseDescription[]=[];
  for(const field of TRIP_FIELDS) {
    const entry=draft[field.key];if(!entry)continue;
    const raw=entry.slice(6);
    const unanswered=isTripHighlight(field.key)?'Unanswered':'Not applicable';
    const answer=entry==='na'?unanswered:
      field.kind==='boolean'?(raw==='yes'?'Yes':'No'):
      field.kind==='rating'?`${raw} / 5`:
      field.kind==='minutes'?`${raw} minutes`:
      field.kind==='count'?raw:field.options?.find(option=>option.value===raw)?.label;
    if(answer===undefined)return null;
    entries.push({key:field.key,label:field.kind==='count'?'Fish landed by the group':field.label,answer});
  }
  return entries;
}

export function formatTripResponse({label,answer}:TripResponseDescription):string {
  return `${label}${label.endsWith('?')?' ':': '}${answer}`;
}

export function describeTripResponses(value:unknown):string[]|null {
  return describeTripResponseEntries(value)?.map(formatTripResponse)??null;
}
