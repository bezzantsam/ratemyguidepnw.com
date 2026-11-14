'use client';
import {useEffect,useState} from 'react';
import AuthPanel,{client} from './AuthPanel';
import {
  createPendingReviewInsert, EMPTY_REVIEW_DRAFT, REVIEW_MAX_CHARS, REVIEW_MIN_CHARS,
  reviewPrivacyWarning, reviewStepError, type ReviewDraft, type ReviewRatingKey
} from '@/lib/review-submission';

type Step = 0|1|2|3;
const coreRatings: {key: ReviewRatingKey; label: string; hint: string}[] = [
  {key:'quality',label:'Overall experience',hint:'The complete experience, not just the catch'},
  {key:'communication',label:'Communication and expectations',hint:'Booking details and honesty about conditions'},
  {key:'safety',label:'Safety',hint:'How the captain handled safety on the water'},
  {key:'effort',label:'Effort and adaptability',hint:'Preparation and how the captain responded to conditions'},
];
const extraRatings: {key: ReviewRatingKey; label: string}[] = [
  {key:'equipment',label:'Boat and equipment'},
  {key:'professionalism',label:'Professionalism'},
  {key:'knowledge',label:'Fishing knowledge'},
  {key:'value_rating',label:'Value for money'},
];
const draftStorage = (slug:string) => 'rmgpnw:review-draft:v1:' + slug;

