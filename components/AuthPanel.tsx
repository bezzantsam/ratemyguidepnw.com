'use client';
import {useEffect,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {guideAuthRedirectPath,guideAuthRestoredPath} from '@/lib/canonical-share';
import {rememberReviewSearch,takeReviewSearch} from '@/lib/review-search-return';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const client=url&&key?createClient(url,key):null;
export default function AuthPanel({onSignedIn,profilePath,moderator=false}:{onSignedIn?:()=>void;profilePath?:string;moderator?:boolean}){
 const[email,setEmail]=useState(''),[message,setMessage]=useState(''),[user,setUser]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const onSignedInRef=useRef(onSignedIn);onSignedInRef.current=onSignedIn;
 useEffect(()=>{
  if(!moderator)return;
  const hasAuthError=(value:string)=>new URLSearchParams(value.slice(1)).has('error_code');
  if(hasAuthError(window.location.search)||hasAuthError(window.location.hash)){
   setMessage('This sign-in link could not be used. Request a new link below.');
  }
 },[moderator]);
 useEffect(()=>{
  if(!client)return;
  let active=true;
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
    }
   }
   onSignedInRef.current?.();
  }
  void client.auth.getUser().then(r=>{if(!active)return;setUser(r.data.user?.email||null);if(r.data.user)signedIn()});
  const {data:{subscription}}=client.auth.onAuthStateChange((_e,s)=>{setUser(s?.user?.email||null);if(s?.user)signedIn()});
  return()=>{active=false;subscription.unsubscribe()};
 },[profilePath]);
 function redirectTo(){
  const {origin,pathname,search,hash}=window.location;
  if(moderator)return origin+'/admin';
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
   setMessage(error?(moderator?unavailable:error.message):'Check your email for the sign-in link.');
  }catch{
   setMessage(unavailable);
  }finally{
   setBusy(false);
  }
 }
 if(!client)return <p>Sign-in configuration is unavailable.</p>;
 return <div className="auth-panel">
  {user?<><p>Signed in as <strong>{user}</strong></p><button type="button" onClick={()=>void client.auth.signOut()}>Sign out</button></>:<>
   {!moderator&&<button type="button" disabled={busy} onClick={()=>void google()}>Continue with Google</button>}
   <p>{moderator?'Use your moderator email to request a sign-in link.':'Or sign in using a verified email link:'}</p>
   <label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
   <button type="button" disabled={busy||!email.includes('@')} onClick={()=>void magic()}>Email me a sign-in link</button>
   {message&&<p role="status">{message}</p>}
  </>}
 </div>
}
