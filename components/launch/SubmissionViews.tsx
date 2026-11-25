'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {type ClaimDraft, REVIEW_DIMENSIONS, type ReviewDimension, type ReviewDimensions, type ReviewRatingPatch, type RelationshipDisclosure, type ReviewDraft, type SubmissionReceipt, isSubmissionReceipt, validateClaimDraft, validateReviewDraft} from './submission-model';
import {TripDetails,TripFields} from './TripDetails';
import {FISH_LANDED_FIELD,REVIEW_TRIP_RATINGS,TRIP_TIMING_FIELDS,decodeTripResponses,encodeTripResponses,isTripHighlight} from './trip-responses';
import {clearReviewDraft,readReviewDraft,reviewDraftStorageKey,saveReviewDraft,type ReviewDraftScope,type SavedReviewDraft} from './review-draft-storage';

type SubmitReview = (draft: ReviewDraft) => Promise<SubmissionReceipt>;
type SubmitClaim = (draft: ClaimDraft) => Promise<SubmissionReceipt>;

export function SubmissionStatus({kind, receipt}: {kind: 'review' | 'claim' | 'revision'; receipt: SubmissionReceipt}) {
  if (!isSubmissionReceipt(receipt,kind)) return <p role="status">Submission status is temporarily unavailable.</p>;
  const label = kind === 'review' ? 'Review' : kind === 'revision' ? 'Review edit' : 'Claim request';
  const next = kind === 'revision'
    ? receipt.status === 'approved' ? 'Your changes have been published.'
      : receipt.status === 'pending' ? 'Your changes are pending review. Your current published review is still visible.'
      : 'Your changes were not published.'
    : receipt.status === 'pending'
    ? kind === 'review' ? 'Your review is pending. It is not on the public page.' : 'Your claim request is pending review.'
    : receipt.status === 'published' ? 'Your review has been published.'
    : receipt.status === 'removed' ? 'Your review is no longer published.'
    : receipt.status === 'approved' ? 'Your claim has been approved.'
    : 'It was not approved.';
  return <div role="status"><strong>{label}: {receipt.status}</strong><p>{next}</p>{receipt.message && <p>{receipt.message}</p>}</div>;
}

type ReviewRetryStatus = 'ready' | 'closed' | 'submitted';

function initialReviewForm(initial?: ReviewDraft): SavedReviewDraft {
  const ratings:ReviewDimensions={};
  for(const {key} of REVIEW_DIMENSIONS) {
    const score=initial?.ratings?.[key];
    if(score!=null)ratings[key]=score;
  }
  return {
    quality:initial?String(initial.quality):'', intensity:initial?.intensity==null?'':String(initial.intensity),
    wouldBookAgain:initial?.wouldBookAgain===true?'yes':initial?.wouldBookAgain===false?'no':'',
    ratings, body:initial?.body??'', tripMonth:initial?.tripMonth??'',
    tripDraft:decodeTripResponses(initial?.tripResponses), relationship:initial?.relationship??'',
    firsthand:false, needsCheck:false,
  };
}

