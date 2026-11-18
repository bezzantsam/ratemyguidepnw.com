'use client';

import {useId, useRef, useState} from 'react';
import {type ClaimDraft, type RelationshipDisclosure, type ReviewDraft, type SubmissionReceipt, isSubmissionReceipt, validateClaimDraft, validateReviewDraft} from './submission-model';
import {TripDetails} from './TripDetails';
import {decodeTripResponses,encodeTripResponses,type TripDraft} from './trip-responses';

/** These views are not connected to a backend until the reviewed integration supplies one. */
type SubmitReview = (draft: ReviewDraft) => Promise<SubmissionReceipt>;
type SubmitClaim = (draft: ClaimDraft) => Promise<SubmissionReceipt>;

export function SubmissionStatus({kind, receipt}: {kind: 'review' | 'claim'; receipt: SubmissionReceipt}) {
  if (!isSubmissionReceipt(receipt,kind)) return <p role="status">Submission status is temporarily unavailable.</p>;
  const label = kind === 'review' ? 'Review' : 'Claim request';
  const next = receipt.status === 'pending'
    ? kind === 'review' ? 'Your review is pending. It is not on the public page.' : 'Your claim request is pending review.'
    : receipt.status === 'published' ? 'Your review has been published.'
    : receipt.status === 'removed' ? 'Your review is no longer published.'
    : receipt.status === 'approved' ? 'Your claim has been approved.'
    : 'It was not approved.';
  return <div role="status"><strong>{label}: {receipt.status}</strong><p>{next}</p>{receipt.message && <p>{receipt.message}</p>}</div>;
}

