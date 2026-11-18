'use client';
import {useEffect,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {guideAuthRedirectPath,guideAuthRestoredPath} from '@/lib/canonical-share';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const client=url&&key?createClient(url,key):null;
export default function AuthPanel({onSignedIn,profilePath}:{onSignedIn?:()=>void;profilePath?:string}){
 const[email,setEmail]=useState(''),[message,setMessage]=useState(''),[user,setUser]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const onSignedInRef=useRef(onSignedIn);onSignedInRef.current=onSignedIn;
 useEffect(()=>{if(!client)return;let active=true;function signedIn(){if(profilePath){const {pathname,search,hash}=window.location;const restored=guideAuthRestoredPath(pathname,search,hash,profilePath);if(restored){window.history.replaceState(window.history.state,'',restored);window.dispatchEvent(new Event('hashchange'))}}onSignedInRef.current?.()}void client.auth.getUser().then(r=>{if(!active)return;setUser(r.data.user?.email||null);if(r.data.user)signedIn()});const {data:{subscription}}=client.auth.onAuthStateChange((_e,s)=>{setUser(s?.user?.email||null);if(s?.user)signedIn()});return()=>{active=false;subscription.unsubscribe()}},[profilePath]);
 function redirectTo(){const {origin,pathname,search,hash}=window.location;const path=profilePath?guideAuthRedirectPath(pathname+search+hash,profilePath):pathname;return origin+path}
 async function google(){if(!client)return;setBusy(true);const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectTo()}});if(error){setMessage(error.message);setBusy(false)}}
 async function magic(){if(!client)return;setBusy(true);const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo()}});setMessage(error?.message||'Check your email for the sign-in link.');setBusy(false)}
 if(!client)return <p>Sign-in configuration is unavailable.</p>;
 return <div className="auth-panel">{user?<><p>Signed in as <strong>{user}</strong></p><button type="button" onClick={()=>void client.auth.signOut()}>Sign out</button></>:<><button type="button" disabled={busy} onClick={()=>void google()}>Continue with Google</button><p>Or sign in using a verified email link:</p><label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><button type="button" disabled={busy||!email.includes('@')} onClick={()=>void magic()}>Email me a sign-in link</button></>}{message&&<p role="status">{message}</p>}</div>
}
