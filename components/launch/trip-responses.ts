/** Draft v1 interface from 06. Keep disconnected until the backend is finalized. */
type Option = Readonly<{value:string;label:string}>;
type Field = Readonly<{key:string;label:string;kind:'boolean'|'rating'|'minutes'|'enum';options?:readonly Option[]}>;
const options=(...values:string[]):Option[]=>values.map(value=>({value,label:value.replaceAll('_',' ')}));
export const TRIP_FIELDS:readonly Field[]=[
  {key:'target_species',label:'What species were you targeting?',kind:'enum',options:options('chinook','coho','steelhead','other','unknown')},
  {key:'setting',label:'Where did you fish?',kind:'enum',options:options('river','ocean','estuary','other','unknown')},
  {key:'teaching_requested',label:'Did you ask for instruction?',kind:'boolean'},
  {key:'teaching_experience',label:'How was the instruction you received?',kind:'rating'},
  {key:'children_present',label:'Were children on the trip?',kind:'boolean'},
  {key:'guide_patience',label:'How patient was the guide with the children?',kind:'rating'},
  {key:'effort',label:'How would you rate the guide’s effort?',kind:'rating'},
  {key:'attentiveness',label:'How attentive was the guide?',kind:'rating'},
  {key:'organization',label:'How organized was the trip?',kind:'rating'},
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
