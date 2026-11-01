'use client';
import {useState} from 'react';
export default function ClaimForm({name,listing}:{name:string;listing:string}){
 const [claimant,setClaimant]=useState('');const [email,setEmail]=useState('');const [business,setBusiness]=useState('');const [proof,setProof]=useState('');
 const subject='Profile ownership claim request: '+name+' ('+listing+')';
 const body=['Captain profile ownership request','Listing: '+name,'Directory reference: '+listing,'Claimant name: '+claimant,'Reply email: '+email,'Business or outfit: '+business,'Public proof URL / explanation: '+proof,'','I understand that submitting this request does not verify or transfer ownership. The site operator will independently confirm my identity before changing the listing.'].join('\n');
 const ready=claimant.trim()&&email.includes('@')&&proof.trim();
 return <form className="claim-form" onSubmit={e=>{e.preventDefault();if(ready)window.location.href='mailto:bezzantsam@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)}}>
 <label>Your full name<input required value={claimant} onChange={e=>setClaimant(e.target.value)} placeholder="Captain or authorized business representative"/></label>
 <label>Your email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@yourbusiness.com"/></label>
 <label>Business / outfit<input value={business} onChange={e=>setBusiness(e.target.value)} placeholder="Business name"/></label>
 <label>Public proof of association<textarea required value={proof} onChange={e=>setProof(e.target.value)} placeholder="Link to an official business page identifying you, or explain how we can independently verify the claim. Do not include ID documents or sensitive information." rows={4}/></label>
 <button className="button" disabled={!ready} type="submit">Prepare claim email →</button>
 <p className="muted">This opens your email app; you must send the message yourself. Requests are sent to the site's operator inbox. Claim requests do not grant access automatically. Do not email identification documents.</p>
 </form>
}