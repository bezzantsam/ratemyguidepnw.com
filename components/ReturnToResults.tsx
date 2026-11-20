'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {reviewSearchReturn} from '@/lib/review-search-return';
export default function ReturnToResults({fallback='/guides'}:{fallback?:'/guides'|'/write-review'}){
 const [href,setHref]=useState<string>(fallback);
 useEffect(()=>{
  function readReturn(){setHref(reviewSearchReturn(window.location.search)??fallback)}
  readReturn();
  window.addEventListener('hashchange',readReturn);
  return()=>window.removeEventListener('hashchange',readReturn);
 },[fallback]);
 const reviewSearch=href==='/'||href.startsWith('/?')||href==='/write-review'||href.startsWith('/write-review?');
 return <Link href={href}>{reviewSearch?'← Back to rating search':'← Search guides'}</Link>;
}
