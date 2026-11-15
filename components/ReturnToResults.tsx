'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {safeDirectoryReturn} from '@/lib/directory-url';
export default function ReturnToResults(){
 const [href,setHref]=useState('/guides');
 useEffect(()=>{const p=new URLSearchParams(window.location.search);setHref(p.getAll('returnTo').length===1?safeDirectoryReturn(p.get('returnTo')):'/guides')},[]);
 return <Link href={href}>← Search guides</Link>;
}
