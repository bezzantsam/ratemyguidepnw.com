'use client';

import {useId, useRef, useState} from 'react';
import {isSubmissionReceipt, type SubmissionReceipt} from './submission-model';
import {SubmissionStatus} from './SubmissionViews';

/** The backend must authorize every read and action; this view does not grant privileges. */
export type ModerationItem = Readonly<{
  id: string;
  kind: 'review' | 'claim';
  guideName: string;
  description: string;
  submittedAt: string;
}>;
type Decision = 'approve' | 'reject';
type Decide = (item: ModerationItem, decision: Decision, reason: string) => Promise<SubmissionReceipt>;

function QueueItem({item, onDecide}: {item: ModerationItem; onDecide: Decide}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const processing = useRef(false);
  async function decide(decision: Decision) {
    if (processing.current) return;
    if (decision === 'reject' && !reason.trim()) { setError('Add a reason before rejecting.'); return; }
    processing.current = true; setBusy(true); setError('');
    try {
      const result = await onDecide(item, decision, reason.trim());
      const expected = item.kind === 'review' ? decision === 'approve' ? 'published' : 'rejected' : decision === 'approve' ? 'approved' : 'denied';
      if (!isSubmissionReceipt(result,item.kind) || result.status !== expected) throw new Error('Unconfirmed decision');
      setReceipt(result);
    } catch { setError('The decision could not be confirmed. Refresh the queue before trying again.'); }
    finally { processing.current = false; setBusy(false); }
  }
  return <article className="card">
    <h3>{item.kind === 'review' ? 'Review' : 'Claim request'} · {item.guideName}</h3>
    <p>Submitted: {item.submittedAt}</p><p>{item.description}</p>
    {receipt ? <SubmissionStatus kind={item.kind} receipt={receipt}/> : <>
      <label htmlFor={`${id}-reason`}>Decision note or rejection reason</label>
      <textarea id={`${id}-reason`} value={reason} onChange={event=>setReason(event.target.value)} maxLength={500}/>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={()=>void decide('approve')}>Approve</button>
      <button type="button" disabled={busy} onClick={()=>void decide('reject')}>Reject</button>
    </>}
  </article>;
}

export function ModerationQueue({items, onDecide}: {items: readonly ModerationItem[]; onDecide: Decide}) {
  return <section aria-labelledby="moderation-queue-heading">
    <h2 id="moderation-queue-heading">Pending submissions</h2>
    {items.length === 0 ? <p>No pending submissions.</p> : items.map(item=><QueueItem key={`${item.kind}:${item.id}`} item={item} onDecide={onDecide}/>)}
  </section>;
}
