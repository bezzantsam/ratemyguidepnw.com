import {guideEnrichmentFor,operatorSourceUrl} from '@/lib/guide-enrichment';
import {oregonGuides} from '@/lib/registry';
import {editorialGuideCorrections} from '@/lib/editorial-guide-corrections';
import {attributesFor} from '@/lib/guide-attributes-server';

const sourceLabels={
 operator_site:'Operator website',
 third_party_directory:'Public third-party directory',
} as const;

/** Informational source references, never an official license or identity check. */
export default function GuideEnrichmentPanel({registration}:{registration:string}){
 const enrichment=guideEnrichmentFor(registration);
 const facts=attributesFor(registration);
 const attributes=facts.filter(item=>item.evidence_scope!=='participant_reports');
 const reports=facts.filter(item=>item.evidence_scope==='participant_reports');
 const registered=oregonGuides.find(guide=>guide.registration===registration);
 const editorial=registered?editorialGuideCorrections({id:registration,name:registered.name,business:registered.business})
   .filter(item=>item.kind!=='search_alias'):[];
 const operatorLink=operatorSourceUrl(enrichment);
 if((!enrichment || (enrichment.advertisedWaters.length === 0 && !enrichment.sourceLinks?.length)) && !facts.length && !editorial.length)return null;

 return <section className="section card guide-enrichment" aria-labelledby="guide-enrichment-title">
   <h2 id="guide-enrichment-title">{attributes.length ? 'Advertised trips and sources' : (reports.length || editorial.length) ? 'Trip evidence and sources' : enrichment?.advertisedWaters.length ? 'Publicly advertised fishing waters' : 'Public business sources'}</h2>
   {operatorLink&&<p><a className="button" href={operatorLink} target="_blank" rel="noopener noreferrer">Visit listed operator page ↗</a><span className="muted">Check current trips, availability and booking directly with the operator.</span></p>}
   {!!enrichment?.searchAliases.length&&<p><strong>Other public search names:</strong> {enrichment?.searchAliases.join(' · ')}</p>}
   <ul className="guide-enrichment-waters">
     {enrichment?.advertisedWaters.map(water=>
       <li key={water.name}>
         <strong>{water.name}</strong>
         <a href={water.sourceUrl} target="_blank" rel="noopener noreferrer">
           {sourceLabels[water.sourceType]} ↗ {water.observedOn && `· Observed ${water.observedOn}`}
         </a>
       </li>
     )}
   </ul>
   {enrichment?.sourceLinks?.length ? <div>
     <h3>Business and operating-name sources</h3>
     <ul>{enrichment.sourceLinks.map(source=><li key={source.url}>
       <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a>
       {' · '}{sourceLabels[source.sourceType]} · Observed {source.observedOn}
     </li>)}</ul>
     <p className="muted">A commercial roster listing reports an affiliation; it does not verify credentials or guarantee the listing is current.</p>
   </div> : null}
   {attributes.length>0&&<div>
     {attributes.some(item=>new URL(item.source.url).hostname==='fixture.invalid')&&<p>Synthetic test fixture — not a real offering.</p>}
     <ul>{attributes.map((item,index)=><li key={`${item.guide_id}-${item.kind}-${item.value}-${index}`}>
       <strong>{item.value}</strong> · <a href={item.source.url} target="_blank" rel="noopener noreferrer" aria-label={`Source for ${item.value}`}>{item.evidence_scope==='operator_advertises'&&item.kind!=='person_name'&&item.kind!=='business_name'?(item.source.source_type==='operator_site'?'Trip details':'Trip listing'):item.source.source_type==='operator_site'?'Operator page':'Directory source'} ↗</a>
       {item.supporting_sources?.map(source=>source.trip_label&&<span key={source.url}> · <a href={source.url} target="_blank" rel="noopener noreferrer">{source.trip_label} ↗</a></span>)}
       {item.offering_scope==='operator_business'&&<span> · Operator team trip. Ask who will guide.</span>}
       {item.location&&<span> · {item.location.city}, {item.location.state}</span>}
       {item.fishery_jurisdiction&&!item.location&&<span> · Fishery: {item.fishery_jurisdiction==='WA'?'Washington':'Oregon'}</span>}
       {item.trip_note&&<span> · {item.trip_note}</span>}
       {item.relationship&&<span> · Source explicitly connects: {[item.relationship.species,item.relationship.method,item.relationship.waterway].filter(Boolean).join(' · ')}</span>}
     </li>)}</ul>
   </div>}
   {editorial.length>0&&<div>
     <h3>Editorial fishing notes</h3>
     <ul>{editorial.map(item=><li key={item.value}><strong>{item.value}</strong> · Supplied by {item.provenance.attributed_to} · <a href={item.provenance.reference}>Editorial source</a></li>)}</ul>
   </div>}
   {reports.length>0&&<div>
     <h3>Participant reports</h3>
     <ul>{reports.map(item=><li key={item.source.url}><strong>{item.value}</strong> · {item.trip_note} · <a href={item.source.url} target="_blank" rel="noopener noreferrer">Participant source ↗</a></li>)}</ul>
     <p className="muted">Participant reports describe past trips. Ask the operator about current offerings.</p>
   </div>}
   <p className="muted">Confirm trip availability with the operator. Sources describe individual offerings and business names. Separate listings do not establish a combined trip or verify licensing.</p>
 </section>;
}
