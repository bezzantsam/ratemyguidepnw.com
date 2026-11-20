'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {client as authClient} from '@/components/AuthPanel';
import {BoatFields,newBoat,newTrip,TripFields,tripLocation,TripPreview,type Boat,type Trip,type TripPayload} from './CaptainTripFields';
import {createCaptainTripsClient,TripsError,type OwnerTrips} from './captain-trips-client';
import styles from './captain-trips.module.css';

const empty:TripPayload={vessels:[],offerings:[]};
const contact=/[<>\u0000-\u001f\u007f]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|www\.|(?:[0-9]{3}[-. ]?){2}[0-9]{4}/i;
const draftData=({vessels,offerings}:OwnerTrips['draft']):TripPayload=>({vessels,offerings});
const code=(error:unknown)=>error instanceof TripsError?error.code:'service_unavailable';

function problems(draft:TripPayload,complete:boolean):string[]{
  const errors:string[]=[];
  function field(label:string,value:string){
    if(complete&&!value.trim())errors.push(`${label} is required.`);
    else if(contact.test(value))errors.push(`${label} must omit contact details and links.`);
  }
  draft.offerings.forEach((trip,index)=>{
    const label=`Trip ${index+1}`;
    field(`${label} name`,trip.title);
    field(`${label} waterway`,trip.waterway);
    field(`${label} launch town or port`,trip.launchArea);
    if(complete&&!trip.species.length&&!trip.methodIds.includes('bottom-fishing'))
      errors.push(`${label} needs a target species or the Bottom fishing method.`);
  });
  draft.vessels.forEach((boat,index)=>{
    field(`Boat ${index+1} name`,boat.label);
    if(boat.maxAnglers!==null&&(!Number.isInteger(boat.maxAnglers)||boat.maxAnglers<1||boat.maxAnglers>30))
      errors.push(`Boat ${index+1} capacity must be a whole number from 1 to 30.`);
  });
  return errors;
}

