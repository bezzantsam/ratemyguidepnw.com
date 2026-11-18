'use client';
import {useState} from 'react';
import type {GuideSource,PreferredNameReview} from '@/lib/launch-client';

export function PreferredNameModeration({review,save}:{review:(source:GuideSource)=>Promise<PreferredNameReview>;save:(source:GuideSource,name:string|null,reason:string)=>Promise<void>}){
 const [jurisdiction,setJurisdiction]=useState<'OR'|'WA'>('OR'),[sourceId,setSourceId]=useState(''),[name,setName]=useState(''),[reason,setReason]=useState(''),[result,setResult]=useState<PreferredNameReview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const source={jurisdiction,sourceId:sourceId.trim()};
 async function load(){setBusy(true);setMessage('');setResult(null);try{setResult(await review(source))}catch{setMessage('Name details are unavailable for this listing.')}finally{setBusy(false)}}
 async function submit(value:string|null){setBusy(true);setMessage('');try{await save(source,value,reason);setResult(await review(source));setMessage('Editorial name change saved.')}catch{setMessage('We could not confirm the name change. Refresh before trying again.')}finally{setBusy(false)}}
 return <section className="section card"><h2>Editorial name corrections</h2><p>Review captain and editorial names before applying or clearing a correction.</p>
  <label>Jurisdiction<select disabled={busy} value={jurisdiction} onChange={event=>{setJurisdiction(event.target.value as 'OR'|'WA');setResult(null);setName('');setReason('')}}><option value="OR">Oregon</option><option value="WA">Washington</option></select></label>
  <label>Source listing ID<input disabled={busy} value={sourceId} onChange={event=>{setSourceId(event.target.value);setResult(null);setName('');setReason('')}} maxLength={100}/></label>
  <button type="button" disabled={busy||!sourceId.trim()} onClick={()=>void load()}>Review name</button>
  {result&&<><p>Captain name: {result.captainName??'None'} {result.captainName&&!result.captainNameActive?'(inactive)':''}</p><p>Editorial name: {result.adminName??'None'}</p>
   <label>Name you go by<input disabled={busy} value={name} onChange={event=>setName(event.target.value)}/></label><p>For example, Scott. Your listing remains connected to the same guide record.</p>
   <label>Correction reason<textarea disabled={busy} value={reason} maxLength={500} onChange={event=>setReason(event.target.value)}/></label>
   <button type="button" disabled={busy||!reason.trim()||!name.trim()||Array.from(name.trim()).length>80||/[<>\u0000-\u001f\u007f]/u.test(name)} onClick={()=>void submit(name)}>Save correction</button>
   <button type="button" disabled={busy||!reason.trim()} onClick={()=>void submit(null)}>Clear correction</button>
   <h3>Recent name changes</h3>{result.history.length===0?<p>No recorded name changes.</p>:<ul>{result.history.map((event,i)=><li key={`${event.createdAt}:${i}`}>{event.createdAt} · {event.origin} · {event.oldName??'None'} → {event.newName??'None'}{event.reason?` · ${event.reason}`:''}</li>)}</ul>}
  </>}{message&&<p role="status">{message}</p>}
 </section>;
}
