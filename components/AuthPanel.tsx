'use client';
import {useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const client=url&&key?createClient(url,key):null;
export default function AuthPanel({onSignedIn}:{onSignedIn?:()=>void}){
 const[email,setEmail]=useState(''),[message,setMessage]=useState(''),[user,setUser]=useState<string|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!client)return;void client.auth.getUser().then(r=>{setUser(r.data.user?.email||null);if(r.data.user)onSignedIn?.()});const {data:{subscription}}=client.auth.onAuthStateChange((_e,s)=>{setUser(s?.user?.email||null);if(s?.user)onSignedIn?.()});return()=>subscription.unsubscribe()},[]);
 async function google(){if(!client)return;setBusy(true);const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname}});if(error){setMessage(error.message);setBusy(false)}}
 async function magic(){if(!client)return;setBusy(true);const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin+window.location.pathname}});setMessage(error?.message||'Check your email for the sign-in link.');setBusy(false)}
 if(!client)return <p>Sign-in configuration is unavailable.</p>;
 return <div className="auth-panel">{user?<><p>Signed in as <strong>{user}</strong></p><button type="button" onClick={()=>void client.auth.signOut()}>Sign out</button></>:<><button type="button" disabled={busy} onClick={()=>void google()}>Continue with Google</button><p>Or sign in using a verified email link:</p><label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><button type="button" disabled={busy||!email.includes('@')} onClick={()=>void magic()}>Email me a sign-in link</button></>}{message&&<p role="status">{message}</p>}</div>
}