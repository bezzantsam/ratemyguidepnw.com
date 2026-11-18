'use client';

import {useId} from 'react';
import {TRIP_FIELDS,type TripDraft} from './trip-responses';

/** Optional, versioned questions; the caller must validate before submission. */
export function TripDetails({draft,onChange}:{draft:TripDraft;onChange:(draft:TripDraft)=>void}) {
  const prefix=useId();
  function update(key:string,value:string) {
    const next={...draft};
    if(value==='') delete next[key]; else next[key]=value;
    onChange(next);
  }
  return <details>
    <summary>Tell us more</summary>
    <h4>Tell us more about your trip</h4>
    <p>These questions are optional. Answer only what applies to your experience; please leave out names and other personal details.</p>
    {TRIP_FIELDS.map(field=>{
      const id=`${prefix}-${field.key}`, entry=draft[field.key]??'';
      const minuteMode=entry==='na'?'na':entry.startsWith('value:')?'value':'';
      const choices=field.kind==='boolean'?[{value:'yes',label:'Yes'},{value:'no',label:'No'}]:field.kind==='rating'?[1,2,3,4,5].map(n=>({value:String(n),label:`${n} / 5`})):(field.options??[]);
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
    })}
  </details>;
}
