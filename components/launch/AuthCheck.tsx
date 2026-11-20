'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import AuthPanel,{client as authClient} from '@/components/AuthPanel';
import {createLaunchClient} from '@/lib/launch-client';

export function AuthCheck({profilePath,moderator=false}:{profilePath?:string;moderator?:boolean}) {
  const api=useMemo(()=>createLaunchClient({
    enabled:true,
    getAccessToken:async()=> (await authClient?.auth.getSession())?.data.session?.access_token??null,
  }),[]);
  const epoch=useRef(0);
  const [status,setStatus]=useState<'signed_out'|'checking'|'ordinary'|'moderator'|'error'>('signed_out');
  const verify=useCallback(async()=>{
    const attempt=++epoch.current;
    setStatus('checking');
    try {
      const result=await api.session();
      if(epoch.current!==attempt)return;
      setStatus(result.operator?(result.reviewQueueReady?'moderator':'error'):'ordinary');
    } catch {
      if(epoch.current===attempt)setStatus('error');
    }
  },[api]);
  useEffect(()=>{
    if(!authClient)return;
    const {data:{subscription}}=authClient.auth.onAuthStateChange((_event,session)=>{
      if(!session){epoch.current++;setStatus('signed_out');}
    });
    return ()=>{epoch.current++;subscription.unsubscribe();};
  },[]);

  return <>
    <AuthPanel authCheck moderator={moderator} profilePath={profilePath} onSignedIn={()=>void verify()}/>
    {status==='checking'&&<p role="status">Checking sign-in…</p>}
    {status==='ordinary'&&<p role="status">{moderator?'This account does not have moderator access.':'Angler sign-in confirmed.'}</p>}
    {status==='moderator'&&(moderator
      ? <section aria-label="Pending submissions"><h2>Pending submissions</h2><p role="status">Moderator review queue access confirmed.</p></section>
      : <p role="status">This account has moderator access.</p>)}
    {status==='error'&&<>
      <p role="status">Account verification is temporarily unavailable.</p>
      <button type="button" onClick={()=>void verify()}>Check sign-in status</button>
    </>}
    <p>Review submissions and moderation actions are closed.</p>
  </>;
}
