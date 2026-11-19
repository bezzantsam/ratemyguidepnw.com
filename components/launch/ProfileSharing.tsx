'use client';

import {useState, type ReactNode} from 'react';
import {BRAND_NAME, canonicalProfileUrl, canonicalReviewRequestUrl} from '@/lib/canonical-share';

/** Enable review-request actions only when the real review destination is available. */
export function ProfileSharing({profilePath, guideName, reviewAvailable, primaryAction}: {profilePath:string; guideName:string; reviewAvailable:boolean; primaryAction?:ReactNode}) {
  const profileUrl=canonicalProfileUrl(profilePath);
  const reviewUrl=reviewAvailable ? canonicalReviewRequestUrl(profilePath) : null;
  const [status,setStatus]=useState('');
  const [fallback,setFallback]=useState('');

  async function copy(url:string) {
    setStatus('');setFallback('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setStatus('Link copied.');
    } catch { setFallback(url);setStatus('Copy the link from the field below.'); }
  }
  async function share() {
    setStatus('');setFallback('');
    if (!navigator.share) {await copy(profileUrl);return;}
    try {
      await navigator.share({title:`${guideName} on ${BRAND_NAME}`,text:`View ${guideName}'s guide profile on ${BRAND_NAME}.`,url:profileUrl});
      setStatus('Sharing dialog closed.');
    } catch (error) {
      if (error instanceof Error && error.name==='AbortError') return;
      await copy(profileUrl);
    }
  }
  async function downloadQr() {
    try {
      const {reviewRequestQrSvg}=await import('@/lib/review-qr');
      const blob=new Blob([reviewRequestQrSvg(profilePath)],{type:'image/svg+xml'});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');
      anchor.href=url;anchor.download='review-request-qr.svg';
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus('Your QR code is ready.');setFallback('');
    } catch {setStatus('The QR code could not be prepared. Copy the review link instead.');}
  }
  const shareButton = <button type="button" className="guide-share" onClick={()=>void share()}>Share profile</button>;
  const copyButton = <button type="button" onClick={()=>void copy(profileUrl)}>Copy profile link</button>;
  const reviewTools = reviewUrl && <>
    <button type="button" onClick={()=>void copy(reviewUrl)}>Copy review request link</button>
    <button type="button" onClick={()=>void downloadQr()}>Download review request QR code</button>
  </>;
  const feedback = <>
    <p className="share-feedback" role="status">{status}</p>
    {fallback && <label>Copy this link<input readOnly value={fallback} onFocus={event=>event.currentTarget.select()}/></label>}
  </>;
  if (primaryAction) return <div className="profile-sharing compact-sharing">
    <div className="profile-sharing-actions">{primaryAction}{shareButton}</div>
    {feedback}
    <details className="guide-share-tools"><summary>Sharing options</summary>
      <div className="profile-sharing-actions">{copyButton}{reviewTools}</div>
    </details>
  </div>;
  return <section className="section card profile-sharing" aria-labelledby="share-profile-heading">
    <h2 id="share-profile-heading">Share this profile</h2>
    <div className="profile-sharing-actions">{shareButton}{copyButton}{reviewTools}</div>
    {feedback}
  </section>;
}
