'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {reviewSearchReturn} from '@/lib/review-search-return';
export default function ReturnToResults(){
 const [href,setHref]=useState('/guides');
 useEffect(()=>{
  function readReturn(){setHref(reviewSearchReturn(window.location.search)??'/guides')}
  readReturn();
  window.addEventListener('hashchange',readReturn);
  return()=>window.removeEventListener('hashchange',readReturn);
 },[]);
 const reviewSearch=href==='/'||href.startsWith('/?')||href==='/write-review'||href.startsWith('/write-review?');
 return <Link href={href}>{reviewSearch?'← Back to rating search':'← Search guides'}</Link>;
}
