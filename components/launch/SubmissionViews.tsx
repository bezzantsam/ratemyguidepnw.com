'use client';

import {useId, useRef, useState} from 'react';
import {type ReviewDraft, type SubmissionReceipt, isSubmissionReceipt, validateClaimStatement, validateReviewDraft} from './submission-model';

/** These views are not connected to a backend until the reviewed integration supplies one. */
type SubmitReview = (draft: ReviewDraft) => Promise<SubmissionReceipt>;
type SubmitClaim = (statement: string) => Promise<SubmissionReceipt>;

export function SubmissionStatus({kind, receipt}: {kind: 'review' | 'claim'; receipt: SubmissionReceipt}) {
  const label = kind === 'review' ? 'Review' : 'Claim request';
  const next = receipt.status === 'pending'
    ? 'It is waiting for an independent moderator.'
    : receipt.status === 'published' ? 'Your review has been published.'
    : receipt.status === 'removed' ? 'Your review is no longer published.'
    : receipt.status === 'approved' ? 'Your claim has been approved.'
    : 'It was not approved. See any explanation below.';
  return <div role="status"><strong>{label}: {receipt.status}</strong><p>{next}</p>{receipt.message && <p>{receipt.message}</p>}</div>;
}

export function ReviewSubmission({onSubmit}: {onSubmit: SubmitReview}) {
  const prefix = useId();
  const [quality, setQuality] = useState('');
  const [intensity, setIntensity] = useState('');
  const [wouldBookAgain, setWouldBookAgain] = useState('');
  const [body, setBody] = useState('');
  const [firsthand, setFirsthand] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const submitting = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const draft = {quality: Number(quality), intensity: Number(intensity), wouldBookAgain: wouldBookAgain === '' ? null : wouldBookAgain === 'yes', body: body.trim(), firsthand};
    const problem = validateReviewDraft(draft);
    if (problem) { setError(problem); return; }
    submitting.current = true; setBusy(true); setError('');
    try { const result = await onSubmit(draft); if (!isSubmissionReceipt(result,'review')) throw new Error('Invalid receipt'); setReceipt(result); }
    catch { setError('We could not confirm your submission. Check your review status before trying again.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (receipt) return <SubmissionStatus kind="review" receipt={receipt}/>;
  return <form onSubmit={submit} className="card">
    <h3>Share your trip experience</h3>
    <p>Write about a trip you personally took. Your review is checked before publication. Signing in confirms your account, not that a trip occurred.</p>
    <label htmlFor={`${prefix}-quality`}>Overall quality</label>
    <select id={`${prefix}-quality`} value={quality} onChange={event=>setQuality(event.target.value)} required>
      <option value="">Choose a rating</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value} / 5</option>)}
    </select>
    <label htmlFor={`${prefix}-intensity`}>Trip intensity</label>
    <select id={`${prefix}-intensity`} value={intensity} onChange={event=>setIntensity(event.target.value)} required>
      <option value="">Choose a rating</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value} / 5</option>)}
    </select>
    <label htmlFor={`${prefix}-again`}>Would you book again?</label>
    <select id={`${prefix}-again`} value={wouldBookAgain} onChange={event=>setWouldBookAgain(event.target.value)} required>
      <option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option>
    </select>
    <label htmlFor={`${prefix}-body`}>Your experience</label>
    <p id={`${prefix}-body-help`}>Write 80 to 3,000 characters.</p>
    <textarea id={`${prefix}-body`} aria-describedby={`${prefix}-body-help`} value={body} onChange={event=>setBody(event.target.value)} minLength={80} maxLength={3000} required />
    <label><input type="checkbox" checked={firsthand} onChange={event=>setFirsthand(event.target.checked)} required/> I personally took this trip.</label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit review'}</button>
  </form>;
}

export function ClaimSubmission({onSubmit}: {onSubmit: SubmitClaim}) {
  const prefix = useId();
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const submitting = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const problem = validateClaimStatement(statement);
    if (problem) { setError(problem); return; }
    submitting.current = true; setBusy(true); setError('');
    try { const result = await onSubmit(statement.trim()); if (!isSubmissionReceipt(result,'claim')) throw new Error('Invalid receipt'); setReceipt(result); }
    catch { setError('We could not confirm your submission. Check your claim status before trying again.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (receipt) return <SubmissionStatus kind="claim" receipt={receipt}/>;
  return <form onSubmit={submit} className="card">
    <h3>Request this listing</h3>
    <p>Tell us how you are connected to this guide or business. A moderator will review the request. A claim does not give control over angler reviews.</p>
    <label htmlFor={`${prefix}-claim`}>Your connection to this listing</label>
    <textarea id={`${prefix}-claim`} value={statement} onChange={event=>setStatement(event.target.value)} minLength={20} maxLength={1000} required />
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit claim request'}</button>
  </form>;
}
