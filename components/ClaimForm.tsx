'use client';

import {useEffect,useState} from 'react';
import AuthPanel,{client} from './AuthPanel';

/**
 * A claim and its private evidence must be one database transaction.
 * The draft request_guide_claim() function is SECURITY INVOKER and subject
 * to live grants/RLS. No approved/verified/publication state comes from here.
 */
export default function ClaimForm({name,listing,submitEnabled=false}:{name:string;listing:string;submitEnabled?:boolean}){
  const [claimant,setClaimant]=useState('');
  const [business,setBusiness]=useState('');
  const [proof,setProof]=useState('');
  const [signedIn,setSignedIn]=useState(false);
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    if(!client)return;
    let active=true;
    void client.auth.getUser().then(({data})=>{if(active)setSignedIn(!!data.user)});
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
      if(active)setSignedIn(!!session?.user);
    });
    return()=>{active=false;subscription.unsubscribe()};
  },[]);

  async function submit(){
    if(!submitEnabled){setStatus('Profile claiming is not live yet. This form cannot submit a request.');return;}
    if(!client||busy)return;
    const captainName=claimant.trim(),businessName=business.trim(),publicEvidence=proof.trim();
    if(captainName.length<2||captainName.length>100||
       businessName.length>120||publicEvidence.length<8||publicEvidence.length>600){
      setStatus('Please provide a name and public source details within the length limits.');
      return;
    }
    setBusy(true);
    setStatus('');
    try{
      const {data:user,error:authError}=await client.auth.getUser();
      if(authError||!user.user){
        setStatus('Please sign in before requesting a claim.');
        return;
      }
      const publicSlug=listing.toLowerCase().replace(/[^a-z0-9]+/g,'-');
      const {data:guide,error:lookupError}=await client.from('guides')
        .select('id').eq('slug',publicSlug).maybeSingle();
      if(lookupError||!guide){
        setStatus('This directory listing is not yet connected for claims.');
        return;
      }
      // The server derives claimant_id from auth.uid(), inserts claim+evidence
      // atomically, assigns PENDING and verifies RLS. No browser double-write.
      const {error}=await client.rpc('request_guide_claim',{
        p_guide_id:guide.id,
        p_claimant_name:captainName,
        p_business_name:businessName,
        p_public_evidence:publicEvidence,
      });
      if(error){
        setStatus(error.code==='23505'
          ? 'A request already exists for this profile and account. A moderator can review its status.'
          : 'The request could not be saved. No profile ownership was verified.');
        return;
      }
      setStatus('Your claim and supporting evidence were submitted together for independent review. You are not verified yet.');
      setProof('');
    }catch{
      setStatus('The claim request could not be completed. No profile ownership was verified.');
    }finally{
      setBusy(false);
    }
  }

  return <div className="claim-form">
    {!submitEnabled&&<p role="status" className="muted">Profile claiming is currently disabled while the live claim transaction and independent verification workflow are being tested. No request will be sent.</p>}
    {submitEnabled&&<AuthPanel/>}
    <label>Full name
      <input required minLength={2} maxLength={100} autoComplete="name"
        value={claimant} onChange={event=>setClaimant(event.target.value)}
        placeholder="Captain or authorized business representative"/>
    </label>
    <label>Business or outfit
      <input maxLength={120} value={business}
        onChange={event=>setBusiness(event.target.value)}/>
    </label>
    <label>Public source supporting your affiliation
      <textarea rows={3} minLength={8} maxLength={600} value={proof}
        onChange={event=>setProof(event.target.value)}
        placeholder="Official listing or business website; no receipts, identity documents or secrets"/>
    </label>
    <p className="muted">
      To protect captains and anglers, a claim is reviewed privately before
      anyone can edit the public listing. We do not request tax records,
      proof of cash payment, customers' names, or personal identification.
      An existing registration number alone is not ownership proof.
    </p>
    <button type="button" disabled={!submitEnabled||!client||!signedIn||busy||
      claimant.trim().length<2||proof.trim().length<8}
      onClick={()=>void submit()}>
      {busy?'Submitting…':'Request profile claim review'}
    </button>
    {status&&<p role="status">{status}</p>}
  </div>;
}