export function ReviewSubmission({onSubmit, onCheckBeforeRetry, allowTripResponses=false, writeAvailable=true, initial, mode='review', draftScope}: {
  onSubmit: SubmitReview;
  onCheckBeforeRetry?: () => Promise<ReviewRetryStatus>;
  allowTripResponses?: boolean;
  writeAvailable?: boolean;
  initial?: ReviewDraft;
  mode?: 'review' | 'revision';
  draftScope?: ReviewDraftScope;
}) {
  const prefix = useId();
  const scopeKey = draftScope ? reviewDraftStorageKey(draftScope,mode) ?? 'invalid-scope' : 'unscoped';
  const [values, setValues] = useState<SavedReviewDraft>(()=>initialReviewForm(initial));
  const {quality,intensity,wouldBookAgain,ratings,body,tripMonth,tripDraft,relationship,firsthand,needsCheck}=values;
  const [readyScope, setReadyScope] = useState<string|null>(draftScope?null:scopeKey);
  const [draftStatus, setDraftStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [retryMessage, setRetryMessage] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const submitting = useRef(false);
  const latest = useRef({scopeKey,values,dirty:false,active:!draftScope});
  const ready = readyScope===scopeKey;

  useEffect(()=>{
    const saved=draftScope?readReviewDraft(draftScope,mode):{status:'empty' as const};
    const restored=saved.status==='restored'?saved.draft:initialReviewForm(initial);
    latest.current={scopeKey,values:restored,dirty:false,active:true};
    setValues(restored);
    setReceipt(null);
    setError(restored.needsCheck?'We couldn’t confirm your last submission. Check its status before trying again.':'');
    setRetryMessage('');
    setDraftStatus(saved.status==='restored'?'Draft saved on this device.':saved.status==='unavailable'?'This browser cannot save your draft. Keep this page open to avoid losing it.':'');
    setReadyScope(scopeKey);
    function flush(){
      if(draftScope&&latest.current.active&&latest.current.scopeKey===scopeKey&&latest.current.dirty){
        const saved=saveReviewDraft(draftScope,mode,latest.current.values);
        latest.current.dirty=!saved;
        setDraftStatus(saved?'Draft saved on this device.':'This browser cannot save your draft. Keep this page open to avoid losing it.');
      }
    }
    function background(){if(document.visibilityState==='hidden')flush()}
    window.addEventListener('pagehide',flush);
    document.addEventListener('visibilitychange',background);
    return ()=>{
      window.removeEventListener('pagehide',flush);
      document.removeEventListener('visibilitychange',background);
      // Never save during cleanup: sign-out, discard, or a receipt may have removed it.
      if(latest.current.scopeKey===scopeKey)latest.current.active=false;
    };
  },[scopeKey]);

  function change(patch:Partial<SavedReviewDraft>){
    if(!latest.current.active||latest.current.scopeKey!==scopeKey)return;
    const next={...latest.current.values,...patch};
    latest.current.values=next;
    latest.current.dirty=true;
    setValues(next);
    if(draftScope){
      // Write the event's next value synchronously, before the browser can suspend this page.
      const saved=saveReviewDraft(draftScope,mode,next);
      latest.current.dirty=!saved;
      setDraftStatus(saved?'Draft saved on this device.':'This browser cannot save your draft. Keep this page open to avoid losing it.');
    }
  }

  function discard(){
    if(submitting.current)return;
    const cleared=!draftScope||clearReviewDraft(draftScope,mode);
    const reset=initialReviewForm(initial);
    latest.current={scopeKey,values:reset,dirty:false,active:true};
    setValues(reset);setError('');setRetryMessage('');
    setDraftStatus(cleared?'Draft discarded.':'Your form was reset, but this browser could not remove the saved draft.');
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !ready || !writeAvailable || needsCheck) return;
    if (!tripDraft) {setError('Your saved trip details cannot be edited here. No changes were submitted.');return;}
    const tripAnswers={...tripDraft};
    if(mode==='revision') {
      // Older clients omit retained fields. Send an explicit clear when this editor removes one.
      for(const key of Object.keys(initial?.tripResponses?.answers??{})) {
        const timingField=TRIP_TIMING_FIELDS.find(field=>field.key===key);
        if(Object.hasOwn(tripAnswers,key) || (timingField?.legacyMinutesKey && tripAnswers[timingField.legacyMinutesKey])) continue;
        if(isTripHighlight(key) || timingField) tripAnswers[key]='na';
      }
    }
    if (!allowTripResponses && Object.keys(tripAnswers).length) {setError('Trip details are no longer available. Refresh before submitting.');return;}
    const details=encodeTripResponses(tripAnswers);
    if(details.error) {setError(details.error);return;}
    const patch:ReviewRatingPatch={};
    for(const {key} of REVIEW_DIMENSIONS) {
      const before=initial?.ratings?.[key]??null;
      const after=ratings[key]??null;
      if(before!==after)patch[key]=after;
    }
    const bookingAnswer=wouldBookAgain===''?null:wouldBookAgain==='yes';
    // The versioned client omits a null booking patch on revisions.
    const bookingPatch=mode==='revision'&&bookingAnswer===initial?.wouldBookAgain?null:bookingAnswer;
    const draft:ReviewDraft = {
      quality:Number(quality), intensity:intensity===''?null:Number(intensity),
      wouldBookAgain:bookingPatch,
      body:body.trim(), firsthand, tripMonth:tripMonth||null, relationship:relationship||null,
      ...(allowTripResponses&&details.value?{tripResponses:details.value}:{}),
      ratingVersion:1, ...(Object.keys(patch).length?{ratings:patch}:{}),
    };
    const problem = validateReviewDraft(draft,mode);
    if (problem) { setError(problem); return; }
    submitting.current = true; setBusy(true); setError(''); setRetryMessage('');
    // An interrupted request may have reached the server even if its receipt never arrived.
    if(onCheckBeforeRetry)change({needsCheck:true});
    try {
      const result = await onSubmit(draft);
      if (!isSubmissionReceipt(result,mode) ||
          !(mode==='revision'?['pending','approved']:['pending','published']).includes(result.status)) throw new Error('Invalid receipt');
      latest.current.dirty=false;latest.current.active=false;
      if(draftScope)clearReviewDraft(draftScope,mode);
      setReceipt(result);
    }
    catch {
      if (onCheckBeforeRetry) {
        setError('We couldn’t confirm your submission. Your draft is still here. Check before trying again.');
      } else {
        setError('We could not confirm your submission. Check your review status before trying again.');
      }
    }
    finally { submitting.current = false; setBusy(false); }
  }

  async function checkBeforeRetry() {
    if (submitting.current || !onCheckBeforeRetry) return;
    submitting.current = true;
    setChecking(true);
    setError('');
    setRetryMessage('');
    try {
      const status = await onCheckBeforeRetry();
      if (status === 'ready') {
        change({needsCheck:false});
        setRetryMessage('No review was found. You can submit your draft again.');
      } else if (status === 'closed') {
        setRetryMessage('Reviews are still unavailable. Your draft is still here.');
      } else if (status === 'submitted') {
        latest.current.dirty=false;latest.current.active=false;
        if(draftScope)clearReviewDraft(draftScope,mode);
        setRetryMessage('Your submission was found. Check your submissions for its status.');
      }
    } catch {
      setError('We couldn’t check your review. Your draft is still here.');
    } finally {
      submitting.current = false;
      setChecking(false);
    }
  }
  if(!ready)return <p role="status">Restoring your review draft…</p>;
  if (receipt) return <SubmissionStatus kind={mode} receipt={receipt}/>;
  return <form onSubmit={submit} className="card launch-form">
    <h3>{mode==='revision'?'Edit your review':'Share your trip experience'}</h3>
    {mode==='revision'&&<p>Update your firsthand experience. You’ll see whether your changes are published or pending after you save.</p>}
    <label htmlFor={`${prefix}-quality`}>Overall quality</label>
    <select id={`${prefix}-quality`} value={quality} onChange={event=>change({quality:event.target.value})} required>
      <option value="">Choose a rating</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value} / 5</option>)}
    </select>
    <fieldset className="review-book-again">
      <legend>Would you book again?</legend>
      <div className="review-book-again-options">
        {['yes','no'].map(value=><label key={value}>
          <input type="radio" name={`${prefix}-again`} value={value} checked={wouldBookAgain===value}
            required={mode==='review'} onChange={event=>change({wouldBookAgain:event.target.value})}/>
          {value==='yes'?'Yes':'No'}
        </label>)}
      </div>
    </fieldset>
    <ReviewDimensionFields ratings={ratings} onChange={(key,value)=>{
      const next={...latest.current.values.ratings};
      if(value==='')delete next[key];else next[key]=Number(value);
      change({ratings:next});
    }}>
      {allowTripResponses&&tripDraft&&<TripFields fields={REVIEW_TRIP_RATINGS} draft={tripDraft} onChange={tripDraft=>change({tripDraft})}/>}
    </ReviewDimensionFields>
    {allowTripResponses&&tripDraft&&<TripFields fields={catchFields} draft={tripDraft} onChange={tripDraft=>change({tripDraft})}/>}
    <label htmlFor={`${prefix}-relationship`}>Your relationship to this guide or business</label>
    <select id={`${prefix}-relationship`} value={relationship} onChange={event=>change({relationship:event.target.value as RelationshipDisclosure | ''})} required>
      <option value="">Choose an answer</option><option value="none">None</option><option value="personal">Personal</option><option value="financial">Financial</option><option value="other">Other</option>
    </select>
    {allowTripResponses && tripDraft && <TripDetails draft={tripDraft} onChange={tripDraft=>change({tripDraft})}>
      <label htmlFor={`${prefix}-month`}>Trip month (optional)</label>
      <input type="month" id={`${prefix}-month`} value={tripMonth} onChange={event=>change({tripMonth:event.target.value})} />
      <label htmlFor={`${prefix}-intensity`}>Trip intensity (optional)</label>
      <select id={`${prefix}-intensity`} value={intensity} onChange={event=>change({intensity:event.target.value})}><option value="">Not answered</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value} / 5</option>)}</select>
    </TripDetails>}
    <label htmlFor={`${prefix}-body`}>Your experience</label>
    <p>Write about a trip you personally took. Anglers can flag reviews for moderator attention. Signing in confirms your account, not that a trip occurred.</p>
    <p id={`${prefix}-body-help`}>Write up to 3,000 characters.</p>
    <textarea id={`${prefix}-body`} aria-describedby={`${prefix}-body-help`} value={body} onChange={event=>change({body:event.target.value})} minLength={1} maxLength={3000} required />
    <label><input type="checkbox" checked={firsthand} onChange={event=>change({firsthand:event.target.checked})} required/> I personally took this trip.</label>
    {draftStatus&&<p role="status" className="muted">{draftStatus}</p>}
    {error && <p role="alert">{error}</p>}
    {retryMessage && <p role="status">{retryMessage}</p>}
    {!writeAvailable && !error && !retryMessage && <p role="status">Review submissions are temporarily unavailable. Your draft remains here while you check again.</p>}
    {onCheckBeforeRetry && (needsCheck || !writeAvailable) && <button type="button" disabled={busy || checking} onClick={()=>void checkBeforeRetry()}>{checking ? 'Checking…' : 'Check before retrying'}</button>}
    <button type="submit" disabled={busy || checking || needsCheck || !writeAvailable}>{busy ? 'Submitting…' : mode==='revision' ? 'Save changes' : 'Submit review'}</button>
    <button type="button" disabled={busy || checking} onClick={discard}>Discard draft</button>
  </form>;
}