export function ReviewSubmission({onSubmit, allowTripMonth=false, allowTripResponses=false, initial, mode='review'}: {onSubmit: SubmitReview; allowTripMonth?:boolean;allowTripResponses?:boolean;initial?:ReviewDraft;mode?:'review'|'revision'}) {
  const prefix = useId();
  const [quality, setQuality] = useState(initial?String(initial.quality):'');
  const [intensity, setIntensity] = useState(initial?.intensity==null?'':String(initial.intensity));
  const [wouldBookAgain, setWouldBookAgain] = useState(initial?.wouldBookAgain===true?'yes':initial?.wouldBookAgain===false?'no':'');
  const [body, setBody] = useState(initial?.body??'');
  const [tripMonth, setTripMonth] = useState('');
  const [tripDraft, setTripDraft] = useState<TripDraft|null>(()=>decodeTripResponses(initial?.tripResponses));
  const [relationship, setRelationship] = useState<RelationshipDisclosure | ''>(initial?.relationship??'');
  const [firsthand, setFirsthand] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const submitting = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!allowTripMonth && tripMonth) {setError('Trip month is no longer available. Refresh before submitting.');return;}
    if (!tripDraft) {setError('Your saved trip details cannot be edited here. No changes were submitted.');return;}
    if (!allowTripResponses && Object.keys(tripDraft).length) {setError('Trip details are no longer available. Refresh before submitting.');return;}
    const details=encodeTripResponses(tripDraft);
    if(details.error) {setError(details.error);return;}
    const draft = {quality: Number(quality), intensity: intensity === '' ? null : Number(intensity), wouldBookAgain: wouldBookAgain === '' ? null : wouldBookAgain === 'yes', body: body.trim(), firsthand, tripMonth: allowTripMonth ? tripMonth || null : null, relationship:relationship || null,...(allowTripResponses&&details.value?{tripResponses:details.value}:{})};
    const problem = validateReviewDraft(draft);
    if (problem) { setError(problem); return; }
    submitting.current = true; setBusy(true); setError('');
    try { const result = await onSubmit(draft); if (!isSubmissionReceipt(result,'review') || (mode==='revision'&&result.status!=='pending')) throw new Error('Invalid receipt'); setReceipt(result); }
    catch { setError('We could not confirm your submission. Check your review status before trying again.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (receipt) return mode==='revision'?<p role="status">Your changes are pending review. Your current published review is still visible.</p>:<SubmissionStatus kind="review" receipt={receipt}/>;
  return <form onSubmit={submit} className="card">
    <h3>{mode==='revision'?'Edit your review':'Share your trip experience'}</h3>
    {mode==='revision'&&<p>Your changes will be reviewed. Your current published review stays visible while the changes are pending.</p>}
    <p>Write about a trip you personally took. State any personal or paid connection, or say that you have none. Your review is checked before publication. Signing in confirms your account, not that a trip occurred.</p>
    <label htmlFor={`${prefix}-quality`}>Overall quality</label>
    <select id={`${prefix}-quality`} value={quality} onChange={event=>setQuality(event.target.value)} required>
      <option value="">Choose a rating</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value} / 5</option>)}
    </select>
    <label htmlFor={`${prefix}-relationship`}>Your relationship to this guide or business</label>
    <select id={`${prefix}-relationship`} value={relationship} onChange={event=>setRelationship(event.target.value as RelationshipDisclosure | '')} required>
      <option value="">Choose an answer</option><option value="none">None</option><option value="personal">Personal</option><option value="financial">Financial</option><option value="other">Other</option>
    </select>
    {allowTripMonth && <details><summary>Tell us more</summary>
      <label htmlFor={`${prefix}-month`}>Trip month, if you remember it</label>
      <input type="month" id={`${prefix}-month`} value={tripMonth} onChange={event=>setTripMonth(event.target.value)} />
    </details>}
    {allowTripResponses && tripDraft && <TripDetails draft={tripDraft} onChange={setTripDraft}>
      <label htmlFor={`${prefix}-intensity`}>Trip intensity (optional)</label>
      <select id={`${prefix}-intensity`} value={intensity} onChange={event=>setIntensity(event.target.value)}><option value="">Not answered</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value} / 5</option>)}</select>
      <label htmlFor={`${prefix}-again`}>Would you book again? (optional)</label>
      <select id={`${prefix}-again`} value={wouldBookAgain} onChange={event=>setWouldBookAgain(event.target.value)}><option value="">Not answered</option><option value="yes">Yes</option><option value="no">No</option></select>
    </TripDetails>}
    <label htmlFor={`${prefix}-body`}>Your experience</label>
    <p id={`${prefix}-body-help`}>Write up to 3,000 characters.</p>
    <textarea id={`${prefix}-body`} aria-describedby={`${prefix}-body-help`} value={body} onChange={event=>setBody(event.target.value)} minLength={1} maxLength={3000} required />
    <label><input type="checkbox" checked={firsthand} onChange={event=>setFirsthand(event.target.checked)} required/> I personally took this trip.</label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit review'}</button>
  </form>;
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
  return <form onSubmit={submit} className="card">
    <h3>Request this listing</h3>
    <p>Tell us how you are connected to this guide or business and give a public way to check it. A registration number or matching name alone is not proof. Do not upload an identity document. A claim does not give control over angler reviews.</p>
    <label htmlFor={`${prefix}-claimant`}>Your name</label>
    <input id={`${prefix}-claimant`} autoComplete="name" value={claimantName} onChange={event=>setClaimantName(event.target.value)} minLength={2} maxLength={120} required />
    <label htmlFor={`${prefix}-business`}>Business name, if applicable</label>
    <input id={`${prefix}-business`} value={businessName} onChange={event=>setBusinessName(event.target.value)} maxLength={160} />
    <label htmlFor={`${prefix}-claim`}>Your connection to this listing</label>
    <p id={`${prefix}-claim-help`}>Write 20 to 1,200 characters.</p>
    <textarea id={`${prefix}-claim`} aria-describedby={`${prefix}-claim-help`} value={statement} onChange={event=>setStatement(event.target.value)} minLength={20} maxLength={1200} required />
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit claim request'}</button>
  </form>;
}
