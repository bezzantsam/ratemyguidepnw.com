'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import AuthPanel,{client as authClient} from '@/components/AuthPanel';
import {createLaunchClient,type OperatorItem,type SubmissionKind} from '@/lib/launch-client';

/** Access and every operation are independently checked by the server. */
export function AdminConsole({claimsEnabled=false}:{claimsEnabled?:boolean}) {
  const api=useMemo(()=>createLaunchClient({enabled:true,getAccessToken:async()=>{const result=await authClient?.auth.getSession();return result?.data.session?.access_token??null}}),[]);
  const [access,setAccess]=useState<'loading'|'signed_out'|'operator'|'denied'|'error'>('loading');
  const [kind,setKind]=useState<SubmissionKind>('review'),[offset,setOffset]=useState(0),[items,setItems]=useState<OperatorItem[]|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[notes,setNotes]=useState<Record<string,string>>({});
  const processing=useRef(new Set<string>());
  const authEpoch=useRef(0),queueEpoch=useRef(0);
  const refreshAccess=useCallback(async()=>{const epoch=++authEpoch.current;try{const s=await authClient?.auth.getSession();if(epoch!==authEpoch.current)return;if(!s?.data.session){setAccess('signed_out');setItems(null);return}const result=await api.session();if(epoch===authEpoch.current)setAccess(result.operator?'operator':'denied')}catch{if(epoch===authEpoch.current){setAccess('error');setItems(null)}}},[api]);
  const load=useCallback(async()=>{if(access!=='operator')return;const epoch=authEpoch.current,queue=++queueEpoch.current;setItems(null);setError('');try{const rows=await api.operatorQueue(kind,offset,50);if(epoch===authEpoch.current&&queue===queueEpoch.current)setItems(rows)}catch{if(epoch===authEpoch.current&&queue===queueEpoch.current)setError('The moderation queue is temporarily unavailable.')}},[access,api,kind,offset]);
  useEffect(()=>{void refreshAccess();if(!authClient)return;const {data:{subscription}}=authClient.auth.onAuthStateChange((_event,next)=>{authEpoch.current++;queueEpoch.current++;setAccess(next?'loading':'signed_out');setItems(null);setNotes({});window.setTimeout(()=>void refreshAccess(),0)});return()=>{authEpoch.current++;queueEpoch.current++;subscription.unsubscribe()}},[refreshAccess]);
  useEffect(()=>{void load()},[load]);
  async function decide(item:OperatorItem,approve:boolean){
    if(item.kind==='report'||(item.kind==='claim'&&!claimsEnabled))return;
    if(processing.current.has(item.id))return;
    const reason=(notes[item.id]??'').trim();
    if((approve&&reason.length<20)||(!approve&&!reason)){setError(approve?'Record at least 20 characters of manual review evidence.':'Add a reason before rejecting.');return}
    if(approve&&!item.canApprove){setError('Required review information is unavailable. This item cannot be approved here.');return}
    processing.current.add(item.id);setError('');setMessage('');
    try{const receipt=await api.operatorDecide(item.kind,item.id,approve,reason);setMessage(`Decision confirmed: ${receipt.status}.`);await load()}
    catch{setError('The decision could not be confirmed. Refresh the queue before trying again.')}
    finally{processing.current.delete(item.id)}
  }
  async function resolveReport(item:OperatorItem){
    if(item.kind!=='report'||processing.current.has(item.id))return;
    processing.current.add(item.id);setError('');setMessage('');
    try{const receipt=await api.resolveReport(item.id);setMessage(`Report confirmed: ${receipt.status}. The review was not changed.`);await load()}
    catch{setError('The report resolution could not be confirmed. Refresh the queue before trying again.')}
    finally{processing.current.delete(item.id)}
  }
  return <main className="launch-controls"><p className="eyebrow">SITE OPERATIONS</p><h1>Moderation</h1><AuthPanel moderator onSignedIn={()=>void refreshAccess()}/>
    {access==='loading'&&<p role="status">Checking operator access…</p>}{access==='signed_out'&&<p>Sign in with an authorized operator account.</p>}{access==='denied'&&<p role="status">This account does not have operator access.</p>}{access==='error'&&<p role="status">Operator access is temporarily unavailable.</p>}
    {access==='operator'&&<section><h2>Pending submissions</h2><label>Submission type <select value={kind} onChange={e=>{queueEpoch.current++;setItems(null);setKind(e.target.value as SubmissionKind);setOffset(0);setMessage('')}}><option value="review">Reviews</option>{claimsEnabled&&<option value="claim">Claims</option>}<option value="revision">Review edits</option><option value="report">Review reports</option></select></label>
      {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
      {items===null?!error&&<p role="status">Loading submissions…</p>:items.length===0?<p>No pending submissions on this page.</p>:items.map(item=><article className="card" key={`${item.kind}:${item.id}`}>
        <h3>{item.kind==='review'?'Review':item.kind==='claim'?'Claim request':item.kind==='revision'?'Review edit':'Review report'} · {item.guideName??'Listing unavailable'}</h3>{item.reviewId&&<p>Review reference: {item.reviewId}</p>}<p>Submitted: {item.createdAt}</p><p style={{whiteSpace:'pre-wrap'}}>{item.description}</p>
        {item.kind==='report'?<><p>Resolving a report records its review; it does not hide or change the review.</p><button type="button" onClick={()=>void resolveReport(item)}>Resolve report</button></>:<>{!item.canApprove&&<p>Required information is unavailable; approval is disabled.</p>}<label>Decision note<textarea maxLength={500} value={notes[item.id]??''} onChange={e=>setNotes({...notes,[item.id]:e.target.value})}/></label>
        <div className="launch-actions"><button type="button" disabled={!item.canApprove} onClick={()=>void decide(item,true)}>Approve</button><button type="button" onClick={()=>void decide(item,false)}>Reject</button></div></>}
      </article>)}
      <div>{offset>0&&<button type="button" onClick={()=>setOffset(Math.max(0,offset-50))}>Previous page</button>}{items?.length===50&&<button type="button" onClick={()=>setOffset(offset+50)}>Next page</button>} <button type="button" onClick={()=>void load()}>Refresh queue</button></div>
    </section>}
  </main>;
}
