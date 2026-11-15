'use client';
import {useState} from 'react';
import {buildPublicReviewLink,formatNeutralReviewInvite,REVIEW_INVITE_TEXT} from '@/lib/review-invitations';

/** Zero-permission sharing: never sends a text, requests a rating or records an event. */
export default function ReviewInviteButton(){
  const [feedback,setFeedback]=useState('');
  const [manualUrl,setManualUrl]=useState('');

  async function share() {
    setFeedback('');setManualUrl('');
    let url:string;
    try {url=buildPublicReviewLink(window.location.href)}
    catch {setFeedback('A public guide review link is unavailable here.');return}

    if(typeof navigator.share==='function'){
      try {
        await navigator.share({title:'Share a firsthand fishing guide review',text:REVIEW_INVITE_TEXT,url});
        setFeedback('Review invitation shared.');
        return;
      } catch (error) {
        if(error instanceof Error&&error.name==='AbortError')return;
        // Unsupported share targets can still use ordinary clipboard sharing.
      }
    }
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(formatNeutralReviewInvite(url));
      setFeedback('Neutral review invitation copied. Share it with past anglers.');
    }catch {
      setManualUrl(url);
      setFeedback('Copy this public profile link to invite an honest review.');
    }
  }

  return <aside className="card review-invite" aria-label="Share this guide review page">
    <strong>Fished with this guide?</strong>
    <p>Help other anglers with a genuine firsthand review. Guides can invite past clients, but must not request only positive ratings, offer rewards for five stars, or threaten anyone over criticism.</p>
    <button type="button" onClick={()=>void share()}>Share honest review link</button>
    {feedback&&<p role="status" className="muted">{feedback}</p>}
    {manualUrl&&<p className="muted"><a href={manualUrl}>{manualUrl}</a></p>}
  </aside>;
}
