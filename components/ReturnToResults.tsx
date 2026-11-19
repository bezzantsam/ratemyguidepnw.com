'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {safeDirectoryReturn} from '@/lib/directory-url';
export default function ReturnToResults(){
 const [href,setHref]=useState('/guides');
 useEffect(()=>{const p=new URLSearchParams(window.location.search);setHref(p.getAll('returnTo').length===1?safeDirectoryReturn(p.get('returnTo')):'/guides')},[]);
 const reviewSearch=href==='/'||href.startsWith('/?')||href==='/write-review'||href.startsWith('/write-review?');
 return <Link href={href}>{reviewSearch?'← Back to rating search':'← Search guides'}</Link>;
}