const catchFields=[FISH_LANDED_FIELD];

function ReviewDimensionFields({ratings,onChange,children}:{
  ratings:ReviewDimensions;
  onChange:(key:ReviewDimension,value:string)=>void;
  children?:React.ReactNode;
}) {
  const prefix=useId();
  function renderScore({key,label}:typeof REVIEW_DIMENSIONS[number]) {
    const id=`${prefix}-${key}`;
    return <div key={key}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={ratings[key]??''} onChange={event=>onChange(key,event.target.value)}>
        <option value="">Not rated</option>
        {[1,2,3,4,5].map(value=><option key={value} value={value}>{value} / 5</option>)}
      </select>
    </div>;
  }

  return <fieldset className="review-dimensions">
    <legend>Rate individual aspects (optional)</legend>
    <p>1 is poor and 5 is excellent. Finding fish is your assessment of how well the guide put you on fish.</p>
    <div className="review-dimension-fields">
      {REVIEW_DIMENSIONS.filter(field=>field.key==='safety').map(renderScore)}
      {children}
    </div>
    <details>
      <summary>More ratings (optional)</summary>
      <div className="review-dimension-fields">
        {REVIEW_DIMENSIONS.filter(field=>field.key!=='safety').map(renderScore)}
      </div>
    </details>
  </fieldset>;
}

