'use client';

import {useId} from 'react';
import {FISH_LANDED_MAX,TRIP_FIELDS,isTripHighlight,type TripDraft,type TripField} from './trip-responses';

/** Optional, versioned questions; the caller must validate before submission. */
export function TripDetails({draft,onChange,children}:{draft:TripDraft;onChange:(draft:TripDraft)=>void;children?:React.ReactNode}) {
  return <details>
    <summary>Tell us more</summary>
    <h4>Tell us more about your trip</h4>
    <p>These questions are optional. Answer only what applies to your experience; please leave out names and other personal details.</p>
    {children}
    <TripFields fields={otherTripFields} draft={draft} onChange={onChange}/>
  </details>;
}

// Earlier effort responses remain in the draft without asking for the typed effort rating twice.
const otherTripFields=TRIP_FIELDS.filter(field=>field.key!=='effort'&&!isTripHighlight(field.key));

export function TripFields({fields,draft,onChange}:{
  fields:readonly TripField[];
  draft:TripDraft;
  onChange:(draft:TripDraft)=>void;
}) {
  const prefix=useId();
  function update(key:string,value:string) {
    const next={...draft};
    if(value==='') delete next[key]; else next[key]=value;
    onChange(next);
  }
  return <>{fields.map(field=>{
      const id=`${prefix}-${field.key}`, entry=draft[field.key]??'';
      const minuteMode=entry==='na'?'na':entry.startsWith('value:')?'value':'';
      const choices=field.kind==='boolean'?[{value:'yes',label:'Yes'},{value:'no',label:'No'}]:field.kind==='rating'?[1,2,3,4,5].map(n=>({value:String(n),label:`${n} / 5`})):(field.options??[]);
      if(field.kind==='count')return <div key={field.key}>
        <label htmlFor={id}>{field.label} (optional)</label>
        <input id={id} type="number" inputMode="numeric" min={0} max={FISH_LANDED_MAX} step={1}
          aria-describedby={`${id}-help`} value={entry.startsWith('value:')?entry.slice(6):''}
          onChange={event=>update(field.key,event.target.value===''?'':`value:${event.target.value}`)}/>
        <p id={`${id}-help`}>{entry==='na'?'Previously marked not applicable. ':''}Include fish your group released. Enter 0 if none landed.</p>
      </div>;
      return <div key={field.key}>
        <label htmlFor={id}>{field.label}</label>
        {field.kind==='minutes' ? <>
          <select id={id} value={minuteMode} onChange={event=>update(field.key,event.target.value==='value'?'value:':event.target.value)}>
            <option value="">Not answered</option><option value="na">Not applicable</option><option value="value">Enter minutes</option>
          </select>
          {minuteMode==='value' && <><label htmlFor={`${id}-minutes`}>Minutes</label><input id={`${id}-minutes`} type="number" min="0" max="1440" step="1" value={entry.slice(6)} onChange={event=>update(field.key,`value:${event.target.value}`)}/></>}
        </> : <select id={id} value={entry} onChange={event=>update(field.key,event.target.value)}>
          <option value="">Not answered</option><option value="na">Not applicable</option>{choices.map(choice=><option key={choice.value} value={`value:${choice.value}`}>{choice.label}</option>)}
        </select>}
      </div>;
    })}</>;
}