export function CaptainTripsEditor({sourceId}:{sourceId:string}){
  const api=useMemo(()=>createCaptainTripsClient(sourceId,async()=>{
    const session=await authClient?.auth.getSession();
    return session?.data.session?.access_token??null;
  }),[sourceId]);
  const [saved,setSaved]=useState<OwnerTrips|null>(null);
  const [draft,setDraft]=useState<TripPayload>(empty);
  const [editing,setEditing]=useState<string|null>(null);
  const [removing,setRemoving]=useState<string|null>(null);
  const [preview,setPreview]=useState(false);
  const [busy,setBusy]=useState<'load'|'save'|'submit'|null>('load');
  const [message,setMessage]=useState('');
  const [errors,setErrors]=useState<string[]>([]);
  const [conflict,setConflict]=useState(false);
  const [closed,setClosed]=useState(false);
  const sequence=useRef(0);
  const ids=useRef({p:0,v:0});
  const activeTrip=editing?draft.offerings.find(trip=>trip.id===editing):undefined;
  const dirty=!!saved&&JSON.stringify(draft)!==JSON.stringify(draftData(saved.draft));
  const pending=saved?.proposal?.status==='pending';
  const sent=saved?.proposal?.revision===saved?.draft.revision;

  const accept=useCallback((state:OwnerTrips)=>{
    setSaved(state);
    setDraft(draftData(state.draft));
    ids.current={
      p:Math.max(ids.current.p,0,...state.draft.offerings.map(trip=>Number(trip.id.slice(1)))),
      v:Math.max(ids.current.v,0,...state.draft.vessels.map(boat=>Number(boat.id.slice(1)))),
    };
    setConflict(false);
  },[]);

  const load=useCallback(async()=>{
    const current=++sequence.current;
    setBusy('load');setClosed(false);setMessage('');setErrors([]);
    try{
      const state=await api.load();
      if(current!==sequence.current)return;
      accept(state);setEditing(null);setRemoving(null);setPreview(false);
    }catch(error){
      if(current!==sequence.current)return;
      if(['forbidden','sign_in_required','launch_unavailable'].includes(code(error))){
        setClosed(true);setSaved(null);setDraft(empty);
      }else setMessage('Couldn’t load your saved trips. Try again.');
    }finally{if(current===sequence.current)setBusy(null);}
  },[api,accept]);

  useEffect(()=>{void load();return()=>{sequence.current++;};},[load]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);

  async function mutate(kind:'save'|'submit'){
    if(!saved||busy||conflict)return;
    const issues=problems(draft,kind==='submit');
    setErrors(issues);setMessage('');
    if(issues.length)return;
    const current=++sequence.current;
    setBusy(kind);
    try{
      const state=kind==='save'?await api.save(saved.draft.revision,draft):await api.submit(saved.draft.revision);
      if(current!==sequence.current)return;
      accept(state);
      if(kind==='submit')setPreview(false);
      setMessage(kind==='save'?'Private draft saved.':'Trips submitted for review.');
    }catch(error){
      if(current!==sequence.current)return;
      const failure=code(error);
      if(failure==='conflict'){
        setConflict(true);
        setMessage('Another window saved changes or a proposal is already under review. Your edits are still here.');
      }else if(['forbidden','sign_in_required'].includes(failure)){
        setClosed(true);setSaved(null);setDraft(empty);
      }else if(failure==='invalid_input'){
        setMessage('The server couldn’t validate these trips. Check the fields and try again.');
      }else{
        setMessage(kind==='save'?'Couldn’t confirm the save. Your edits are still here.':'Couldn’t confirm submission. Check the saved status before retrying.');
        if(kind==='submit')setConflict(true);
      }
    }finally{if(current===sequence.current)setBusy(null);}
  }

  function edit(next:TripPayload){
    setDraft(next);setMessage('');setErrors([]);setPreview(false);
  }
  function addTrip(){
    if(ids.current.p>=9999)return;
    const trip=newTrip('p'+ ++ids.current.p);
    edit({...draft,offerings:[...draft.offerings,trip]});setEditing(trip.id);
  }
  function changeTrip(id:string,patch:Partial<Trip>){
    edit({...draft,offerings:draft.offerings.map(trip=>trip.id===id?{...trip,...patch}:trip)});
  }
  function removeTrip(id:string){
    edit({...draft,offerings:draft.offerings.filter(trip=>trip.id!==id)});
    if(editing===id)setEditing(null);
    setRemoving(null);
  }
  function addBoat(){
    if(ids.current.v>=9999)return;
    edit({...draft,vessels:[...draft.vessels,newBoat('v'+ ++ids.current.v)]});
  }
  function changeBoat(id:string,patch:Partial<Boat>){
    edit({...draft,vessels:draft.vessels.map(boat=>boat.id===id?{...boat,...patch}:boat)});
  }
  function showPreview(){
    const issues=problems(draft,true);
    setErrors(issues);setMessage('');
    if(!issues.length){setPreview(true);setEditing(null);}
  }

  if(closed)return null;
  return <section className={`section card launch-form ${styles.editor}`} id="my-trips" aria-labelledby="my-trips-title">
    <h3 id="my-trips-title">My trips</h3>
    {busy==='load'&&<p role="status">Loading your trips…</p>}
    {saved&&<>
      <p>{saved.publishedVersion===null?'No captain-supplied trips are published.':'Approved trips stay public until a new proposal is approved.'} Drafts are private.</p>
      {pending&&<p className={styles.notice} role="status">Your trips are awaiting review.</p>}
      {saved.proposal?.status==='approved'&&<p role="status">Your last proposal was approved.</p>}
      {saved.proposal?.status==='rejected'&&<p role="status">Your last proposal wasn’t published.{saved.proposal.reason&&` ${saved.proposal.reason}`}</p>}
      <fieldset disabled={!!busy} className={styles.panel}>
        <legend>Draft trips</legend>
        {draft.offerings.length===0?<p>No trips in this draft.</p>:<ul className={styles.list}>
          {draft.offerings.map((trip,index)=>{
            const title=trip.title.trim()||`Unnamed trip ${index+1}`;
            return <li key={trip.id} className={styles.trip}>
              <div><strong>{title}</strong><p>{tripLocation(trip)}</p></div>
              {removing===trip.id?<div className={styles.actions}>
                <button type="button" onClick={()=>removeTrip(trip.id)}>Confirm remove</button>
                <button type="button" onClick={()=>setRemoving(null)}>Keep trip</button>
              </div>:<div className={styles.actions}>
                <button type="button" aria-label={`Edit ${title}`} onClick={()=>{setEditing(trip.id);setPreview(false);}}>Edit</button>
                <button type="button" aria-label={`Remove ${title}`} onClick={()=>setRemoving(trip.id)}>Remove</button>
              </div>}
            </li>;
          })}
        </ul>}
        <div className={styles.actions}><button type="button" onClick={addTrip} disabled={draft.offerings.length>=8||ids.current.p>=9999}>Add trip</button></div>
        {activeTrip&&<TripFields key={activeTrip.id} trip={activeTrip} boats={draft.vessels}
          onChange={patch=>changeTrip(activeTrip.id,patch)} onDone={()=>setEditing(null)}/>}
        <details>
          <summary>Manage boats (optional)</summary>
          <div>
            {draft.vessels.map(boat=><BoatFields key={boat.id} boat={boat}
              used={draft.offerings.some(trip=>trip.vesselId===boat.id)}
              onChange={patch=>changeBoat(boat.id,patch)}
              onRemove={()=>edit({...draft,vessels:draft.vessels.filter(item=>item.id!==boat.id)})}/>)}
            <div className={styles.actions}>
              <button type="button" onClick={addBoat} disabled={draft.vessels.length>=4||ids.current.v>=9999}>Add boat</button>
            </div>
          </div>
        </details>
      </fieldset>
      {dirty&&<p role="status">You have unsaved changes.</p>}
      <div className={styles.actions}>
        <button type="button" disabled={!dirty||!!busy||conflict} onClick={()=>void mutate('save')}>{busy==='save'?'Saving…':'Save private draft'}</button>
        <button type="button" disabled={!!busy} onClick={showPreview}>Preview for publication</button>
        <button type="button" disabled={!!busy||dirty||conflict} onClick={()=>void load()}>Refresh status</button>
      </div>
      {preview&&<section className={styles.panel} aria-labelledby="trip-preview-title">
        <h4 id="trip-preview-title">Private publication preview</h4>
        {draft.offerings.length?<ul className={styles.list}>{draft.offerings.map(trip=><TripPreview key={trip.id} trip={trip}
          boat={draft.vessels.find(boat=>boat.id===trip.vesselId)}/>)}</ul>:
          <p>If approved, this proposal will show no captain-supplied trips.</p>}
        {dirty?<p>Save the private draft before submitting it.</p>:
          pending?<p>Wait for the pending proposal to be decided before submitting another.</p>:
          sent?<p>This saved revision has already been submitted. Save changes to submit another proposal.</p>:null}
        <div className={styles.actions}>
          <button type="button" disabled={dirty||!!busy||conflict||pending||sent||saved.draft.revision===0} onClick={()=>void mutate('submit')}>
            {busy==='submit'?'Submitting…':'Submit trips for review'}
          </button>
          <button type="button" onClick={()=>setPreview(false)}>Close preview</button>
        </div>
      </section>}
    </>}
    {errors.length>0&&<ul role="alert">{errors.map(error=><li key={error}>{error}</li>)}</ul>}
    {message&&<p role="status">{message}</p>}
    {conflict&&<div className={styles.actions}>
      <button type="button" disabled={!!busy} onClick={()=>void load()}>
        {dirty?'Discard local edits and load the saved draft':'Load saved status'}
      </button>
    </div>}
    {!saved&&busy!=='load'&&<div className={styles.actions}><button type="button" onClick={()=>void load()}>Retry loading trips</button></div>}
  </section>;
}
