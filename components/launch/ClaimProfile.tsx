'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import AuthPanel,{client as authClient} from '@/components/AuthPanel';
import {createLaunchClient,type ClaimStatus,type GuideSource} from '@/lib/launch-client';
import {CaptainTripsEditor} from './CaptainTripsEditor';
import {ClaimSubmission} from './SubmissionViews';

export function ClaimProfile({sourceId,profilePath,tripsEnabled=false}:{sourceId:string;profilePath:string;tripsEnabled?:boolean}) {
  const source=useMemo<GuideSource>(()=>({jurisdiction:'OR',sourceId}),[sourceId]);
  const api=useMemo(()=>createLaunchClient({enabled:true,getAccessToken:async()=>
    (await authClient?.auth.getSession())?.data.session?.access_token??null}),[]);
  const [open,setOpen]=useState(false);
  const [status,setStatus]=useState<ClaimStatus|'loading'|'signed_out'|'error'>('loading');
  const epoch=useRef(0);
  const currentUser=useRef<string|null>(null);
  const refresh=useCallback(async()=>{
    const current=++epoch.current;
    try {
      const [available,auth]=await Promise.all([api.claimAvailability(source),authClient?.auth.getSession()]);
      const session=auth?.data.session;
      const next=!available?'unavailable':session?await api.claimStatus(source):'signed_out';
      if(current===epoch.current){currentUser.current=session?.user.id??null;setStatus(next);}
    }catch{if(current===epoch.current)setStatus('error')}
  },[api,source]);
  useEffect(()=>{
    const readIntent=()=>setOpen(window.location.search==='?intent=claim'||window.location.hash==='#claim-profile');
    readIntent();
    window.addEventListener('hashchange',readIntent);
    void refresh();
    const subscription=authClient?.auth.onAuthStateChange((_event,session)=>{
      epoch.current++;
      const userId=session?.user.id??null;
      if(userId!==currentUser.current){
        currentUser.current=userId;
        setStatus(userId?'loading':'signed_out');
      }
      window.setTimeout(()=>void refresh(),0);
    }).data.subscription;
    return()=>{epoch.current++;subscription?.unsubscribe();window.removeEventListener('hashchange',readIntent)};
  },[refresh]);

  return <section id="claim-profile" className="section" aria-label="Profile ownership">
    {!open && status!=='unavailable' && status!=='loading' && <a href={`${profilePath}?intent=claim#claim-profile`} onClick={()=>setOpen(true)}>{status==='approved'&&tripsEnabled?'Manage my trips':status==='approved'||status==='pending'?'My profile claim':'Claim this profile'}</a>}
    {open && <>
      <h2>{status==='approved'?'Your guide profile':'Claim this profile'}</h2>
      {status==='loading'&&<p role="status">Checking claim availability…</p>}
      {status==='error'&&<><p role="status">We couldn’t check this claim. Try again before submitting.</p><button type="button" onClick={()=>void refresh()}>Check claim status</button></>}
      {status==='unavailable'&&<p role="status">Claims are unavailable for this profile.</p>}
      {status==='signed_out'&&<p>Sign in to submit a private ownership request for this listing.</p>}
      {status!=='unavailable'&&status!=='loading'&&status!=='error'&&<AuthPanel emailOnly claimIntent profilePath={profilePath}/>}
      {status==='none'&&<ClaimSubmission onSubmit={async draft=>{
        const current=epoch.current;
        try {
          const receipt=await api.submitClaim(source,draft);
          if(current===epoch.current)setStatus('pending');
          return receipt;
        }catch(error){if(current===epoch.current)void refresh();throw error}
      }}/>}
      {status==='pending'&&<p role="status">Your claim request is pending review. Your evidence is private.</p>}
      {status==='approved'&&<p role="status">Your claim has been approved for this profile.</p>}
      {status==='approved'&&tripsEnabled&&<CaptainTripsEditor key={sourceId} sourceId={sourceId}/>}
      {status==='denied'&&<p role="status">Your claim was not approved. You do not have editing access.</p>}
      {(status==='pending'||status==='approved'||status==='denied')&&<button type="button" onClick={()=>void refresh()}>Check claim status</button>}
    </>}
  </section>;
}
