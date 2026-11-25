'use client';

import {useId} from 'react';
import {FISH_LANDED_MAX,TRIP_FIELDS,TRIP_TIMING_FIELDS,isTripHighlight,type TripDraft,type TripField} from './trip-responses';

/** Optional, versioned questions; the caller must validate before submission. */
export function TripDetails({draft,onChange,children}:{draft:TripDraft;onChange:(draft:TripDraft)=>void;children?:React.ReactNode}) {
  return <details>
    <summary>Tell us more</summary>
    <h4>Tell us more about your trip</h4>
    <p>These questions are optional. Answer only what applies to your experience; please leave out names and other personal details.</p>
    {children}
    <fieldset>
      <legend>Trip length and guide effort</legend>
      <TripFields fields={TRIP_TIMING_FIELDS} draft={draft} onChange={onChange}/>
    </fieldset>
    <TripFields fields={otherTripFields} draft={draft} onChange={onChange}/>
  </details>;
}

// Earlier effort responses remain in the draft without asking for the typed effort rating twice.
const otherTripFields=TRIP_FIELDS.filter(field=>field.key!=='effort' && field.kind!=='minutes' && !TRIP_TIMING_FIELDS.includes(field) && !isTripHighlight(field.key));

export function TripFields({fields,draft,onChange}:{
  fields:readonly TripField[];
  draft:TripDraft;
  onChange:(draft:TripDraft)=>void;
}) {
  const prefix=useId();
  function update(key:string,value:string,legacyKey?:string) {
    const next={...draft};
    if(legacyKey) delete next[legacyKey];
    if(value==='') delete next[key]; else next[key]=value;
    onChange(next);
  }
  return <>{fields.map(field=>{
      const id=`${prefix}-${field.key}`, entry=draft[field.key]??'';
      const highlight=isTripHighlight(field.key);
      if(field.kind==='minutes') return null;
      if(field.kind==='recognition') return <label key={field.key}>
        <input type="checkbox" id={id} checked={entry==='value:yes'}
          onChange={event=>update(field.key,event.target.checked?'value:yes':'')}/>
        {field.label}
      </label>;
      const legacy=field.legacyMinutesKey?draft[field.legacyMinutesKey]:undefined;
      let selected=entry;
      let legacyLabel='';
      if(legacy) {
        selected='legacy';
        if(legacy==='na') legacyLabel='Previously marked not applicable';
        else if(legacy==='value:') legacyLabel='Choose a range to complete your saved answer';
        else legacyLabel=`Previously reported as ${legacy.slice(6)} minutes`;
      } else if(entry==='na' && (highlight || field.legacyMinutesKey)) {
        selected='';
      }
      const choices=field.kind==='boolean'?[{value:'yes',label:'Yes'},{value:'no',label:'No'}]:field.kind==='rating'?[1,2,3,4,5].map(n=>({value:String(n),label:`${n} / 5`})):(field.options??[]);
      if(field.kind==='count')return <div key={field.key}>
        <label htmlFor={id}>{field.label} (optional)</label>
        <input id={id} type="number" inputMode="numeric" min={0} max={FISH_LANDED_MAX} step={1}
          aria-describedby={`${id}-help`} value={entry.startsWith('value:')?entry.slice(6):''}
          onChange={event=>update(field.key,event.target.value===''?'':`value:${event.target.value}`)}/>
        <p id={`${id}-help`}>Include fish your group released. Enter 0 if none landed.</p>
      </div>;
      return <div key={field.key}>
        <label htmlFor={id}>{field.label}</label>
        <select id={id} value={selected}
          onChange={event=>update(field.key,event.target.value,field.legacyMinutesKey)}>
          <option value="">Not answered</option>
          {legacy && <option value="legacy">{legacyLabel}</option>}
          {!highlight&&!field.legacyMinutesKey&&<option value="na">Not applicable</option>}
          {choices.map(choice=><option key={choice.value} value={`value:${choice.value}`}>{choice.label}</option>)}
        </select>
      </div>;
    })}</>;
}
