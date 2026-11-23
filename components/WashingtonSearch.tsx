'use client';
import Link from 'next/link';
import DirectoryPager from './DirectoryPager';
import {useMemo,useRef,useState} from 'react';
import type {WashingtonGuide} from '@/lib/washington';
export default function WashingtonSearch({guides}:{guides:WashingtonGuide[]}){
 const resultsRef=useRef<HTMLDivElement>(null);
 const[q,setQ]=useState('');const[page,setPage]=useState(1);const size=30;
 const sorted=useMemo(()=>guides.filter(g=>[g.name,g.business||'',g.notes||'',g.source].join(' ').toLocaleLowerCase().includes(q.toLocaleLowerCase())).sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base'})||a.id.localeCompare(b.id)),[guides,q]);
 const pages=Math.max(1,Math.ceil(sorted.length/size)),current=Math.min(page,pages);
 return <section className="directory-panel"><h2>Find a Washington captain</h2><div className="searchbar"><label>Search by captain, business or area<input type="search" value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder="Search Washington fishing guides"/></label></div><div ref={resultsRef} tabIndex={-1} className="results-heading" role="status"><strong>{sorted.length} listings</strong><span>Sorted by name A–Z · Page {current} of {pages}</span></div><div className="guide-results">{sorted.slice((current-1)*size,current*size).map(g=><Link className="guide-result" href={`/washington/${g.id}`} key={g.id}><div className="rating-tile"><strong>—</strong><span>Reviews unavailable</span></div><div className="guide-result-body"><div className="guide-result-top"><h3>{g.name}</h3><span className="listing-chip">Source listing</span></div><p className="outfit-name">{g.business||'Fishing guide'}</p><p className="guide-meta">{g.notes||'Washington'} · Source: {g.source}</p><p className="guide-submeta">Review data unavailable</p></div><span className="result-chevron">›</span></Link>)}</div>{sorted.length===0&&<p className="empty-results">No matching guides.</p>}<DirectoryPager page={current} pages={pages} resultsRef={resultsRef} onPageChange={setPage}/></section>;
}