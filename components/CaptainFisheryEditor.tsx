'use client';
import {useEffect,useId,useState} from 'react';
import {client} from './AuthPanel';
import {
  BOOKING_STYLES, EMPTY_CAPTAIN_DRAFT, EMPTY_CAPTAIN_FISHERY, FISH_CARE,
  MAX_OFFERINGS, TARGET_SPECIES, VESSEL_TYPES, WATERWAY_SUGGESTIONS,
  createCaptainProposalInsert, validateCaptainFisheryDraft,
  type CaptainFisheryDraft, type CaptainFishery,
} from '@/lib/captain-fisheries';

const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const storageKey=(id:string)=>'rmgpnw:captain-fisheries-draft:v1:'+id;
const validStoredDraft=(input:unknown):input is CaptainFisheryDraft=>{
  if(!input||typeof input!=='object')return false;
  const value=input as Partial<CaptainFisheryDraft>;
  // Reuse stricter, fail-closed field validation before showing an old draft.
  return validateCaptainFisheryDraft(value as CaptainFisheryDraft).length===0;
};

export default function CaptainFisheryEditor({listing,name}:{listing:string;name:string}){
  const suggestionsId=useId();
  const [draft,setDraft]=useState<CaptainFisheryDraft>(()=>({
    ...EMPTY_CAPTAIN_DRAFT,
    offerings:[{...EMPTY_CAPTAIN_FISHERY,species:[],months:[]}],
    vessel:{...EMPTY_CAPTAIN_DRAFT.vessel,fishCare:[]},
  }));
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
        if(validStoredDraft(candidate))setDraft(candidate);
      }
    }catch { /* Browsers can deny storage; editor still works for this visit. */ }
    setReady(true);
  },[listing]);
  useEffect(()=>{
    if(!ready)return;
    try{sessionStorage.setItem(storageKey(listing),JSON.stringify(draft))}
    catch{ /* A draft stays in memory if browser storage is blocked. */ }
  },[draft,listing,ready]);

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
      const {data:guide,error:guideError}=await client!.from('guides').select('id').eq('slug',slug).maybeSingle();
      if(!active||guideError||!guide)return;
      const {data:claims,error}=await client!.from('guide_claims')
        .select('id').eq('guide_id',guide.id).eq('claimant_id',auth.user.id).eq('status','approved').limit(1);
      if(!active||error||!claims?.length)return;
      setGuideUuid(guide.id);
      setApprovedOwner(true);
    };
    void check();
    const {data:{subscription}}=client.auth.onAuthStateChange(()=>{
      // Defer DB/auth queries outside auth-event callback.
      void Promise.resolve().then(check);
    });
    return ()=>{active=false;subscription.unsubscribe()};
  },[listing]);

  function patchOffer(index:number,patch:Partial<CaptainFishery>){
    setDraft(d=>({...d,offerings:d.offerings.map((item,i)=>i===index?{...item,...patch}:item)}));
    setMessage('');
  }
  function toggleSpecies(index:number,species:string){
    const offer=draft.offerings[index];
    patchOffer(index,{species:offer.species.includes(species)?offer.species.filter(s=>s!==species):[...offer.species,species]});
  }
  function toggleMonth(index:number,month:number){
    const offer=draft.offerings[index];
    patchOffer(index,{months:offer.months.includes(month)?offer.months.filter(m=>m!==month):[...offer.months,month]});
  }
  function toggleFishCare(name:string){
    setDraft(d=>({...d,vessel:{...d.vessel,fishCare:
      d.vessel.fishCare.includes(name)?d.vessel.fishCare.filter(s=>s!==name):[...d.vessel.fishCare,name]}}));
    setMessage('');
  }
  function clearDraft(){
    try{sessionStorage.removeItem(storageKey(listing))}catch{}
    setDraft({...EMPTY_CAPTAIN_DRAFT,
      offerings:[{...EMPTY_CAPTAIN_FISHERY,species:[],months:[]}],
      vessel:{...EMPTY_CAPTAIN_DRAFT.vessel,fishCare:[]},
    });
    setMessage('Draft cleared from this tab.');
    setSubmitted(false);
  }
  async function submit(){
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
          'Could not submit for moderation. No public profile was changed. '+error.message);
        return;
      }
      setSubmitted(true);
      setMessage('Your fishery details were sent for manual review. They are not public or independently verified.');
      try{sessionStorage.removeItem(storageKey(listing))}catch{}
    }catch{
      setMessage('Submission failed. No public profile was changed. Your draft remains in this browser tab.');
    }finally{setBusy(false)}
  }

  const errors=validateCaptainFisheryDraft(draft);
  return <section className="section card captain-fishery-editor" aria-labelledby="captain-fishery-title">
    <p className="eyebrow">CAPTAIN-PROVIDED INFORMATION · FREE FACTUAL UPDATES</p>
    <h2 id="captain-fishery-title">Where do you actually guide?</h2>
    <p>Help anglers find {name} by fishing water, species, month and boat setup. These are <strong>captain-submitted claims</strong>, not government license checks. Review rankings never depend on completing this form or buying anything.</p>
    <p className="muted">You can plan your listing here before verification. The draft stays only in this browser tab. Only an independently approved profile owner can submit proposed details, and nothing appears publicly until manual review.</p>
    <datalist id={suggestionsId}>{WATERWAY_SUGGESTIONS.map(name=><option key={name} value={name}/>)}</datalist>

    <div className="captain-fishery-offerings">
      {draft.offerings.map((offer,index)=><fieldset className="captain-fishery-item" key={index}>
        <legend>Fishery {index+1}</legend>
        <label>Waterway / fishery *
          <input type="text" list={suggestionsId} maxLength={80} value={offer.waterway}
            onChange={e=>patchOffer(index,{waterway:e.target.value})}
            placeholder="e.g., Buoy 10 / Columbia Estuary"/>
        </label>
        <label>General launch area (optional, no private address)
          <input type="text" maxLength={80} value={offer.launchArea}
            onChange={e=>patchOffer(index,{launchArea:e.target.value})}
            placeholder="e.g., Astoria, Hammond, or Ilwaco"/>
        </label>
        <div className="captain-fishery-choices"><strong>Species you offer trips for *</strong>
          <div className="captain-fishery-chipgrid">
            {TARGET_SPECIES.map(species=><label key={species}>
              <input type="checkbox" checked={offer.species.includes(species)}
                onChange={()=>toggleSpecies(index,species)}/><span>{species}</span>
            </label>)}
          </div>
        </div>
        <div className="captain-fishery-choices"><strong>Months you usually offer this fishery *</strong>
          <div className="captain-monthgrid">
            {months.map((month,i)=><button type="button" key={month}
              aria-label={month+' offered for fishery '+(index+1)}
              aria-pressed={offer.months.includes(i+1)}
              className={offer.months.includes(i+1)?'active':''}
              onClick={()=>toggleMonth(index,i+1)}>{month}</button>)}
          </div>
        </div>
        {draft.offerings.length>1&&<button type="button" className="captain-secondary"
          onClick={()=>setDraft(d=>({...d,offerings:d.offerings.filter((_,i)=>i!==index)}))}>
            Remove this fishery
          </button>}
      </fieldset>)}
    </div>
    {draft.offerings.length<MAX_OFFERINGS&&<button type="button" className="captain-secondary"
      onClick={()=>setDraft(d=>({...d,offerings:[...d.offerings,{...EMPTY_CAPTAIN_FISHERY,species:[],months:[]}]}))}>
      + Add another fishery
    </button>}
    <fieldset className="captain-fishery-item">
      <legend>Boat and group details</legend>
      <label>Boat style
        <select value={draft.vessel.type} onChange={e=>setDraft(d=>({...d,vessel:{...d.vessel,type:e.target.value}}))}>
          {VESSEL_TYPES.map(value=><option key={value}>{value}</option>)}
        </select>
      </label>
      <label>Maximum anglers per trip (optional)
        <input type="number" min={1} max={30} value={draft.vessel.maxAnglers??''}
          onChange={e=>setDraft(d=>({...d,vessel:{...d.vessel,maxAnglers:e.target.value===''?null:Number(e.target.value)}}))}/>
      </label>
      <div className="captain-fishery-chipgrid">
        <label><input type="checkbox" checked={draft.vessel.covered}
          onChange={e=>setDraft(d=>({...d,vessel:{...d.vessel,covered:e.target.checked}}))}/><span>Covered boat</span></label>
        <label><input type="checkbox" checked={draft.vessel.heated}
          onChange={e=>setDraft(d=>({...d,vessel:{...d.vessel,heated:e.target.checked}}))}/><span>Heated boat</span></label>
      </div>
      <strong>Fish care services (only select what you actually offer)</strong>
      <div className="captain-fishery-chipgrid">
        {FISH_CARE.map(v=><label key={v}><input type="checkbox" checked={draft.vessel.fishCare.includes(v)}
          onChange={()=>toggleFishCare(v)}/><span>{v}</span></label>)}
      </div>
      <label>How can anglers book?
        <select value={draft.bookingStyle}
          onChange={e=>setDraft(d=>({...d,bookingStyle:e.target.value as CaptainFisheryDraft['bookingStyle']}))}>
          {BOOKING_STYLES.map(v=><option value={v} key={v}>{
            {call_to_confirm:'Contact me to confirm',per_seat:'Individual seats',private_boat:'Private boat',both:'Seats or private boat'}[v]
          }</option>)}
        </select>
      </label>
    </fieldset>
    <div className="captain-fishery-actions">
      <button type="button" className="captain-secondary" onClick={clearDraft}>Clear draft</button>
      <button type="button" disabled={busy||submitted||!ready||!client||!signedIn||!approvedOwner||!guideUuid||errors.length>0}
        onClick={()=>void submit()}>{busy?'Submitting…':'Submit details for review'}</button>
    </div>
    {errors.length>0&&<p className="muted" role="status">{errors[0]}</p>}
    {message&&<p role="status" className="review-status">{message}</p>}
    <p className="muted" role="status">
      {submitted?'Proposal pending manual review. No public changes.':
       approvedOwner?'Approved owner detected. Submission requires the separately approved database intake service.':
       !client?'Profile intake service is not configured. Draft preview only.':
       !signedIn?'Sign in and request ownership using the form above to enable submission.':
       'Your ownership must be independently approved before submission. Draft preview only.'}
    </p>
  </section>;
}
