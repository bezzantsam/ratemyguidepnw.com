'use client';
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState} from 'react';
import {DEFAULT_DIRECTORY_STATE,DIRECTORY_PAGE_SIZE,directoryUrl,parseDirectoryState,type DirectoryState} from '@/lib/directory-url';
import type {DirectoryEntry} from '@/lib/directory';
import {captainTripFacets,directoryEntryInState,directoryMethodLabel,directoryFisheryFacets,directoryMethodGroups,directorySpeciesLabels,directorySpeciesMenu,filterDirectoryEntries,guideSearchScore,locatedGuidePorts,matchingCaptainTrips} from '@/lib/directory-query';
import {charterPorts,filterCharterOfferings,type CharterOffering} from '@/lib/charter-offerings';
import {PUBLIC_ORIGIN} from '@/lib/canonical-share';
import {captainTripKey,captainTripMonths,fetchCaptainTripsForDirectory,type CaptainTrip} from '@/lib/public-captain-trips';
import {fishingOptions} from '@/lib/captain-fishing/catalog.mjs';
import {fetchPublicGuideRatings,guideRatingKey,type GuideRatingSummary} from '@/lib/public-guide-ratings';
import DirectoryEmptyState from './DirectoryEmptyState';
import GuideSearchRating from './GuideSearchRating';

const noCharters: CharterOffering[] = [];
const guideSource=({id,href}:DirectoryEntry)=>({jurisdiction:href.startsWith('/washington/')?'WA' as const:'OR' as const,sourceId:id});

