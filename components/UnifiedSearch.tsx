'use client';
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState} from 'react';
import {DEFAULT_DIRECTORY_STATE,DIRECTORY_PAGE_SIZE,directoryUrl,parseDirectoryState,type DirectoryState} from '@/lib/directory-url';
import type {DirectoryEntry} from '@/lib/directory';
import {filterDirectoryEntries,guideSearchScore} from '@/lib/directory-query';
import DirectoryEmptyState from './DirectoryEmptyState';

export default function UnifiedSearch({entries}:{entries:DirectoryEntry[]}){
 const [selection,setSelection]=useState<DirectoryState>(DEFAULT_DIRECTORY_STATE);
 const [copyStatus,setCopyStatus]=useState('');
 const [fallback,setFallback]=useState(false);
 const resultsRef=useRef<HTMLDivElement>(null);
 const searchRef=useRef<HTMLInputElement>(null),areaRef=useRef<HTMLSelectElement>(null),waterRef=useRef<HTMLSelectElement>(null),speciesRef=useRef<HTMLSelectElement>(null),methodRef=useRef<HTMLSelectElement>(null),allRef=useRef<HTMLButtonElement>(null);
 const {query:q,state,area,waterway,species,method,page}=selection;
 const size=DIRECTORY_PAGE_SIZE;
 useEffect(()=>{
  function restore(){
   const next=parseDirectoryState(window.location.search,entries);
   setSelection(next);
   const query=directoryUrl(next).slice('/guides'.length);
   if(window.location.search!==query)window.history.replaceState(null,'',window.location.pathname+query);
  }
  restore();window.addEventListener('popstate',restore);
  return ()=>window.removeEventListener('popstate',restore);
 },[entries]);
 function change(patch:Partial<DirectoryState>,replace=false){
  const next=parseDirectoryState(directoryUrl({...selection,...patch}).slice('/guides'.length),entries);
  setSelection(next);setCopyStatus('');setFallback(false);
  const query=directoryUrl(next).slice('/guides'.length);
  const target=window.location.pathname+query;
  if(target!==window.location.pathname+window.location.search){
   if(replace)window.history.replaceState(null,'',target);else window.history.pushState(null,'',target);
  }
 }
 async function copyLink(){
  const url=window.location.origin+directoryUrl(selection);
  try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(url);setCopyStatus('Search link copied.');setFallback(false)}
  catch{setFallback(true);setCopyStatus('Copy the search link from the field below.')}
 }
 const filtered=useMemo(()=>filterDirectoryEntries(entries,{
  state,sourceZone:area,advertisedWater:waterway,species,method,query:q
 }),[entries,q,state,area,waterway,species,method]);

 const areas=useMemo(()=>
  ['All areas',...new Set(entries.filter(g=>state==='All'||g.states.includes(state as 'Oregon'|'Washington'))
    .flatMap(g=>g.areas))].sort((a,b)=>a==='All areas'?-1:b==='All areas'?1:a.localeCompare(b)),
 [entries,state]);

 const waters=useMemo(()=>
  ['All advertised waters',...new Set(entries.filter(g=>state==='All'||g.states.includes(state as 'Oregon'|'Washington'))
    .flatMap(g=>g.advertisedWaters))].sort((a,b)=>a==='All advertised waters'?-1:b==='All advertised waters'?1:a.localeCompare(b)),
 [entries,state]);

 const speciesOptions=useMemo(()=>[...new Set(entries.filter(g=>state==='All'||g.states.includes(state as 'Oregon'|'Washington')).flatMap(g=>g.advertisedSpecies??[]))].sort(),[entries,state]);
 const methodOptions=useMemo(()=>[...new Set(entries.filter(g=>state==='All'||g.states.includes(state as 'Oregon'|'Washington')).flatMap(g=>g.advertisedMethods??[]))].sort(),[entries,state]);
 const pages=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(page,pages);
 const setRegion=(s:DirectoryState['state'])=>change({state:s,area:'All areas',waterway:'All advertised waters',species:'All species',method:'All methods',page:1});

 return <section className="directory-panel">
  <h2>Find a captain</h2>
  <p className="directory-source-disclosure">Imported location and registration fields are historical source categories, not confirmed fishing ports. Advertised fishing waters are a small, source-linked research pilot and do not certify active operations or licensing.</p>
  {entries.some(g=>g.testFixture)&&<p className="directory-source-disclosure">Synthetic test fixture — not a real offering.</p>}
  <div className="state-switch" aria-label="Filter guides by state">
   {(['All','Oregon','Washington'] as const).map(s=><button key={s} ref={s==='All'?allRef:undefined} type="button" className={state===s?'active':''}
    aria-pressed={state===s} onClick={()=>setRegion(s)}>{s==='All'?'All guides':s}</button>)}
  </div>
  <div className="searchbar">
   <label>Captain, business, operating name, or registration
    <input ref={searchRef} type="search" value={q} maxLength={120} onChange={e=>change({query:e.target.value,page:1},true)}
     placeholder="Try Billy Bandit, Josiah Darr or a river"/>
   </label>
   <label>Imported source area / notes (unverified)
    <select ref={areaRef} value={area} onChange={e=>change({area:e.target.value,page:1})}>
     {areas.map(a=><option key={a}>{a}</option>)}
    </select>
   </label>
   <label>Advertised fishing water (pilot)
    <select ref={waterRef} value={waterway} onChange={e=>change({waterway:e.target.value,page:1})}>
     {waters.map(a=><option key={a}>{a}</option>)}
    </select>
   </label>
   {speciesOptions.length>0&&<label>Source-listed species
    <select ref={speciesRef} value={species} onChange={e=>change({species:e.target.value,page:1})}><option>All species</option>{speciesOptions.map(x=><option key={x}>{x}</option>)}</select>
   </label>}
   {methodOptions.length>0&&<label>Source-listed fishing method
    <select ref={methodRef} value={method} onChange={e=>change({method:e.target.value,page:1})}><option>All methods</option>{methodOptions.map(x=><option key={x}>{x}</option>)}</select>
   </label>}
  </div>
  {(speciesOptions.length>0||methodOptions.length>0)&&<p className="muted">Filters match separately sourced offerings; they do not establish a specific trip or a guide’s personal expertise.</p>}
  <p className="muted">Search recognizes common nicknames and small spelling mistakes. Check the captain and business name before choosing a profile.</p>
  <div className="search-actions">
   <button type="button" onClick={()=>void copyLink()}>Copy search link</button>
   <Link href={directoryUrl(selection)}>Open search in directory</Link>
   <button type="button" onClick={()=>change(DEFAULT_DIRECTORY_STATE)}>Clear all filters</button>
   <span role="status">{copyStatus}</span>
   {fallback&&<label>Search link<input readOnly value={typeof window==='undefined'?'':window.location.origin+directoryUrl(selection)} onFocus={e=>e.currentTarget.select()}/></label>}
  </div>
  {(q||state!=='All'||area!=='All areas'||waterway!=='All advertised waters'||species!=='All species'||method!=='All methods')&&<div className="active-filters" aria-label="Active filters"><strong>Active filters:</strong>
   {q&&<button type="button" onClick={()=>{change({query:'',page:1});searchRef.current?.focus()}}>Remove search: {q}</button>}
   {state!=='All'&&<button type="button" onClick={()=>{setRegion('All');allRef.current?.focus()}}>Remove state: {state}</button>}
   {area!=='All areas'&&<button type="button" onClick={()=>{change({area:'All areas',page:1});areaRef.current?.focus()}}>Remove area: {area}</button>}
   {species!=='All species'&&<button type="button" onClick={()=>{change({species:'All species',page:1});speciesRef.current?.focus()}}>Remove species: {species}</button>}
   {method!=='All methods'&&<button type="button" onClick={()=>{change({method:'All methods',page:1});methodRef.current?.focus()}}>Remove method: {method}</button>}
   {waterway!=='All advertised waters'&&<button type="button" onClick={()=>{change({waterway:'All advertised waters',page:1});waterRef.current?.focus()}}>Remove waterway: {waterway}</button>}
  </div>}
  <div ref={resultsRef} tabIndex={-1} className="results-heading" role="status" aria-live="polite" aria-atomic="true"><strong>{filtered.length.toLocaleString()} captain listings</strong>
   <span>{q.trim()?'Closest matches first':'A–Z'} · Page {current} of {pages}</span>
  </div>
  <div className="guide-results">{filtered.slice((current-1)*size,current*size).map(g=>
   <div className="saved-guide-row" key={g.id}>
    <Link className="guide-result" href={{pathname:g.href,query:{returnTo:directoryUrl(selection)}}}>
     <div className="rating-tile"><strong>—</strong><span>Reviews unavailable</span></div>
     <div className="guide-result-body">
      <div className="guide-result-top"><h3>{g.name}</h3>
       <span className="listing-chip">{g.states.join(' + ')}</span>
      </div>
      {(guideSearchScore(g,q)??0)>=60&&<p className="guide-meta"><strong>Similar spelling match</strong> · Confirm the person and business.</p>}
      <p className="outfit-name">{g.business||'Fishing guide'}</p>
      {g.searchAliases.length>0&&<p className="guide-meta">Source-listed names (business or person): {g.searchAliases.join(' · ')}</p>}
      {g.advertisedWaters.length>0&&<p className="guide-meta">Advertised waters (source-linked): {g.advertisedWaters.slice(0,3).join(' · ')}{g.advertisedWaters.length>3?' · + more':''}</p>}
      <p className="guide-meta">{g.source==='Oregon registry'?'Imported registration zones':'Imported directory areas / notes'}: {g.areas.slice(0,3).join(' · ')||'Not specified'}{g.areas.length>3?' · + more':''}</p>
      <p className="guide-submeta">Imported source listing · Review data unavailable · Current credentials not independently checked</p>
     </div><span className="result-chevron">›</span>
    </Link>
   </div>)}
  </div>
  {!filtered.length&&<DirectoryEmptyState entries={entries} selection={selection} onChoose={next=>{change(next);resultsRef.current?.focus()}}/>}
  {pages>1&&<div className="pager"><button disabled={current===1} onClick={()=>change({page:Math.max(1,current-1)})}>← Previous</button>
   <span>Page {current} / {pages}</span>
   <button disabled={current===pages} onClick={()=>change({page:Math.min(pages,current+1)})}>Next →</button>
  </div>}
 </section>;
}
