'use client';

import {useEffect, useRef, useState} from 'react';
import {client as auth} from '@/components/AuthPanel';
import {TripPreview} from './CaptainTripFields';
import {parseSubmittedTrips} from '@/lib/public-captain-trips';

type Proposal = {
  id: string; jurisdiction: 'OR'; sourceId: string; revision: number;
  draft: ReturnType<typeof parseSubmittedTrips>;
};
const pageSize = 10;
function readProposal(value: unknown): Proposal {
  if (!value || typeof value !== 'object') throw new Error('Incomplete trip submission.');
  const row = value as Record<string,unknown>;
  if (typeof row.id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.id) ||
      row.jurisdiction !== 'OR' || typeof row.sourceId !== 'string' || !/^OG\.\d{7}(?:\.[A-Za-z0-9&]+)*$/.test(row.sourceId) ||
      typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error('The listing or version could not be confirmed. Refresh the queue.');
  }
  return {id:row.id, jurisdiction:row.jurisdiction, sourceId:row.sourceId, revision:row.revision, draft:parseSubmittedTrips(row.draft)};
}

async function request(body: object, signal: AbortSignal) {
  const token = (await auth?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error('Sign in again to moderate trips.');
  const response = await fetch('/api/guide-offerings', {
    method:'POST', cache:'no-store', credentials:'same-origin', redirect:'error', signal,
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
    body:JSON.stringify(body)
  });
  if (response.status === 401) throw new Error('Sign in again to moderate trips.');
  if (response.status === 403) throw new Error('This account cannot moderate these trip changes.');
  if (response.status === 409) throw new Error('This submission has changed. Refresh to see the current queue.');
  if (!response.ok) throw new Error('Trip moderation is unavailable. Refresh before trying again.');
  return response.json();
}

function ProposedTrips({draft}: Pick<Proposal,'draft'>) {
  return <>
    {draft.offerings.length === 0 && <p><strong>Approving this version removes all guide-submitted trips from the profile.</strong></p>}
    <ul>{draft.offerings.map(trip =>
      <TripPreview key={trip.id} trip={trip} boat={draft.vessels.find(boat => boat.id === trip.vesselId)}/>
    )}</ul>
    {draft.vessels.filter(boat => !draft.offerings.some(trip => trip.vesselId === boat.id)).map(boat => <div key={boat.id}>
      <h4>{boat.label}</h4>
      <p>{[boat.type,boat.maxAnglers && `Up to ${boat.maxAnglers} anglers`,boat.covered && 'Covered',boat.heated && 'Heated',...boat.fishCare].filter(Boolean).join(' · ')}</p>
    </div>)}
  </>;
}

export default function TripProposalQueue() {
  const [page, setPage] = useState({offset:0});
  const [items, setItems] = useState<Proposal[] | null>(null);
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState<Record<string,string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const action = useRef<AbortController | null>(null);

  useEffect(() => () => action.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setItems(null); setError(''); setNotes({});
    request({operation:'moderator_list',offset:page.offset,limit:pageSize}, controller.signal)
      .then(data => {
        if (!data || !Array.isArray(data.items) || data.items.length > pageSize || data.offset !== page.offset || data.limit !== pageSize) throw new Error('The queue response could not be confirmed.');
        const proposals: Proposal[] = data.items.map(readProposal);
        if (new Set(proposals.map(row => row.id)).size !== proposals.length) throw new Error('Duplicate submission in the queue. Refresh to try again.');
        if (!controller.signal.aborted) setItems(proposals);
      })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [page]);

  async function decide(item: Proposal, approve: boolean) {
    const reason = (notes[item.id] ?? '').trim();
    if (action.current || reason.length < (approve ? 20 : 1) || reason.length > 500) return;
    const controller = new AbortController();
    action.current = controller;
    setBusy(item.id); setMessage(''); setError('');
    try {
      const result = await request({operation:'moderator_decide',proposalId:item.id,approve,reason},controller.signal);
      const expected = approve ? 'approved' : 'rejected';
      if (result?.proposalId !== item.id || result.status !== expected || (approve && (!Number.isSafeInteger(result.publishedVersion) || result.publishedVersion < 1))) throw new Error('The decision could not be confirmed. Refresh the queue.');
      if (controller.signal.aborted) return;
      setMessage(`Trip changes ${expected} for ${item.sourceId}.`);
      setPage({offset:0});
    } catch (failure) {
      if (!controller.signal.aborted) {
        setItems(null);
        setError(failure instanceof Error ? failure.message : 'Refresh the queue before trying again.');
      }
    } finally {
      if (!controller.signal.aborted) setBusy('');
      action.current = null;
    }
  }

  return <section aria-labelledby="trip-proposals-heading">
    <h2 id="trip-proposals-heading">Guide trip changes</h2>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {items === null && !error && <p role="status">Loading trip changes…</p>}
    {items?.length === 0 && <p>No pending trip changes on this page.</p>}
    {items?.map(item => <article className="card" key={item.id}>
      <h3>Trips for <a href={'/guides/'+item.sourceId.toLowerCase().replace(/[^a-z0-9]+/g,'-')}>{item.sourceId}</a></h3>
      <p>Submitted version {item.revision}</p>
      <ProposedTrips draft={item.draft}/>
      <label>Decision note for {item.sourceId}
        <textarea maxLength={500} disabled={!!busy} value={notes[item.id] ?? ''} onChange={event => setNotes({...notes,[item.id]:event.target.value})}/>
      </label>
      <p>For approval, record at least 20 characters explaining what you checked.</p>
      <div className="launch-actions">
        <button type="button" disabled={!!busy || (notes[item.id] ?? '').trim().length < 20} onClick={() => void decide(item,true)}>Approve trip changes</button>
        <button type="button" disabled={!!busy || !(notes[item.id] ?? '').trim()} onClick={() => void decide(item,false)}>Return to guide</button>
      </div>
    </article>)}
    <div className="launch-actions">
      {page.offset > 0 && <button type="button" disabled={!!busy} onClick={() => setPage({offset:Math.max(0,page.offset-pageSize)})}>Previous trip changes</button>}
      {items?.length === pageSize && <button type="button" disabled={!!busy} onClick={() => setPage({offset:page.offset+pageSize})}>Next trip changes</button>}
      <button type="button" disabled={!!busy} onClick={() => setPage({...page})}>Refresh trip changes</button>
    </div>
  </section>;
}