export default function ReviewComposer({guideId, slug}:{guideId:string;slug:string}) {
  const [draft,setDraft]=useState<ReviewDraft>(EMPTY_REVIEW_DRAFT);
  const [step,setStep]=useState<Step>(0);
  const [signedIn,setSignedIn]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [ready,setReady]=useState(false);
  const latestMonth=new Date().toISOString().slice(0,7);

  useEffect(()=>{
    try {
      const saved=window.sessionStorage.getItem(draftStorage(slug));
      if(saved) {
        const value=JSON.parse(saved) as Partial<ReviewDraft>;
        // Storage is untrusted; accept only the expected scalar shapes.
        if(typeof value.month==='string' && typeof value.body==='string' &&
           typeof value.context==='string' && (value.wouldBook==='yes'||value.wouldBook==='no'||value.wouldBook==='') &&
           typeof value.attested==='boolean' && value.ratings && typeof value.ratings==='object' &&
           ['caught','limited','slow','not_disclosed'].includes(value.outcome||'')) {
          const ratings:ReviewDraft['ratings']={};
          for (const item of [...coreRatings,...extraRatings]) {
            const candidate=value.ratings[item.key];
            if(typeof candidate==='number' && Number.isInteger(candidate) && candidate>=1 && candidate<=5) {
              ratings[item.key]=candidate;
            }
          }
          setDraft({month:value.month.slice(0,7),body:value.body.slice(0,REVIEW_MAX_CHARS),
            context:value.context.slice(0,140),wouldBook:value.wouldBook,
            outcome:value.outcome as ReviewDraft['outcome'],attested:value.attested,ratings});
          setStep(3);
        }
      }
    } catch { /* A blocked or corrupt session store never blocks the form. */ }
    setReady(true);
  },[slug]);

  useEffect(()=>{
    if(!client) return;
    let active=true;
    void client.auth.getUser().then(({data})=>{if(active)setSignedIn(!!data.user)});
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
      if(active)setSignedIn(!!session?.user);
    });
    return ()=>{active=false;subscription.unsubscribe()};
  },[]);

  function change(patch:Partial<ReviewDraft>) {
    setDraft(old=>({...old,...patch}));
    setMessage('');
  }
  function setRating(key: ReviewRatingKey, value: number|null) {
    setDraft(old=>{
      const ratings={...old.ratings};
      if(value===null) delete ratings[key];
      else ratings[key]=value;
      return {...old,ratings};
    });
    setMessage('');
  }
  function clearDraft(){
    try{window.sessionStorage.removeItem(draftStorage(slug))}catch{}
    setDraft({...EMPTY_REVIEW_DRAFT,ratings:{}});
    setStep(0);
    setMessage('Your draft was cleared from this tab.');
  }
  function advance(){
    if(step===3)return;
    const error=reviewStepError(step,draft,latestMonth);
    if(error){setMessage(error);return}
    if(step===2){
      // Needed only to survive an OAuth redirect. Session-only and user-removable.
      try{window.sessionStorage.setItem(draftStorage(slug),JSON.stringify(draft))}
      catch{setMessage('This browser cannot temporarily save the draft. Signing in may clear it.')}
    }
    setStep((step+1) as Step);
  }
  async function submit(){
    if(!client||!guideId){setMessage('Review submissions are not configured for this guide yet.');return}
    const error=reviewStepError(0,draft,latestMonth)||reviewStepError(1,draft,latestMonth)||
      reviewStepError(2,draft,latestMonth);
    if(error){setMessage(error);return}
    setBusy(true);
    try{
      const {data,error:authError}=await client.auth.getUser();
      if(authError||!data.user){setMessage('Please sign in before submitting.');return}
      const {error:writeError}=await client.from('reviews').insert(
        createPendingReviewInsert(draft,guideId,data.user.id));
      if(writeError){setMessage('Could not submit your review. No review was published; your draft is still available.');return}
      try{window.sessionStorage.removeItem(draftStorage(slug))}catch{}
      setDraft({...EMPTY_REVIEW_DRAFT,ratings:{}});
      setStep(0);
      setMessage('Review sent to the moderation queue. It is not publicly visible or marked as a verified trip.');
    } catch {
      setMessage('The submission could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function ratingControl(item:{key:ReviewRatingKey;label:string;hint?:string}){
    const selected=draft.ratings[item.key];
    return <fieldset className="review-rating" key={item.key}>
      <legend>{item.label}{item.key==='quality'?' (required)':''}</legend>
      {item.hint&&<p className="muted">{item.hint}</p>}
      <div className="review-rating-options">
        {[1,2,3,4,5].map(value=><button type="button" key={value}
          aria-label={item.label+': '+value+' of 5'}
          aria-pressed={selected===value}
          className={selected===value?'selected':''}
          onClick={()=>setRating(item.key,value)}>{value} ★</button>)}
        {item.key!=='quality'&&<button type="button" className={selected===undefined?'selected':''}
          aria-pressed={selected===undefined} onClick={()=>setRating(item.key,null)}>N/A</button>}
      </div>
    </fieldset>;
  }

  return <div className="review-form card" id="write-review">
    <p className="eyebrow">FIRSTHAND ANGLER EXPERIENCES</p>
    <h3>Tell anglers what your trip was really like.</h3>
    <p className="muted">Your review can be positive, mixed or critical. All ratings follow the same moderation process. We do not currently certify completed trips.</p>
    <ol className="review-progress" aria-label="Review submission steps">
      {['Trip','Ratings','Your story','Submit'].map((label,index)=>
        <li key={label} className={step===index?'current':''}
          aria-current={step===index?'step':undefined}>{index+1}. {label}</li>)}
    </ol>
    {ready&&step===0&&<div className="review-step">
      <h4>When did you fish?</h4>
      <label>Trip month and year (required)
        <input type="month" min="2000-01" max={latestMonth} value={draft.month}
          onChange={event=>change({month:event.target.value})}/>
      </label>
      <label>Catch outcome (optional)
        <select value={draft.outcome} onChange={event=>change({outcome:event.target.value as ReviewDraft['outcome']})}>
          <option value="not_disclosed">Prefer not to say</option>
          <option value="caught">Caught fish</option>
          <option value="limited">Limited catch</option>
          <option value="slow">Slow or no fish</option>
        </select>
      </label>
      <p className="muted">Only your trip month and year are requested here. Details you write about a small boat party may still identify you to the captain.</p>
    </div>}
    {ready&&step===1&&<div className="review-step">
      <h4>Rate what the captain controlled</h4>
      <p className="muted">No ratings are preselected. If a category doesn't apply, leave it as N/A.</p>
      {coreRatings.map(ratingControl)}
      <details><summary>More optional ratings</summary>
        {extraRatings.map(ratingControl)}
      </details>
      <p className="muted">Fish care needs its own future rating field; we won't quietly treat it as another category.</p>
    </div>}
    {ready&&step===2&&<div className="review-step">
      <h4>Tell the full story</h4>
      <label>Would you book this captain again? (required)
        <select value={draft.wouldBook} onChange={event=>change({wouldBook:event.target.value as ReviewDraft['wouldBook']})}>
          <option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option>
        </select>
      </label>
      <label>Your firsthand review (80–500 characters)
        <textarea rows={6} minLength={REVIEW_MIN_CHARS} maxLength={REVIEW_MAX_CHARS}
          value={draft.body} onChange={event=>change({body:event.target.value})}
          placeholder="What happened, how did the captain handle the conditions, and what would you tell a friend?"/>
        <span className="muted">{draft.body.trim().length}/{REVIEW_MAX_CHARS} characters</span>
      </label>
      <label>General trip context (optional; avoid identifying other anglers)
        <input maxLength={140} value={draft.context} onChange={event=>change({context:event.target.value})}
          placeholder="e.g. offshore tuna charter"/>
      </label>
      {reviewPrivacyWarning(draft.body+' '+draft.context)&&
        <p className="review-privacy-warning" role="status">Your text might identify someone. Remove phone numbers, emails, full names and uniquely identifying trip details before submitting.</p>}
      <label className="review-attestation">
        <input type="checkbox" checked={draft.attested} onChange={event=>change({attested:event.target.checked})}/>
        I confirm this describes a genuine trip that I personally booked or attended.
      </label>
    </div>}
    {ready&&step===3&&<div className="review-step">
      <h4>Review and submit privately</h4>
      <p><strong>{draft.ratings.quality}/5 overall</strong> · {draft.month} · Would book again: {draft.wouldBook==='yes'?'Yes':'No'}</p>
      <p className="review-preview">{draft.body}</p>
      <p className="muted">Your account identifier is kept for moderation, not displayed publicly. Your trip and wording may still be recognizable to people who were there. No receipt upload or independently verified-trip badge is offered yet.</p>
      <p className="muted">Your draft is temporarily saved in this browser tab for sign-in. Clear it when using a shared device.</p>
      {!signedIn?<AuthPanel/>: <p className="review-signed-in">Signed in. Ready to send your review to the moderator queue.</p>}
      {(!client||!guideId)&&<p role="status">This guide has not been connected to the review database. Submission is unavailable.</p>}
      <button type="button" disabled={!signedIn||!guideId||busy} onClick={()=>void submit()}>
        {busy?'Submitting…':'Submit review for moderation'}
      </button>
      <p className="muted">Review publication is never automatic. An account is not proof that a trip occurred.</p>
    </div>}
    {!ready&&<p role="status">Loading your review draft…</p>}
    {message&&<p role="status" className="review-status">{message}</p>}
    <div className="review-step-actions">
      {step>0&&<button type="button" className="review-secondary" onClick={()=>{setStep((step-1) as Step);setMessage('')}}>Back</button>}
      {step<3&&<button type="button" onClick={advance}>Continue</button>}
      <button type="button" className="review-secondary" onClick={clearDraft}>Clear draft</button>
    </div>
  </div>;
}