export function ClaimSubmission({onSubmit}: {onSubmit: SubmitClaim}) {
  const prefix = useId();
  const [claimantName, setClaimantName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const submitting = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const draft = {claimantName:claimantName.trim(),businessName:businessName.trim(),evidence:statement.trim()};
    const problem = validateClaimDraft(draft);
    if (problem) { setError(problem); return; }
    submitting.current = true; setBusy(true); setError('');
    try { const result = await onSubmit(draft); if (!isSubmissionReceipt(result,'claim')) throw new Error('Invalid receipt'); setReceipt(result); }
    catch { setError('We could not confirm your submission. Check your claim status before trying again.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (receipt) return <SubmissionStatus kind="claim" receipt={receipt}/>;
  return <form onSubmit={submit} className="card launch-form">
    <h3>Request this listing</h3>
    <p>Tell us how you are connected to this guide or business and give a public way to check it. A registration number or matching name alone is not proof. Do not upload an identity document. A claim does not give control over angler reviews.</p>
    <label htmlFor={`${prefix}-claimant`}>Your name</label>
    <input id={`${prefix}-claimant`} autoComplete="name" value={claimantName} onChange={event=>setClaimantName(event.target.value)} minLength={2} maxLength={120} required />
    <label htmlFor={`${prefix}-business`}>Business name, if applicable</label>
    <input id={`${prefix}-business`} value={businessName} onChange={event=>setBusinessName(event.target.value)} maxLength={160} />
    <label htmlFor={`${prefix}-claim`}>Your connection to this listing</label>
    <p id={`${prefix}-claim-help`}>Include a business site or another source a moderator can check. Write 20 to 1,200 characters. Do not include passwords, identity documents, or payment details.</p>
    <textarea id={`${prefix}-claim`} aria-describedby={`${prefix}-claim-help`} value={statement} onChange={event=>setStatement(event.target.value)} minLength={20} maxLength={1200} required />
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit claim request'}</button>
  </form>;
}
