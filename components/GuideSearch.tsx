'use client';
import {useMemo,useState} from 'react';
import type {RegistryGuide} from '@/lib/registry';
import {RegistryGuideCard} from './RegistryGuideCard';

export default function GuideSearch({guides}:{guides:RegistryGuide[]}){
 const [q,setQ]=useState('');
 const [area,setArea]=useState('All areas');
 const [page,setPage]=useState(1);
 const pageSize=60;
 const areas=['All areas',...Array.from(new Set(guides.flatMap(g=>g.areas))).sort((a,b)=>a.localeCompare(b))];
 const filtered=useMemo(()=>guides.filter(g=>(!q||[g.name,g.business||'',g.registration,...g.areas].join(' ').toLowerCase().includes(q.toLowerCase()))&&(area==='All areas'||g.areas.includes(area))).sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base'})||a.registration.localeCompare(b.registration)),[guides,q,area]);
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const currentPage=Math.min(page,pages);
 const shown=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
 return <><div className="searchbar">
  <label>Search captain, outfit, registration, or area<input value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder="e.g., Columbia, charter, guide name"/></label>
  <label>Registered service area<select value={area} onChange={e=>{setArea(e.target.value);setPage(1)}}>{areas.map(a=><option key={a} value={a}>{a}</option>)}</select></label>
 </div><p className="muted">Alphabetical by captain name (A–Z) · {filtered.length} matching listings · Page {currentPage} of {pages}</p>
 <div className="grid">{shown.map(g=><RegistryGuideCard key={g.registration} guide={g}/>)}</div>
 {pages>1&&<div className="pager"><button disabled={currentPage===1} onClick={()=>setPage(v=>Math.max(1,v-1))}>← Previous</button><span>Page {currentPage} / {pages}</span><button disabled={currentPage===pages} onClick={()=>setPage(v=>Math.min(pages,v+1))}>Next →</button></div>}
 </>;
}
