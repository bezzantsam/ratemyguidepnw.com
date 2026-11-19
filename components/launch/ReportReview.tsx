'use client';

import {useId,useRef,useState} from 'react';
import type {ReportReason} from '@/lib/launch-client';

type Receipt={id:string;status:'submitted';existing:boolean};

export function ReportReview({onReport,allowSignIn=true}:{onReport?:(reason:ReportReason)=>Promise<Receipt>;allowSignIn?:boolean}) {
  const id=useId(),pending=useRef(false);
  const [open,setOpen]=useState(false),[reason,setReason]=useState<ReportReason|''>('');
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  if(!onReport)return allowSignIn?<p><a href="#write-review">Sign in to report this review</a></p>:null;
  const report=onReport;
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(!reason||pending.current)return;
    pending.current=true;setBusy(true);setMessage('');
    try {const result=await report(reason);setMessage(result.existing?'You already reported this review. Your earlier report is on file.':'Report sent. We’ll review it.');setOpen(false)}
    catch {setMessage('Couldn’t send your report. Try again.')}
    finally {pending.current=false;setBusy(false)}
  }
  return <div className="launch-controls">
    {!open&&<button type="button" onClick={()=>{setOpen(true);setMessage('')}}>Report review</button>}
    {open&&<form className="launch-form" onSubmit={submit}>
      <label htmlFor={id}>What’s wrong with this review?</label>
      <select id={id} value={reason} required onChange={event=>setReason(event.target.value as ReportReason|'')}>
        <option value="">Choose a reason</option><option value="not_firsthand">Not about a firsthand trip</option><option value="harassment_or_private_info">Harassment or private information</option><option value="other">Other</option>
      </select>
      <div className="launch-actions"><button disabled={busy} type="submit">{busy?'Sending…':'Send report'}</button><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button></div>
    </form>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