export default function UnifiedSearch({entries:sourceEntries,charters=noCharters,reviewMode=false,reviewEnabled=false,home=false,captainTripsEnabled=false}:{entries:DirectoryEntry[];charters?:CharterOffering[];reviewMode?:boolean;reviewEnabled?:boolean;home?:boolean;captainTripsEnabled?:boolean}){
 const readCaptainTrips=captainTripsEnabled&&!reviewMode;
 const [published,setPublished]=useState<Map<string,CaptainTrip[]>|'error'|null>(null);
 useEffect(()=>{
  if(!readCaptainTrips)return;
  const controller=new AbortController();
  void fetchCaptainTripsForDirectory(controller.signal).then(trips=>{
   if(!controller.signal.aborted)setPublished(trips);
  }).catch(()=>{if(!controller.signal.aborted)setPublished('error');});
  return ()=>controller.abort();
 },[readCaptainTrips]);
 const entries=useMemo(()=>readCaptainTrips&&published instanceof Map&&published.size
  ?sourceEntries.map(entry=>{
   const captainTrips=published.get(captainTripKey(guideSource(entry)));
   return captainTrips?.length?{...entry,captainTrips}:entry;
  }):sourceEntries,[sourceEntries,readCaptainTrips,published]);
 const projectionPending=readCaptainTrips&&published===null;
 const [selection,setSelection]=useState<DirectoryState>(DEFAULT_DIRECTORY_STATE);
 const [selectionRestored,setSelectionRestored]=useState(false);
 const [copyStatus,setCopyStatus]=useState('');
 const [fallback,setFallback]=useState(false);
 const resultsRef=useRef<HTMLDivElement>(null);
 const searchRef=useRef<HTMLInputElement>(null),areaRef=useRef<HTMLSelectElement>(null),waterRef=useRef<HTMLSelectElement>(null),speciesRef=useRef<HTMLSelectElement>(null),methodRef=useRef<HTMLSelectElement>(null),allRef=useRef<HTMLButtonElement>(null);
 const gearRef=useRef<HTMLSelectElement>(null),monthRef=useRef<HTMLSelectElement>(null);
 const {query:q,state,area,waterway,species,method,gear,month,page}=selection;
 const captainFilters={state,sourceZone:area,advertisedWater:waterway,species,method,gear,month,query:q,identityOnly:reviewMode};
 const routeBase=reviewMode?'/write-review':'/guides';
 const resultsUrl=directoryUrl(selection,home?'/':routeBase);
 const shareUrl=PUBLIC_ORIGIN+directoryUrl(selection,routeBase);
 const size=DIRECTORY_PAGE_SIZE;
 useEffect(()=>{
  if(projectionPending)return;
  function restore(){
   const next=parseDirectoryState(window.location.search,entries,charters,reviewMode);
   setSelection(next);
   setSelectionRestored(true);
   const query=directoryUrl(next).slice('/guides'.length);
   if(published!=='error'&&window.location.search!==query)window.history.replaceState(null,'',window.location.pathname+query);
  }
  restore();window.addEventListener('popstate',restore);
  return ()=>window.removeEventListener('popstate',restore);
 },[entries,charters,reviewMode,projectionPending,published]);
 function change(patch:Partial<DirectoryState>,replace=false){
  const next=parseDirectoryState(directoryUrl({...selection,...patch}).slice('/guides'.length),entries,charters,reviewMode);
  setSelection(next);setCopyStatus('');setFallback(false);
  const query=directoryUrl(next).slice('/guides'.length);
  const target=window.location.pathname+query;
  if(target!==window.location.pathname+window.location.search){
   if(replace)window.history.replaceState(null,'',target);else window.history.pushState(null,'',target);
  }
 }
 async function copyLink(){
  try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(shareUrl);setCopyStatus('Search link copied.');setFallback(false)}
  catch{setFallback(true);setCopyStatus('Copy the search link from the field below.')}
 }
 const filtered=useMemo(()=>filterDirectoryEntries(entries,{
  state,sourceZone:area,advertisedWater:waterway,species,method,gear,month,query:q,identityOnly:reviewMode
 },charters.flatMap(charterPorts)),[entries,charters,q,state,area,waterway,species,method,gear,month,reviewMode]);

 const areas=useMemo(()=>
  ['All areas',...new Set(entries.filter(g=>state==='All'||g.states.includes(state as 'Oregon'|'Washington'))
    .flatMap(g=>g.areas))].sort((a,b)=>a==='All areas'?-1:b==='All areas'?1:a.localeCompare(b)),
 [entries,state]);

 const facets=useMemo(()=>entries.filter(entry=>directoryEntryInState(entry,state,!reviewMode))
  .map(entry=>directoryFisheryFacets(entry,state)),[entries,state,reviewMode]);
 const captainFacets=useMemo(()=>reviewMode?[]:entries.map(entry=>captainTripFacets(entry,state)),[entries,state,reviewMode]);
 const hasCaptainTrips=!reviewMode&&entries.some(entry=>entry.captainTrips?.length);
 const gearOptions=fishingOptions.filter(option=>option.kind==='gear');
 const scopedCharters=useMemo(()=>charters.filter(offer=>state==='All'||offer.state===state),[charters,state]);
 const waters=useMemo(()=>['All advertised waters',...new Set([
  ...[...facets,...captainFacets].flatMap(facet=>facet.waters),
  ...scopedCharters.flatMap(offer=>[...(offer.waterway?[offer.waterway]:[]),...(offer.waters??[])]),
 ])].sort((a,b)=>a==='All advertised waters'?-1:b==='All advertised waters'?1:a.localeCompare(b)),[facets,captainFacets,scopedCharters]);
 const speciesOptions=useMemo(()=>[...new Set([
  ...[...facets,...captainFacets].flatMap(facet=>directorySpeciesLabels(facet.species)),
  ...scopedCharters.flatMap(offer=>directorySpeciesLabels(offer.species?[offer.species]:[])),
 ])].sort(),[facets,captainFacets,scopedCharters]);
 const speciesMenu=directorySpeciesMenu(speciesOptions,species);
 const commonSpecies=new Set(speciesMenu.groups.flatMap(group=>group.choices));
 const captainSpecies=[...new Set(captainFacets.flatMap(facet=>directorySpeciesLabels(facet.species)))]
  .filter(label=>!commonSpecies.has(label)).sort();
 const methodGroups=useMemo(()=>directoryMethodGroups([
  ...facets.flatMap(facet=>facet.methods),
  ...scopedCharters.flatMap(offer=>offer.method?[offer.method]:[]),
 ]),[facets,captainFacets,scopedCharters]);
 const guidePorts=useMemo(()=>locatedGuidePorts(entries),[entries]);
 const matchingCharters=filterCharterOfferings(charters,selection,guidePorts);
 const pages=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(page,pages);
 const visibleGuides=useMemo(()=>filtered.slice((current-1)*size,current*size),[filtered,current,size]);
 const readRatings=reviewEnabled&&!reviewMode;
 const [ratings,setRatings]=useState<{guides:DirectoryEntry[];summaries:Map<string,GuideRatingSummary>}|null>(null);
 useEffect(()=>{
  if(!readRatings||!selectionRestored||projectionPending||!visibleGuides.length)return;
  const controller=new AbortController();
  const timer=window.setTimeout(()=>{
   const sources=visibleGuides.map(guideSource);
   void fetchPublicGuideRatings(sources,controller.signal).then(summaries=>{
    if(!controller.signal.aborted)setRatings({guides:visibleGuides,summaries});
   }).catch(()=>{
    if(!controller.signal.aborted)setRatings({guides:visibleGuides,summaries:new Map()});
   });
  },150);
  return ()=>{window.clearTimeout(timer);controller.abort()};
 },[readRatings,selectionRestored,projectionPending,visibleGuides]);
 const visibleRatings=ratings?.guides===visibleGuides?ratings.summaries:null;
 const setRegion=(s:DirectoryState['state'])=>change({state:s,area:'All areas',waterway:'All advertised waters',species:'All species',method:'All methods',gear:undefined,month:undefined,page:1});

 return <section className="directory-panel">
  <h2>{reviewMode?'Find the guide you fished with':'Find a captain'}</h2>
  <p className="directory-source-disclosure">Imported location and registration fields are historical source categories, not confirmed fishing ports. Advertised fishing waters are a small, source-linked research pilot and do not certify active operations or licensing.</p>
  {entries.some(g=>g.testFixture)&&<p className="directory-source-disclosure">Synthetic test fixture — not a real offering.</p>}
  <div className="state-switch" aria-label="Filter guides by state">
   {(['All','Oregon','Washington'] as const).map(s=><button key={s} ref={s==='All'?allRef:undefined} type="button" className={state===s?'active':''}
    aria-pressed={state===s} onClick={()=>setRegion(s)}>{s==='All'?'All guides':s}</button>)}
  </div>
  <div className="searchbar">
   <label>Captain, business, operating name, or registration
    <input ref={searchRef} type="search" value={q} maxLength={120} onChange={e=>change({query:e.target.value,page:1},true)}
     placeholder="Try a guide name, shad, squid, or bottom fishing"/>
   </label>
   <label>Area
    <select ref={areaRef} value={area} onChange={e=>change({area:e.target.value,page:1})}>
     {areas.map(a=><option key={a}>{a}</option>)}
    </select>
   </label>
   <label>{hasCaptainTrips?'Fishing waters or launch ports':'Fishing waters'}
    <select ref={waterRef} value={waterway} onChange={e=>change({waterway:e.target.value,page:1})}>
     {waters.map(a=><option key={a} value={a}>{a==='All advertised waters'?'All waters':a}</option>)}
    </select>
   </label>
   {(speciesMenu.groups.length>0||speciesMenu.selectedOnly||captainSpecies.length>0)&&<label>Species
    <select ref={speciesRef} value={species} onChange={e=>change({species:e.target.value,page:1})}>
     <option>All species</option>
     {speciesMenu.selectedOnly&&!captainSpecies.includes(species)&&<option value={species} hidden>{species}</option>}
     {speciesMenu.groups.map(group=><optgroup key={group.label} label={group.label}>
      {group.choices.map(choice=><option key={choice}>{choice}</option>)}
     </optgroup>)}
     {captainSpecies.length>0&&<optgroup label="Captain trip species">
      {captainSpecies.map(label=><option key={label}>{label}</option>)}
     </optgroup>}
    </select>
   </label>}
   <label>Fishing methods
    <select ref={methodRef} value={method} onChange={e=>change({method:e.target.value,page:1})}>
     <option>All methods</option>
     <optgroup label="Methods">{methodGroups.methods.map(label=><option key={label}>{label}</option>)}</optgroup>
     <optgroup label="Gear">{methodGroups.gear.map(label=><option key={label}>{label}</option>)}</optgroup>
    </select>
   </label>
   {(hasCaptainTrips||gear||month)&&<><label>Trip gear
    <select ref={gearRef} value={gear??''} onChange={e=>change({gear:e.target.value||undefined,page:1})}>
     <option value="">All gear</option>
     {gearOptions.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
   </label>
   <label>Trip month
    <select ref={monthRef} value={month??''} onChange={e=>change({month:Number(e.target.value)||undefined,page:1})}>
     <option value="">All months</option>
     {captainTripMonths.map((label,index)=><option key={label} value={index+1}>{label}</option>)}
    </select>
   </label></>}
  </div>
  <p className="muted">Search recognizes common nicknames and small spelling mistakes. Check the captain and business name before choosing a profile.</p>
  <div className="search-actions">
   <button type="button" onClick={()=>void copyLink()}>Copy search link</button>
   <Link href={directoryUrl(selection)}>Open search in directory</Link>
   <button type="button" onClick={()=>change({...DEFAULT_DIRECTORY_STATE,gear:undefined,month:undefined})}>Clear all filters</button>
   <span role="status">{copyStatus}</span>
   {fallback&&<label>Search link<input readOnly value={shareUrl} onFocus={e=>e.currentTarget.select()}/></label>}
  </div>
  {(q||state!=='All'||area!=='All areas'||waterway!=='All advertised waters'||species!=='All species'||method!=='All methods'||gear||month)&&<div className="active-filters" aria-label="Active filters"><strong>Active filters:</strong>
   {q&&<button type="button" onClick={()=>{change({query:'',page:1});searchRef.current?.focus()}}>Remove search: {q}</button>}
   {state!=='All'&&<button type="button" onClick={()=>{setRegion('All');allRef.current?.focus()}}>Remove state: {state}</button>}
   {area!=='All areas'&&<button type="button" onClick={()=>{change({area:'All areas',page:1});areaRef.current?.focus()}}>Remove area: {area}</button>}
   {species!=='All species'&&<button type="button" onClick={()=>{change({species:'All species',page:1});speciesRef.current?.focus()}}>Remove species: {species}</button>}
   {method!=='All methods'&&<button type="button" onClick={()=>{change({method:'All methods',page:1});methodRef.current?.focus()}}>Remove method: {method}</button>}
   {waterway!=='All advertised waters'&&<button type="button" onClick={()=>{change({waterway:'All advertised waters',page:1});waterRef.current?.focus()}}>Remove waterway: {waterway}</button>}
   {gear&&<button type="button" onClick={()=>{change({gear:undefined,page:1});gearRef.current?.focus()}}>Remove gear: {directoryMethodLabel(gear)}</button>}
   {month&&<button type="button" onClick={()=>{change({month:undefined,page:1});monthRef.current?.focus()}}>Remove month: {captainTripMonths[month-1]}</button>}
  </div>}
  {projectionPending&&<p className="guide-meta" role="status">Loading captain-provided trips…</p>}
  {readCaptainTrips&&published==='error'&&<p className="guide-meta" role="status">Captain-provided trips are temporarily unavailable.</p>}
  <div ref={resultsRef} tabIndex={-1} className="results-heading" role="status" aria-live="polite" aria-atomic="true"><strong>{filtered.length.toLocaleString()} captain {filtered.length===1?'listing':'listings'}</strong>
   {matchingCharters.length>0&&<span>{matchingCharters.length} charter {matchingCharters.length===1?'offering':'offerings'}</span>}
   <span>{q.trim()?'Closest matches first':'A–Z'} · Page {current} of {pages}</span>
  </div>
  <div className="guide-results">{visibleGuides.map(g=>{
   const captainTrips=matchingCaptainTrips(g,captainFilters);
   const {species:targets,methods,trips,waters}=directoryFisheryFacets(g,state);
   const editorial=(g.editorialFishing??[]).filter(fact=>[...targets,...methods].includes(fact.value));
   const labels=[...new Set([...targets,...methods,...trips])].filter(label=>
    !editorial.some(fact=>fact.value===label)||g.fisheryOfferings?.some(offer=>
     offer.value===label||offer.relationship?.species===label||offer.relationship?.method===label));
   return <div className="saved-guide-row" key={g.id}>
    <Link className="guide-result" href={{pathname:g.href,query:reviewMode&&reviewEnabled?{returnTo:resultsUrl,intent:'review'}:{returnTo:resultsUrl},hash:reviewMode&&reviewEnabled?'write-review':undefined}}>
     {readRatings?<GuideSearchRating summary={visibleRatings?.get(guideRatingKey(guideSource(g)))} loading={!visibleRatings}/>
      :<div className="rating-tile"><strong>—</strong><span>{reviewEnabled?'View reviews':'Reviews unavailable'}</span></div>}
     <div className="guide-result-body">
      <div className="guide-result-top"><h3>{g.name}</h3>
       <span className="listing-chip">{g.states.join(' + ')}</span>
      </div>
      {(guideSearchScore(g,q)??0)>=60&&<p className="guide-meta"><strong>Similar spelling match</strong> · Confirm the person and business.</p>}
      <p className="outfit-name">{g.business||'Fishing guide'}</p>
      {g.searchAliases.some(name=>!g.editorialSearchAliases?.some(alias=>alias.value===name))&&<p className="guide-meta">Other names (business or person): {g.searchAliases.filter(name=>!g.editorialSearchAliases?.some(alias=>alias.value===name)).join(' · ')}</p>}
      {g.editorialSearchAliases?.map(alias=><p className="guide-meta" key={`${alias.value}:${alias.attributedTo}`}>Editorial search name supplied by {alias.attributedTo}: {alias.value}</p>)}
      {g.businessSearchKeywords?.map(keyword=><p className="guide-meta" key={keyword.value}>Business search keyword supplied by {keyword.attributedTo}: {[keyword.value,...(keyword.variants??[])].join(' / ')}</p>)}
      {!directoryEntryInState(g,state)&&<p className="guide-meta">{state} fishing offering</p>}
      {labels.length>0&&
        <p className="guide-meta">Fishing targets and trips: {labels.map(label=>{
          const scope=g.businessAdvertisedOfferings?.includes(label) ? ' (operator team)' : '';
          const category=methods.includes(label)&&!targets.includes(label) ? ' (method)' : '';
          return label+category+scope;
        }).join(' · ')}</p>}
      {editorial.map(fact=><p className="guide-meta" key={fact.value}>Editorial fishing note supplied by {fact.attributedTo}: {fact.value}</p>)}
      {captainTrips.slice(0,2).map(trip=><p className="guide-meta" key={trip.id}>
        <strong>Captain-provided trip:</strong> {trip.title} · {[trip.waterway,trip.launchArea,trip.jurisdiction].filter(Boolean).join(' · ')}
      </p>)}
      {waters.length>0&&<p className="guide-meta">Advertised waters (source-linked): {waters.slice(0,3).join(' · ')}{waters.length>3?' · + more':''}</p>}
      <p className="guide-meta">{g.source==='Oregon registry'?'Imported registration zones':'Imported directory areas / notes'}: {g.areas.slice(0,3).join(' · ')||'Not specified'}{g.areas.length>3?' · + more':''}</p>
      <p className="guide-submeta">Imported source listing · {reviewEnabled?'See profile for reviews':'Review data unavailable'} · Current credentials not independently checked</p>
     </div><span className="result-chevron">›</span>
    </Link>
   </div>})}
  </div>
  {matchingCharters.length>0&&<section className="section" aria-labelledby="charter-offerings-title">
   <h3 id="charter-offerings-title">Charter offerings</h3>
   <ul>{matchingCharters.map(offer=><li key={JSON.stringify([offer.businessId??offer.operator,offer.city,offer.state,offer.boat,offer.trip??offer.species??offer.method,offer.sourceUrl])}>
    <strong>{offer.operator}</strong>{offer.boat&&<> · {offer.boat}</>} · {offer.operatorBaseOnly?'Operator base: ':''}{offer.city}, {offer.state} · {offer.trip??offer.species??offer.method}{offer.boat&&' · By request'}{offer.businessId&&' · Operator team'}{offer.namedGuide&&<> · Named guide: {offer.namedGuide}</>}{!!offer.waters?.length&&<> · {offer.waters.join(' · ')}</>}
    {' · '}<a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${offer.sourceLabel ?? 'Trip source'} for ${offer.operator}`}>{offer.sourceLabel ?? 'Trip source'} ↗</a>
   </li>)}</ul>
  </section>}
  {!filtered.length&&!matchingCharters.length&&<DirectoryEmptyState entries={entries} selection={selection} onChoose={next=>{change(next);resultsRef.current?.focus()}}/>}
  {pages>1&&<div className="pager"><button disabled={current===1} onClick={()=>change({page:Math.max(1,current-1)})}>← Previous</button>
   <span>Page {current} / {pages}</span>
   <button disabled={current===pages} onClick={()=>change({page:Math.min(pages,current+1)})}>Next →</button>
  </div>}
 </section>;
}
