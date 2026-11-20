'use client';

import {useEffect, useState} from 'react';
import {type createLaunchClient, type GuideSource} from '@/lib/launch-client';

type Api = ReturnType<typeof createLaunchClient>;
type OwnerName = {name:string|null;overridden:boolean};
type LoadState = {status:'loading'} | {status:'error'} | ({status:'ready'} & OwnerName);

export function PreferredNameOwner({source,api}:{source:GuideSource;api:Api}) {
  const [state,setState] = useState<LoadState>({status:'loading'});
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void api.ownProfileName(source).then(value => {
      if (active) setState({status:'ready',...value});
    }).catch(() => {
      if (active) setState({status:'error'});
    });
    return () => {active=false};
  }, [api,source,attempt]);

  if (state.status==='loading') return <p role="status">Checking your name settings…</p>;
  if (state.status==='error') return <section className="section">
    <p role="status">Your name settings are unavailable right now.</p>
    <button type="button" onClick={() => {setState({status:'loading'});setAttempt(n=>n+1)}}>Retry name settings</button>
  </section>;

  return <PreferredNameEditor initial={state} onSave={async name => {
    await api.setProfileName(source,name);
    const saved = await api.ownProfileName(source);
    if (saved.name!==name) throw new Error('Name readback did not match');
    window.dispatchEvent(new CustomEvent('rmg-preferred-name-changed',{detail:source}));
    return saved;
  }}/>;
}

function PreferredNameEditor({initial,onSave}:{initial:OwnerName;onSave:(name:string|null)=>Promise<OwnerName>}) {
  const [saved,setSaved] = useState(initial);
  const [draft,setDraft] = useState(initial.name??'');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const name = draft.trim();
  const valid = Array.from(name).length<=80&&!/[<>\u0000-\u001f\u007f]/u.test(name);

  async function save(value:string|null) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const confirmed = await onSave(value);
      setSaved(confirmed);
      setDraft(confirmed.name??'');
      setMessage(value===null?'Preferred name cleared.':'Preferred name saved.');
    } catch {
      setMessage('We could not confirm your changes. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <form className="card launch-form" aria-labelledby="preferred-name-title" onSubmit={event=>{
    event.preventDefault();
    if (valid&&name&&name!==saved.name) void save(name);
  }}>
    <h3 id="preferred-name-title">Preferred name</h3>
    <label>Name anglers call you
      <input value={draft} onChange={event=>{setDraft(event.target.value);setMessage('')}}
        disabled={busy} aria-describedby="preferred-name-help" aria-invalid={!valid}/>
    </label>
    <p id="preferred-name-help">Use up to 80 characters. Your registration name and reviews stay the same.</p>
    {!valid&&<p role="status">Use 80 characters or fewer without angle brackets or control characters.</p>}
    {saved.overridden&&<p>An editorial correction currently appears on your public profile.</p>}
    <button type="submit" disabled={busy||!valid||!name||name===saved.name}>Save name</button>
    <button type="button" disabled={busy||saved.name===null} onClick={()=>void save(null)}>Clear preferred name</button>
    <p role="status">{message}</p>
  </form>;
}
