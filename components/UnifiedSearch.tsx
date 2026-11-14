'use client';
import Link from 'next/link';
import {useMemo,useState} from 'react';
import type {DirectoryEntry} from '@/lib/directory';
export default function UnifiedSearch({entries}:{entries:DirectoryEntry[]}){
 const[q,setQ]=useState('');const[state,setState]=useState('All');const[area,setArea]=useState('All areas');const[page,setPage]=useState(1);
 const size=30;
 const filtered=useMemo(()=>entries.filter(g=>(state==='All'||g.states.includes(state as 'Oregon'|'Washington'))&&(area==='All areas'||g.areas.includes(area))&&[g.name,g.business||'',g.id,...g.areas].join(' ').toLocaleLowerCase().includes(q.toLocaleLowerCase())).sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base'})||a.id.localeCompare(b.id)),[entries,q,state,area]);
 const areas=useMemo(()=>['All areas',...new Set(entries.filter(g=>state==='All'||g.states.includes(state as 'Oregon'|'Washington')).flatMap(g=>g.areas))].sort((a,b)=>a==='All areas'?-1:b==='All areas'?1:a.localeCompare(b)),[entries,state]);
 const pages=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(page,pages);
 const setRegion=(s:string)=>{setState(s);setArea('All areas');setPage(1)};
 return <section className="directory-panel"><h2>Find a captain</h2>
 <div className="state-switch" aria-label="Filter guides by state">{['All','Oregon','Washington'].map(s=><button key={s} type="button" className={state===s?'active':''} aria-pressed={state===s} onClick={()=>setRegion(s)}>{s==='All'?'All guides':s}</button>)}</div>
 <div className="searchbar"><label>Captain, outfitter or registration<input type="search" value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder="Search fishing guides"/></label><label>Service region<select value={area} onChange={e=>{setArea(e.target.value);setPage(1)}}>{areas.map(a=><option key={a}>{a}</option>)}</select></label></div>
 <div className="results-heading"><strong>{filtered.length.toLocaleString()} captain listings</strong><span>A–Z · Page {current} of {pages}</span></div>
 <div className="guide-results">{filtered.slice((current-1)*size,current*size).map(g=><Link className="guide-result" href={g.href} key={g.id}>
  <div className="rating-tile"><strong>—</strong><span>See reviews</span></div><div className="guide-result-body"><div className="guide-result-top"><h3>{g.name}</h3><span className="listing-chip">{g.states.join(' + ')}</span></div><p className="outfit-name">{g.business||'Fishing guide'}</p><p className="guide-meta">{g.areas.slice(0,3).join(' · ')||'Regional listing'}{g.areas.length>3?' · + more':''}</p><p className="guide-submeta">Imported source listing · Reviews on profile</p></div><span className="result-chevron">›</span>
 </Link>)}</div>{!filtered.length&&<p className="empty-results">No matching guides. Try another name or region.</p>}
 {pages>1&&<div className="pager"><button disabled={current===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>← Previous</button><span>Page {current} / {pages}</span><button disabled={current===pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Next →</button></div>}
 </section>;
}