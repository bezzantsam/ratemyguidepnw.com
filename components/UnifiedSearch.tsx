'use client';
import Link from 'next/link';
import SaveGuideButton from './SaveGuideButton';
import {useMemo,useState} from 'react';
import type {DirectoryEntry} from '@/lib/directory';
import {filterDirectoryEntries} from '@/lib/directory-query';

export default function UnifiedSearch({entries}:{entries:DirectoryEntry[]}){
 const[q,setQ]=useState('');
 const[state,setState]=useState('All');
 const[area,setArea]=useState('All areas');
 const[waterway,setWaterway]=useState('All advertised waters');
 const[page,setPage]=useState(1);
 const size=30;
 const filtered=useMemo(()=>filterDirectoryEntries(entries,{
  state,sourceZone:area,advertisedWater:waterway,query:q
 }),[entries,q,state,area,waterway]);

 const areas=useMemo(()=>
  ['All areas',...new Set(entries.filter(g=>state==='All'||g.states.includes(state as 'Oregon'|'Washington'))
    .flatMap(g=>g.areas))].sort((a,b)=>a==='All areas'?-1:b==='All areas'?1:a.localeCompare(b)),
 [entries,state]);

 const waters=useMemo(()=>
  ['All advertised waters',...new Set(entries.filter(g=>state==='All'||g.states.includes(state as 'Oregon'|'Washington'))
    .flatMap(g=>g.advertisedWaters))].sort((a,b)=>a==='All advertised waters'?-1:b==='All advertised waters'?1:a.localeCompare(b)),
 [entries,state]);

 const pages=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(page,pages);
 const setRegion=(s:string)=>{
  setState(s);setArea('All areas');setWaterway('All advertised waters');setPage(1);
 };

 return <section className="directory-panel">
  <h2>Find a captain</h2>
  <p className="directory-source-disclosure">Registration areas are broad historical source categories, not confirmed fishing ports. Advertised fishing waters are a small, source-linked research pilot and do not certify active operations or licensing.</p>
  <div className="state-switch" aria-label="Filter guides by state">
   {['All','Oregon','Washington'].map(s=><button key={s} type="button" className={state===s?'active':''}
    aria-pressed={state===s} onClick={()=>setRegion(s)}>{s==='All'?'All guides':s}</button>)}
  </div>
  <div className="searchbar">
   <label>Captain, business, operating name, or registration
    <input type="search" value={q} onChange={e=>{setQ(e.target.value);setPage(1)}}
     placeholder="Try Josiah Darr or R Outfitters"/>
   </label>
   <label>Imported source zone (broad)
    <select value={area} onChange={e=>{setArea(e.target.value);setPage(1)}}>
     {areas.map(a=><option key={a}>{a}</option>)}
    </select>
   </label>
   <label>Advertised fishing water (pilot)
    <select value={waterway} onChange={e=>{setWaterway(e.target.value);setPage(1)}}>
     {waters.map(a=><option key={a}>{a}</option>)}
    </select>
   </label>
  </div>
  <div className="results-heading"><strong>{filtered.length.toLocaleString()} captain listings</strong>
   <span>A–Z · Page {current} of {pages}</span>
  </div>
  <div className="guide-results">{filtered.slice((current-1)*size,current*size).map(g=>
   <div className="saved-guide-row" key={g.id}>
    <Link className="guide-result" href={g.href}>
     <div className="rating-tile"><strong>—</strong><span>See reviews</span></div>
     <div className="guide-result-body">
      <div className="guide-result-top"><h3>{g.name}</h3>
       <span className="listing-chip">{g.states.join(' + ')}</span>
      </div>
      <p className="outfit-name">{g.business||'Fishing guide'}</p>
      {g.searchAliases.length>0&&<p className="guide-meta">Also listed publicly as: {g.searchAliases.join(' · ')}</p>}
      {g.advertisedWaters.length>0&&<p className="guide-meta">Advertised waters (source-linked): {g.advertisedWaters.slice(0,3).join(' · ')}{g.advertisedWaters.length>3?' · + more':''}</p>}
      <p className="guide-meta">Imported source zones: {g.areas.slice(0,3).join(' · ')||'Not specified'}{g.areas.length>3?' · + more':''}</p>
      <p className="guide-submeta">Historical source listing · Current credentials not independently checked</p>
     </div><span className="result-chevron">›</span>
    </Link><SaveGuideButton href={g.href} name={g.name}/>
   </div>)}
  </div>
  {!filtered.length&&<p className="empty-results">No matching guides. Try another name, registration zone or advertised waterway.</p>}
  {pages>1&&<div className="pager"><button disabled={current===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>← Previous</button>
   <span>Page {current} / {pages}</span>
   <button disabled={current===pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Next →</button>
  </div>}
 </section>;
}
