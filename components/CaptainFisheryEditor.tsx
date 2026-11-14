'use client';
import {useEffect,useId,useState} from 'react';
import {client} from './AuthPanel';
import {
  BOOKING_STYLES, FISH_CARE, MAX_OFFERINGS, MAX_VESSELS,
  TARGET_SPECIES, TRIP_DURATIONS, VESSEL_TYPES, WATERWAY_SUGGESTIONS,
  createCaptainProposalInsert, isSafeCaptainDraft, makeEmptyCaptainDraft,
  nextDraftId, validateCaptainFisheryDraft,
  type CaptainFisheryDraft, type CaptainFishery, type CaptainVessel,
} from '@/lib/captain-fisheries';

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const storageKey=(id:string)=>'rmgpnw:captain-fleet-draft:v2:'+id;
const bookingLabels:Record<(typeof BOOKING_STYLES)[number],string>={
  call_to_confirm:'Contact to confirm', per_seat:'Individual seats',
  private_boat:'Private boat only', both:'Individual seats or private boat',
};
const durationLabels:Record<(typeof TRIP_DURATIONS)[number],string>={
  unspecified:'Contact to confirm',half_day:'Half day',full_day:'Full day',multi_day:'Multi-day',
};

export default function CaptainFisheryEditor({listing,name,submitEnabled=false}:{listing:string;name:string;submitEnabled?:boolean}){
  const suggestionsId=useId();
  const [draft,setDraft]=useState<CaptainFisheryDraft>(makeEmptyCaptainDraft);
  const [ready,setReady]=useState(false);
  const [signedIn,setSignedIn]=useState(false);
  const [approvedOwner,setApprovedOwner]=useState(false);
  const [guideUuid,setGuideUuid]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [submitted,setSubmitted]=useState(false);

  useEffect(()=>{
    try {
      const raw=sessionStorage.getItem(storageKey(listing));
      if(raw){
        const candidate:unknown=JSON.parse(raw);
        // Restore **incomplete** genuine drafts but never unbounded or unknown-key JSON.
        if(isSafeCaptainDraft(candidate))setDraft(candidate);
      }
    }catch{ /* A corrupt or blocked session store never blocks editing. */ }
    setReady(true);
  },[listing]);

  useEffect(()=>{
    if(!ready||submitted)return;
    try{sessionStorage.setItem(storageKey(listing),JSON.stringify(draft))}
    catch{ /* This visit remains usable without storage. */ }
  },[draft,listing,ready,submitted]);

  useEffect(()=>{
    if(!client)return;
    let active=true;
    const check=async()=>{
      const {data:auth}=await client!.auth.getUser();
      if(!active)return;
      setSignedIn(!!auth.user);
      setApprovedOwner(false);
      setGuideUuid('');
      if(!auth.user)return;
      const slug=listing.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
      const {data:guide,error:guideError}=await client!.from('guides').select('id')
        .eq('slug',slug).maybeSingle();
      if(!active||guideError||!guide)return;
      const {data:claims,error}=await client!.from('guide_claims').select('id')
        .eq('guide_id',guide.id).eq('claimant_id',auth.user.id).eq('status','approved').limit(1);
      if(!active||error||!claims?.length)return;
      setApprovedOwner(true);
      setGuideUuid(guide.id);
    };
    void check();
    const {data:{subscription}}=client.auth.onAuthStateChange(()=>{
      void Promise.resolve().then(check);
    });
    return ()=>{active=false;subscription.unsubscribe()};
  },[listing]);

  function changeVessel(id:string,patch:Partial<CaptainVessel>){
    setDraft(d=>({...d,vessels:d.vessels.map(v=>v.id===id?{...v,...patch}:v)}));
    setMessage('');
  }
  function changeOffering(id:string,patch:Partial<CaptainFishery>){
    setDraft(d=>({...d,offerings:d.offerings.map(o=>o.id===id?{...o,...patch}:o)}));
    setMessage('');
  }
  function toggleSpecies(o:CaptainFishery,species:string){
    changeOffering(o.id,{species:o.species.includes(species)?
      o.species.filter(v=>v!==species):[...o.species,species]});
  }
  function toggleMonth(o:CaptainFishery,month:number){
    changeOffering(o.id,{months:o.months.includes(month)?
      o.months.filter(v=>v!==month):[...o.months,month]});
  }
  function toggleCare(v:CaptainVessel,care:string){
    changeVessel(v.id,{fishCare:v.fishCare.includes(care)?
      v.fishCare.filter(c=>c!==care):[...v.fishCare,care]});
  }
  function addVessel(){
    setDraft(d=>{
      if(d.vessels.length>=MAX_VESSELS)return d;
      const id=nextDraftId(d.vessels,'v');
      return {...d,vessels:[...d.vessels,{id,label:'Boat '+(d.vessels.length+1),
        type:'Other / varies',covered:false,heated:false,maxAnglers:null,fishCare:[]}]};
    });
    setMessage('');
  }
  function removeVessel(vesselId:string){
    if(draft.vessels.some(v=>v.id===vesselId)&&draft.offerings.some(o=>o.vesselId===vesselId)){
      setMessage('This boat is assigned to a fishery. Reassign each trip before removing it.');
      return;
    }
    if(draft.vessels.length<=1){
      setMessage('Each profile needs at least one boat or vessel description.');
      return;
    }
    setDraft(d=>({...d,vessels:d.vessels.filter(v=>v.id!==vesselId)}));
    setMessage('');
  }
  function addOffering(){
    setDraft(d=>{
      if(d.offerings.length>=MAX_OFFERINGS)return d;
      return {...d,offerings:[...d.offerings,{
        id:nextDraftId(d.offerings,'p'),title:'',waterway:'',launchArea:'',
        species:[],months:[],vesselId:d.vessels[0].id,
        bookingStyle:'call_to_confirm',duration:'unspecified'
      }]};
    });
    setMessage('');
  }
  function removeOffering(id:string){
    if(draft.offerings.length<=1){setMessage('Keep at least one fishery.');return}
    setDraft(d=>({...d,offerings:d.offerings.filter(o=>o.id!==id)}));
    setMessage('');
  }
  function clearDraft(){
    try{sessionStorage.removeItem(storageKey(listing))}catch{}
    setDraft(makeEmptyCaptainDraft());
    setMessage('Draft cleared from this tab.');
    setSubmitted(false);
  }
  async function submit(){
    if(!submitEnabled){setMessage('Captain-contributed trip submissions are not live yet. Your draft stays in this tab.');return;}
    const errors=validateCaptainFisheryDraft(draft);
    if(errors.length){setMessage(errors[0]);return}
    if(!client||!guideUuid||!signedIn||!approvedOwner){
      setMessage('An independently approved profile claim and active submission service are required.');
      return;
    }
    setBusy(true);setMessage('');
    try{
      const {data:auth,error:authError}=await client.auth.getUser();
      if(authError||!auth.user){setMessage('Sign in again before submitting.');return}
      const row=createCaptainProposalInsert(draft,guideUuid,auth.user.id);
      const {error}=await client.from('guide_fishery_proposals').insert(row);
      if(error){
        setMessage(error.code==='42P01'||error.code==='PGRST205'?
          'Captain submissions are not enabled in the database yet. Your tab-local draft remains available.':
          'Could not submit for moderation. No public profile was changed. Your local draft remains available.');
        return;
      }
      setSubmitted(true);
      setMessage('Seasonal packages and boats sent for manual review. Nothing is public or independently verified.');
      try{sessionStorage.removeItem(storageKey(listing))}catch{}
    }catch{
      setMessage('Submission failed. No public profile was changed. Your draft remains in this browser tab.');
    }finally{setBusy(false)}
  }
  const errors=validateCaptainFisheryDraft(draft);

  return <section className="section card captain-fishery-editor" aria-labelledby="captain-fishery-title">
    <p className="eyebrow">CAPTAIN-CONTRIBUTED DETAILS · FREE FACTUAL UPDATES</p>
    <h2 id="captain-fishery-title">Build your seasonal fishing profile</h2>
    {!submitEnabled&&<p role="status" className="muted">Preview only. The live database does not yet support captain fishery proposals; nothing can be submitted or published.</p>}
    <p>Help anglers discover {name} by fishing water, species, month, and the <strong>actual boat assigned to each trip</strong>. This information is self-reported, not a license check. Paid tools never affect review scores or directory rankings.</p>
    <p className="muted">This form is a tab-local draft. After independent ownership approval, submissions enter manual moderation. Neither the trip packages nor your vessel claims publish automatically.</p>
    <datalist id={suggestionsId}>{WATERWAY_SUGGESTIONS.map(w=><option key={w} value={w}/>)}</datalist>

    <div className="captain-fishery-offerings" aria-label="Boats and vessels">
      <h3>1. Your boats</h3>
      {draft.vessels.map((boat,index)=><fieldset key={boat.id} className="captain-fishery-item">
        <legend>Boat {index+1}</legend>
        <label>How should anglers recognize this boat? *
          <input type="text" maxLength={80} value={boat.label}
            onChange={e=>changeVessel(boat.id,{label:e.target.value})}
            placeholder="e.g. 28-foot covered Willie sled"/>
        </label>
        <label>Boat style *
          <select value={boat.type} onChange={e=>changeVessel(boat.id,{type:e.target.value})}>
            {VESSEL_TYPES.map(type=><option key={type}>{type}</option>)}
          </select>
        </label>
        <label>Maximum anglers on this boat (optional)
          <input type="number" min={1} max={30} value={boat.maxAnglers??''}
            onChange={e=>changeVessel(boat.id,{maxAnglers:e.target.value===''?null:Number(e.target.value)})}/>
        </label>
        <div className="captain-fishery-chipgrid">
          <label><input type="checkbox" checked={boat.covered}
            onChange={e=>changeVessel(boat.id,{covered:e.target.checked})}/><span>Covered boat</span></label>
          <label><input type="checkbox" checked={boat.heated}
            onChange={e=>changeVessel(boat.id,{heated:e.target.checked})}/><span>Heated boat</span></label>
        </div>
        <strong>Fish-care services on this boat</strong>
        <div className="captain-fishery-chipgrid">
          {FISH_CARE.map(c=><label key={c}><input type="checkbox"
            checked={boat.fishCare.includes(c)} onChange={()=>toggleCare(boat,c)}/><span>{c}</span></label>)}
        </div>
        {draft.vessels.length>1&&<button type="button" className="captain-secondary"
          onClick={()=>removeVessel(boat.id)}>Remove boat</button>}
      </fieldset>)}
    </div>
    {draft.vessels.length<MAX_VESSELS&&<button type="button" className="captain-secondary"
      onClick={addVessel}>+ Add another boat ({draft.vessels.length}/{MAX_VESSELS})</button>}

    <div className="captain-fishery-offerings" aria-label="Seasonal trips">
      <h3>2. Your seasonal fishing trips</h3>
      {draft.offerings.map((offer,index)=><fieldset key={offer.id} className="captain-fishery-item">
        <legend>Seasonal trip {index+1}</legend>
        <label>Trip name *
          <input type="text" maxLength={80} value={offer.title}
            onChange={e=>changeOffering(offer.id,{title:e.target.value})}
            placeholder="e.g. Buoy 10 Fall Chinook & Coho"/>
        </label>
        <label>Waterway / fishery *
          <input type="text" list={suggestionsId} maxLength={80} value={offer.waterway}
            onChange={e=>changeOffering(offer.id,{waterway:e.target.value})}
            placeholder="e.g. Buoy 10 / Columbia Estuary"/>
        </label>
        <label>General launch area (optional, no private address)
          <input type="text" maxLength={80} value={offer.launchArea}
            onChange={e=>changeOffering(offer.id,{launchArea:e.target.value})}
            placeholder="e.g. Hammond, Astoria, or Ilwaco"/>
        </label>
        <div className="captain-fishery-choices"><strong>Species offered on this trip *</strong>
          <div className="captain-fishery-chipgrid">
            {TARGET_SPECIES.map(species=><label key={species}>
              <input type="checkbox" checked={offer.species.includes(species)}
                onChange={()=>toggleSpecies(offer,species)}/><span>{species}</span>
            </label>)}
          </div>
        </div>
        <div className="captain-fishery-choices"><strong>Months you typically offer this trip *</strong>
          <div className="captain-monthgrid">
            {MONTHS.map((month,i)=><button type="button" key={month}
              aria-label={month+' offered for seasonal trip '+(index+1)}
              aria-pressed={offer.months.includes(i+1)}
              className={offer.months.includes(i+1)?'active':''}
              onClick={()=>toggleMonth(offer,i+1)}>{month}</button>)}
          </div>
        </div>
        <label>Which boat runs this trip? *
          <select value={offer.vesselId}
            onChange={e=>changeOffering(offer.id,{vesselId:e.target.value})}>
            {draft.vessels.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
        <label>Booking style for this trip
          <select value={offer.bookingStyle} onChange={e=>changeOffering(offer.id,{
            bookingStyle:e.target.value as CaptainFishery['bookingStyle']})}>
            {BOOKING_STYLES.map(b=><option key={b} value={b}>{bookingLabels[b]}</option>)}
          </select>
        </label>
        <label>Typical trip duration
          <select value={offer.duration} onChange={e=>changeOffering(offer.id,{
            duration:e.target.value as CaptainFishery['duration']})}>
            {TRIP_DURATIONS.map(t=><option key={t} value={t}>{durationLabels[t]}</option>)}
          </select>
        </label>
        {draft.offerings.length>1&&<button type="button" className="captain-secondary"
          onClick={()=>removeOffering(offer.id)}>Remove trip</button>}
      </fieldset>)}
    </div>
    {draft.offerings.length<MAX_OFFERINGS&&<button type="button" className="captain-secondary"
      onClick={addOffering}>+ Add another seasonal trip ({draft.offerings.length}/{MAX_OFFERINGS})</button>}

    <div className="captain-fishery-actions">
      <button type="button" className="captain-secondary" onClick={clearDraft}>Clear draft</button>
      <button type="button" disabled={!submitEnabled||busy||submitted||!ready||!client||!signedIn||!approvedOwner||!guideUuid||errors.length>0}
        onClick={()=>void submit()}>{busy?'Submitting…':'Submit details for manual review'}</button>
    </div>
    {errors.length>0&&<p className="muted" role="status">{errors[0]}</p>}
    {message&&<p role="status" className="review-status">{message}</p>}
    <p className="muted" role="status">
      {submitted?'Proposal pending manual review. No public changes.':
       approvedOwner?'Approved owner detected. Submission still requires the separately approved backend intake service.':
       !client?'Profile intake service is not configured. Draft preview only.':
       !signedIn?'Sign in and request profile ownership above to enable submission.':
       'Your ownership claim must be approved before submission. Draft preview only.'}
    </p>
    <p className="muted">Operating months reflect what you normally offer, not whether regulations permit fishing on a given date. Confirm openings and availability independently.</p>
  </section>;
}
