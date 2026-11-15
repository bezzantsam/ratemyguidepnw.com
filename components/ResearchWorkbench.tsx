'use client';
import {useState} from 'react';
import {buildResearchHandoff,decisionError,emptyDecision,filterResearchQueue,researchKey,RESEARCH_STATES,safeResearchUrl,type ResearchQueue,type ResearchDecisions,type ResearchDecision,type ResearchState} from '@/lib/research-workbench';

export default function ResearchWorkbench({queue}:{queue:ResearchQueue}){
 const [query,setQuery]=useState(''),[type,setType]=useState('all'),[state,setState]=useState('all');
 const [decisions,setDecisions]=useState<ResearchDecisions>({});
 const [selected,setSelected]=useState(queue.pendingEntities[0]?researchKey(queue.pendingEntities[0]):'');
 const [message,setMessage]=useState('');
 const visible=filterResearchQueue(queue.pendingEntities,decisions,query,type,state);
 const entity=visible.find(item=>researchKey(item)===selected)??visible[0];
 const key=entity?researchKey(entity):'';
 const decision=decisions[key]??emptyDecision();
 const error=decisionError(decision);
 const touched=Object.values(decisions).filter(item=>item.state!=='unreviewed'||item.note.trim()||item.evidenceUrl.trim()).length;
 function update(patch:Partial<ResearchDecision>){setDecisions(previous=>({...previous,[key]:{...(previous[key]??emptyDecision()),...patch}}));setMessage('');}
 function download(){
  try{
   const handoff=buildResearchHandoff(queue,decisions,new Date().toISOString());
   if(!handoff.items.length){setMessage('Add a note or review state before exporting.');return;}
   const url=URL.createObjectURL(new Blob([JSON.stringify(handoff,null,2)+'\n'],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download='guide-research-handoff.json';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage(`Exported ${handoff.items.length} research notes. No profiles were published.`);
  }catch(cause){setMessage(cause instanceof Error?cause.message:'Unable to export research notes.');}
 }
 return <main className="research-workbench">
  <div className="research-heading"><div><p className="eyebrow">LOCAL RESEARCH WORKBENCH</p><h1>Resolve the next profile.</h1><p className="lead">One identity, one source, one clear next step.</p></div><button className="button" onClick={download} disabled={!touched}>Export handoff ({touched})</button></div>
  <p className="research-notice">Development only. Notes stay in this tab until you export them; refreshing clears them. This screen cannot publish profiles, merge people or verify credentials.</p>
  <div className="research-summary"><span><strong>{queue.pendingEntities.length}</strong> pending entities</span><span><strong>{queue.crossStateCandidates.length}</strong> cross-state matches to review</span><span>Source check: <strong>{queue.checkedOn}</strong></span></div>
  <div className="research-filters">
   <label>Search names or research notes<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Try Outlaw, Kodi or captain…"/></label>
   <label>Entity type<select value={type} onChange={event=>setType(event.target.value)}><option value="all">All entities</option><option value="person">People</option><option value="vessel">Vessels</option><option value="business">Businesses</option></select></label>
   <label>Review state<select value={state} onChange={event=>setState(event.target.value)}><option value="all">All review states</option>{Object.entries(RESEARCH_STATES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  </div>
  <p role="status" className="muted">{message||`${visible.length} matching entities · ${touched} with local notes or decisions`}</p>
  {entity?<div className="research-layout">
   <nav className="research-queue" aria-label="Research entities">{visible.map(item=>{
    const id=researchKey(item);return <button key={id} aria-pressed={id===key} onClick={()=>setSelected(id)}><small>{item.entityType}</small><strong>{item.publicName}</strong><span>{RESEARCH_STATES[(decisions[id]??emptyDecision()).state]}</span></button>;
   })}</nav>
   <article className="research-detail" aria-labelledby="research-entity-heading">
    <p className="eyebrow">{entity.entityType} · MANUAL REVIEW REQUIRED</p><h2 id="research-entity-heading">{entity.publicName}</h2>
    <div className="research-facts"><span>Directory match: <strong>{entity.directoryId??'Not established'}</strong></span><span>Credentials: <strong>Unknown</strong></span></div>
    <section><h3>What needs resolving</h3><p>{entity.reason}</p></section>
    <section><h3>Existing source lead</h3>{entity.sourceUrl&&safeResearchUrl(entity.sourceUrl)?<><a className="research-source" href={safeResearchUrl(entity.sourceUrl)!} target="_blank" rel="noopener noreferrer">{entity.sourceUrl} ↗</a><p className="muted">A research lead, not proof of every claim above. Open it and check the specific relationship.</p></>:<p className="muted">No public source link recorded. Leave identity and credential gaps unresolved until supported.</p>}</section>
    {entity.incomingClaims?.length ? <section><h3>Latest research handoff</h3>
     {entity.incomingClaims.map((claim,index)=><div className="research-claim" key={index}>
      <p><strong>{claim.basis==='operator_page_checked'?'Operator page checked':'Supplied research · needs source check'}</strong></p>
      <p>{claim.claim}</p>
      {claim.sourceUrl&&safeResearchUrl(claim.sourceUrl)&&<a className="research-source" href={safeResearchUrl(claim.sourceUrl)!} target="_blank" rel="noopener noreferrer">Open claim source ↗</a>}
      <small>Reported observation: {claim.reportedObservedOn}{claim.checkedOn?` · Checked here: ${claim.checkedOn}`:' · Not independently checked here'}</small>
     </div>)}
    </section>:null}
    <div className="research-editor">
     <label htmlFor="research-state">Next step<select id="research-state" value={decision.state} onChange={event=>update({state:event.target.value as ResearchState})}>{Object.entries(RESEARCH_STATES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
     <label htmlFor="research-evidence">Supporting evidence URL<input id="research-evidence" type="url" value={decision.evidenceUrl} maxLength={2000} onChange={event=>update({evidenceUrl:event.target.value})} placeholder="https://operator.example/about" aria-describedby={error?'research-error':undefined}/></label>
     <label htmlFor="research-note">Exact supported claim and remaining uncertainty<textarea id="research-note" value={decision.note} maxLength={2000} rows={6} onChange={event=>update({note:event.target.value})} placeholder="Record what the source actually establishes, when you checked it, and what remains unknown."/></label>
     <small>{decision.note.length}/2,000 characters · Changes are local research notes.</small>
     {error&&<p id="research-error" role="alert" className="research-error">{error}</p>}
    </div>
   </article>
  </div>:<div className="card"><h2>No matching research items</h2><p>Try another name or clear the filters.</p><button onClick={()=>{setQuery('');setType('all');setState('all');}}>Clear filters</button></div>}
  <details className="research-policy"><summary>Cross-state candidates and identity rules</summary>
   <p>These possible matches are not merged by this screen.</p><ul>{queue.crossStateCandidates.map(pair=><li key={pair.oregonId}>{pair.oregonId} ↔ {pair.washingtonId} · Manual review required</li>)}</ul>
   <ul>{queue.corrections.map(rule=><li key={rule}>{rule}</li>)}</ul>
  </details>
 </main>;
}
