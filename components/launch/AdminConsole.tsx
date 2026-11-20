'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import AuthPanel,{client as authClient} from '@/components/AuthPanel';
import {createLaunchClient,LaunchClientError,type OperatorItem,type SubmissionKind} from '@/lib/launch-client';

import TripProposalQueue from './TripProposalQueue';

type Access = {status:'loading'|'signed_out'|'denied'|'expired'|'error'} | {status:'operator';epoch:number};
type DecisionFeedback = {
  phase:'invalid'|'saving'|'confirmed'|'uncertain'|'checking'|'absent'|'retry';
  text:string;
};
const rowKey=(item:OperatorItem)=>`${item.kind}:${item.id}`;
const noteId=(item:OperatorItem)=>`decision-note-${item.kind}-${item.id}`;
const isBusy=(feedback:DecisionFeedback|undefined)=>feedback?.phase==='saving'||feedback?.phase==='checking';
const needsQueueCheck='The decision could not be confirmed. Check the pending queue before trying again.';

/** Access and every operation are independently checked by the server. */
export function AdminConsole({claimsEnabled=false,offeringsEnabled=false}:{claimsEnabled?:boolean;offeringsEnabled?:boolean}) {
  const [access,setAccess]=useState<Access>({status:'loading'});
  const [kind,setKind]=useState<SubmissionKind>('review'),[offset,setOffset]=useState(0),[items,setItems]=useState<OperatorItem[]|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[notes,setNotes]=useState<Record<string,string>>({});
  const [decisions,setDecisions]=useState<Record<string,DecisionFeedback|undefined>>({});
  // Update the guard synchronously, before React can render the disabled buttons.
  const decisionGuard=useRef(decisions);
  const processing=useRef(new Set<string>());
  const authEpoch=useRef(0),queueEpoch=useRef(0);
  const actor=useRef<string|null|undefined>(undefined);
  const api=useMemo(()=>createLaunchClient({enabled:true,getAccessToken:async()=>{
    const expected=actor.current,epoch=authEpoch.current;
    const session=(await authClient?.auth.getSession())?.data.session;
    return expected&&session?.user.id===expected&&epoch===authEpoch.current?session.access_token:null;
  }}),[]);
  const verifyAccess=useCallback(async(epoch:number)=>{
    if(epoch!==authEpoch.current)return;
    try{
      const result=await api.session();
      if(epoch===authEpoch.current)setAccess(result.operator?{status:'operator',epoch}:{status:'denied'});
    }catch(error){
      if(epoch===authEpoch.current)setAccess({status:error instanceof LaunchClientError&&error.code==='sign_in_required'?'expired':'error'});
    }
  },[api]);
  function retryAccess(){
    if(!actor.current||access.status==='expired'){
      // The initial provider read failed. Re-entering the page reinitializes that read.
      window.location.reload();
      return;
    }
    setAccess({status:'loading'});setItems(null);
    void verifyAccess(++authEpoch.current);
  }
  const load=useCallback(async()=>{
    if(access.status!=='operator'||access.epoch!==authEpoch.current)return;
    const {epoch}=access,queue=++queueEpoch.current;
    setItems(null);setError('');
    try{
      const rows=await api.operatorQueue(kind,offset,50);
      if(epoch===authEpoch.current&&queue===queueEpoch.current)setItems(rows);
    }catch(error){
      if(epoch!==authEpoch.current||queue!==queueEpoch.current)return;
      if(error instanceof LaunchClientError&&error.code==='sign_in_required')setAccess({status:'expired'});
      else if(error instanceof LaunchClientError&&error.code==='forbidden')setAccess({status:'denied'});
      else setError('The moderation queue is temporarily unavailable.');
    }
  },[access,api,kind,offset]);
  useEffect(()=>{
    if(!authClient){setAccess({status:'error'});return}
    let active=true,timer:number|undefined;
    function observe(id:string|null){
      if(!active||id===actor.current)return;
      actor.current=id;
      const epoch=++authEpoch.current;
      queueEpoch.current++;
      window.clearTimeout(timer);
      processing.current=new Set();
      decisionGuard.current={};setDecisions(decisionGuard.current);
      setItems(null);setNotes({});setError('');setMessage('');
      setKind('review');setOffset(0);
      setAccess({status:id?'loading':'signed_out'});
      // Auth callbacks run under the provider lock. All API and auth reads run later.
      if(id)timer=window.setTimeout(()=>void verifyAccess(epoch),0);
    }
    const {data:{subscription}}=authClient.auth.onAuthStateChange((_event,session)=>observe(session?.user.id??null));
    void authClient.auth.getSession().then(({data,error})=>{
      if(!active||actor.current!==undefined)return;
      if(error)setAccess({status:'error'});
      else observe(data.session?.user.id??null);
    }).catch(()=>{if(active&&actor.current===undefined)setAccess({status:'error'})});
    return()=>{
      active=false;
      actor.current=undefined;
      authEpoch.current++;queueEpoch.current++;
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  },[verifyAccess]);
  useEffect(()=>{void load()},[load]);

  function showDecision(key:string,feedback:DecisionFeedback|undefined){
    decisionGuard.current={...decisionGuard.current,[key]:feedback};
    setDecisions(decisionGuard.current);
  }
  function decisionInProgress(){
    return Object.values(decisionGuard.current).some(isBusy);
  }
  async function decide(item:OperatorItem,approve:boolean){
    if(access.status!=='operator'||access.epoch!==authEpoch.current||item.kind==='report'||
       (item.kind==='claim'?!claimsEnabled:item.ownSubmission!==false)||(approve&&!item.canApprove))return;
    const {epoch}=access,key=rowKey(item);
    const phase=decisionGuard.current[key]?.phase;
    if(phase&&phase!=='invalid'&&phase!=='retry')return;
    const reason=(notes[key]??'').trim();
    if((approve&&reason.length<20)||(!approve&&!reason)){
      showDecision(key,{phase:'invalid',text:approve
        ?'Enter at least 20 characters of evidence from your review before approving.'
        :'Enter a reason before rejecting.'});
      document.getElementById(noteId(item))?.focus();
      return;
    }
    showDecision(key,{phase:'saving',text:approve?'Submitting approval…':'Submitting rejection…'});
    try{
      const receipt=await api.operatorDecide(item.kind,item.id,approve,reason);
      if(epoch!==authEpoch.current)return;
      setNotes(previous=>{
        const next={...previous};
        delete next[key];
        return next;
      });
      showDecision(key,{phase:'confirmed',text:`Decision confirmed: ${receipt.status}.`});
    }catch{
      if(epoch===authEpoch.current)showDecision(key,{phase:'uncertain',text:needsQueueCheck});
    }
  }

  async function checkDecision(item:OperatorItem){
    const key=rowKey(item);
    if(access.status!=='operator'||access.epoch!==authEpoch.current||decisionGuard.current[key]?.phase!=='uncertain')return;
    const {epoch}=access,queue=queueEpoch.current;
    showDecision(key,{phase:'checking',text:'Checking the pending queue…'});
    try{
      const rows=await api.operatorQueue(kind,offset,50);
      if(epoch!==authEpoch.current)return;
      if(queue!==queueEpoch.current){
        showDecision(key,{phase:'uncertain',text:needsQueueCheck});
        return;
      }
      const fresh=rows.find(row=>rowKey(row)===key);
      if(fresh){
        setItems(previous=>previous?.map(row=>rowKey(row)===key?fresh:row)??null);
        showDecision(key,{phase:'retry',text:'This submission is still pending. Review your note before trying again.'});
      }else{
        showDecision(key,{phase:'absent',text:'This submission is no longer on this pending page. Its outcome could not be confirmed here.'});
      }
    }catch(error){
      if(epoch!==authEpoch.current)return;
      showDecision(key,{phase:'uncertain',text:'The pending queue could not be checked. Try checking again.'});
      if(error instanceof LaunchClientError&&error.code==='sign_in_required')setAccess({status:'expired'});
      if(error instanceof LaunchClientError&&error.code==='forbidden')setAccess({status:'denied'});
    }
  }
  async function resolveReport(item:OperatorItem){
    if(access.status!=='operator'||access.epoch!==authEpoch.current||item.kind!=='report')return;
    const {epoch}=access,pending=processing.current;
    if(pending.has(item.id))return;
    pending.add(item.id);setError('');setMessage('');
    try{
      const receipt=await api.resolveReport(item.id);
      if(epoch===authEpoch.current){setMessage(`Report confirmed: ${receipt.status}. The review was not changed.`);await load()}
    }catch{
      if(epoch===authEpoch.current)setError('The report resolution could not be confirmed. Refresh the queue before trying again.');
    }finally{pending.delete(item.id)}
  }
  const busy=Object.values(decisions).some(isBusy);
  return <main className="launch-controls"><p className="eyebrow">SITE OPERATIONS</p><h1>Moderation</h1><AuthPanel moderator/>
    {access.status==='loading'&&<p role="status">Checking operator access…</p>}{access.status==='signed_out'&&<p>Sign in with an authorized operator account.</p>}{access.status==='denied'&&<p role="status">This account does not have operator access. Sign out, then use your authorized moderator email.</p>}
    {access.status==='expired'&&<p role="status">Your moderator session could not be verified. Check access again, or sign out and request a new link.</p>}
    {access.status==='error'&&<p role="status">Operator access is temporarily unavailable.</p>}
    {(access.status==='denied'||access.status==='expired'||access.status==='error')&&<button type="button" onClick={retryAccess}>Check access again</button>}
    {access.status==='operator'&&<section><h2>Pending submissions</h2><label>Submission type <select value={kind} disabled={busy} onChange={e=>{if(decisionInProgress())return;queueEpoch.current++;setItems(null);setKind(e.target.value as SubmissionKind);setOffset(0);setMessage('')}}><option value="review">Reviews</option>{claimsEnabled&&<option value="claim">Claims</option>}<option value="revision">Review edits</option><option value="report">Review reports</option></select></label>
      {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
      {items===null?!error&&<p role="status">Loading submissions…</p>:items.length===0?<p>No pending submissions on this page.</p>:items.map(item=>{
        const key=rowKey(item),feedback=decisions[key],id=noteId(item);
        const invalid=feedback?.phase==='invalid';
        const locked=isBusy(feedback)||feedback?.phase==='uncertain';
        const settled=feedback?.phase==='confirmed'||feedback?.phase==='absent';
        return <article className="card" key={key}>
          <h3>{item.kind==='review'?'Review':item.kind==='claim'?'Claim request':item.kind==='revision'?'Review edit':'Review report'} · {item.guideName??'Listing unavailable'}</h3>
          {!settled&&<>
            {item.guideProfilePath&&<p><a href={item.guideProfilePath}>Washington listing {item.guideProfilePath.split('/').at(-1)}</a></p>}
            {item.reviewId&&<p>Review reference: {item.reviewId}</p>}
            <p>Submitted: {item.createdAt}</p><p style={{whiteSpace:'pre-wrap'}}>{item.description}</p>
            {item.kind==='report'?<><p>Resolving a report records its review; it does not hide or change the review.</p><button type="button" onClick={()=>void resolveReport(item)}>Resolve report</button></>
              :item.kind!=='claim'&&item.ownSubmission!==false?<p>{item.ownSubmission===true
                ?'Your submission. Another moderator must make the decision.'
                :'Submission ownership could not be confirmed. Decisions are unavailable.'}</p>
              :<>
                {!item.canApprove&&<p>Required information is unavailable; approval is disabled.</p>}
                <label htmlFor={id}>Private decision note</label>
                <p id={`${id}-help`}>Approval requires at least 20 characters of evidence from your review. Rejection requires a reason. The note is private. Maximum 500 characters.</p>
                <textarea id={id} maxLength={500} readOnly={locked} aria-invalid={invalid||undefined}
                  aria-describedby={`${id}-help${invalid?` ${id}-feedback`:''}`} value={notes[key]??''} onChange={e=>{
                    const value=e.target.value;
                    setNotes(previous=>({...previous,[key]:value}));
                    if(decisionGuard.current[key]?.phase==='invalid')showDecision(key,undefined);
                  }}/>
                <div className="launch-actions">
                  <button type="button" disabled={locked||!item.canApprove} onClick={()=>void decide(item,true)}>Approve</button>
                  <button type="button" disabled={locked} onClick={()=>void decide(item,false)}>Reject</button>
                </div>
              </>}
          </>}
          <div id={`${id}-feedback`} role="alert">{invalid||feedback?.phase==='uncertain'?feedback?.text:null}</div>
          <div role="status">{feedback&&!invalid&&feedback.phase!=='uncertain'?feedback.text:null}</div>
          {(feedback?.phase==='uncertain'||feedback?.phase==='checking')&&
            <button type="button" disabled={feedback.phase==='checking'} onClick={()=>void checkDecision(item)}>Check pending queue</button>}
        </article>;
      })}
      <div>
        {offset>0&&<button type="button" disabled={busy} onClick={()=>{if(!decisionInProgress())setOffset(Math.max(0,offset-50))}}>Previous page</button>}
        {items?.length===50&&<button type="button" disabled={busy} onClick={()=>{if(!decisionInProgress())setOffset(offset+50)}}>Next page</button>}
        <button type="button" disabled={busy} onClick={()=>{if(!decisionInProgress())void load()}}>Refresh queue</button>
      </div>
    </section>}
    {access.status==='operator'&&offeringsEnabled&&<TripProposalQueue key={access.epoch}/>}
  </main>;
}
