'use client';

import {useState} from 'react';
import {canonicalPublishedReviewUrl} from '@/lib/canonical-share';

export function ReviewShare({profilePath,reviewId,guideName}:{profilePath:string;reviewId:string;guideName:string}) {
  const url=canonicalPublishedReviewUrl(profilePath,reviewId),[status,setStatus]=useState(''),[fallback,setFallback]=useState(false);
  async function copy(){setStatus('');setFallback(false);try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(url);setStatus('Review link copied.')}catch{setFallback(true);setStatus('Couldn’t copy the link. Select and copy it below.')}}
  async function share(){setStatus('');setFallback(false);if(!navigator.share){await copy();return}try{await navigator.share({title:'An angler review on RateMyGuidePNW',text:`Read an angler’s review of ${guideName}.`,url});setStatus('Sharing dialog closed.')}catch(error){if(error instanceof Error&&error.name==='AbortError')return;await copy()}}
  return <div><button type="button" onClick={()=>void share()}>Share review</button>{' '}<button type="button" onClick={()=>void copy()}>Copy review link</button>{status&&<p role="status">{status}</p>}{fallback&&<label>Review link<input readOnly value={url} onFocus={event=>event.currentTarget.select()}/></label>}</div>;
}
