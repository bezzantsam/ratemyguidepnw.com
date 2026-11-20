'use client';
import {useEffect,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {BRAND_NAME,guideAuthRedirectPath,guideAuthRestoredPath} from '@/lib/canonical-share';
import {rememberReviewSearch,takeReviewSearch} from '@/lib/review-search-return';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const client=url&&key?createClient(url,key):null;
export default function AuthPanel({onSignedIn,profilePath,claimIntent=false,moderator=false,authCheck=false,emailOnly=false}:{onSignedIn?:()=>void;profilePath?:string;claimIntent?:boolean;moderator?:boolean;authCheck?:boolean;emailOnly?:boolean}){
 const usesEmailOnly=moderator||authCheck||emailOnly;
 const[email,setEmail]=useState(''),[message,setMessage]=useState(''),[user,setUser]=useState<string|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const onSignedInRef=useRef(onSignedIn);onSignedInRef.current=onSignedIn;
 useEffect(()=>{
  if(!usesEmailOnly)return;
  const hasAuthError=(value:string)=>new URLSearchParams(value.slice(1)).has('error_code');
  if(hasAuthError(window.location.search)||hasAuthError(window.location.hash)){
   setMessage('This sign-in link could not be used. Request a new link below.');
  }
 },[usesEmailOnly]);
 useEffect(()=>{
  if(!client)return;
  let active=true,observedSession=false;
  let callbackTimer:number|undefined;
  function signedIn(){
   if(profilePath){
    const {pathname,search,hash}=window.location;
    const restored=guideAuthRestoredPath(pathname,search,hash,profilePath);
    if(restored){
     const target=search==='?intent=review'?takeReviewSearch(profilePath):null;
     const next=target
      ? `${pathname}?intent=review&returnTo=${encodeURIComponent(target)}#write-review`
      : restored;
     window.history.replaceState(window.history.state,'',next);
     window.dispatchEvent(new Event('hashchange'));
     if(search==='?intent=review'&&hash!=='#write-review')document.getElementById('write-review')?.scrollIntoView();
     if(search==='?intent=claim'&&hash!=='#claim-profile')document.getElementById('claim-profile')?.scrollIntoView();
    }
   }
   onSignedInRef.current?.();
  }
  function sync(email:string|null,signedInUser:boolean){
   window.clearTimeout(callbackTimer);
   setUser(email);setReady(true);
   // Route restoration can lead to an auth read in a parent. Run it after the provider releases its event lock.
   if(signedInUser)callbackTimer=window.setTimeout(()=>{if(active)signedIn()},0);
  }
  const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
   if(!active)return;
   observedSession=true;
   sync(session?.user.email||null,!!session?.user);
  });
  void client.auth.getUser().then(result=>{
   if(active&&!observedSession)sync(result.data.user?.email||null,!!result.data.user);
  }).catch(()=>{if(active&&!observedSession)setReady(true)});
  return()=>{active=false;window.clearTimeout(callbackTimer);subscription.unsubscribe()};
 },[profilePath]);
 function redirectTo(){
  const {origin,pathname,search,hash}=window.location;
  if(moderator)return origin+'/admin';
  if(claimIntent&&profilePath)return origin+guideAuthRedirectPath(`${profilePath}?intent=claim`,profilePath);
  const params=new URLSearchParams(search);
  params.delete('returnTo');
  const query=params.toString();
  const path=profilePath?guideAuthRedirectPath(pathname+(query?'?'+query:'')+hash,profilePath):pathname;
  if(profilePath&&path===profilePath+'?intent=review')rememberReviewSearch(profilePath,search);
  return origin+path;
 }
 async function google(){if(!client)return;setBusy(true);const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectTo()}});if(error){setMessage(error.message);setBusy(false)}}
 async function magic(){
  if(!client||busy)return;
  setBusy(true);setMessage('');
  const unavailable='Couldn’t send a sign-in link. Check your email address and try again.';
  try{
   const {error}=await client.auth.signInWithOtp({
    email:email.trim(),
    options:{emailRedirectTo:redirectTo(),...(moderator?{shouldCreateUser:false}:{})},
   });
   if(!error){
    setMessage(`Check your email for your ${BRAND_NAME} sign-in link.`);
   }else if(error.status===429||error.code==='over_email_send_rate_limit'||error.code==='over_request_rate_limit'){
    setMessage('Too many sign-in requests. If an email arrived, open the newest link. Otherwise, wait before requesting another.');
   }else{
    setMessage(usesEmailOnly?unavailable:error.message);
   }
  }catch{
   setMessage(unavailable);
  }finally{
   setBusy(false);
  }
 }
 async function signOut(){
  if(!client||busy)return;
  setBusy(true);setMessage('');
  try{
   const {error}=moderator?await client.auth.signOut({scope:'local'}):await client.auth.signOut();
   if(error)throw error;
   setEmail('');
  }catch{
   setMessage('Couldn’t sign out. Try again before switching accounts.');
  }finally{setBusy(false)}
 }
 if(!client)return <p>Sign-in configuration is unavailable.</p>;
 if(moderator&&!ready)return <p role="status">Checking sign-in…</p>;
 return <div className="auth-panel">
  {user?<>{!authCheck&&<p>Signed in as <strong>{user}</strong></p>}<button type="button" disabled={busy} onClick={()=>void signOut()}>Sign out</button></>:<>
   {!usesEmailOnly&&<button type="button" disabled={busy} onClick={()=>void google()}>Continue with Google</button>}
   <p>{moderator?'Use your moderator email to request a sign-in link.':usesEmailOnly?'Use your email to request a sign-in link.':'Or sign in using a verified email link:'}</p>
   <label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
   <button type="button" disabled={busy||!email.includes('@')} onClick={()=>void magic()}>Email me a sign-in link</button>
  </>}
  {message&&<p role="status">{message}</p>}
 </div>
}
