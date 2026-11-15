import {guideEnrichmentFor} from '@/lib/guide-enrichment';
import {attributesFor} from '@/lib/guide-attributes-server';

const sourceLabels={
 operator_site:'Operator website',
 third_party_directory:'Public third-party directory',
} as const;

/** Informational source references, never an official license or identity check. */
export default function GuideEnrichmentPanel({registration}:{registration:string}){
 const enrichment=guideEnrichmentFor(registration);
 const attributes=attributesFor(registration);
 const operatorLink=enrichment?.sourceLinks?.find(source=>source.sourceType==='operator_site');
 if((!enrichment || (enrichment.advertisedWaters.length === 0 && !enrichment.sourceLinks?.length)) && !attributes.length)return null;

 return <section className="section card guide-enrichment" aria-labelledby="guide-enrichment-title">
   <p className="eyebrow">PUBLIC SOURCE RESEARCH · LIMITED PILOT</p>
   <h2 id="guide-enrichment-title">{enrichment?.advertisedWaters.length ? 'Publicly advertised fishing waters' : 'Public business sources'}</h2>
   <p className="muted">These are named on linked operator or third-party pages, not verified departure ports, current bookings, active licenses, or endorsements by RateMyGuidePNW. Confirm availability directly before booking.</p>
   {operatorLink&&<p><a className="button" href={operatorLink.url} target="_blank" rel="noopener noreferrer">Visit guide website ↗</a><span className="muted">Check current trips, availability and booking directly with the operator.</span></p>}
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
     <h3>Source-listed offerings and names</h3>
     {attributes.some(item=>new URL(item.source.url).hostname==='fixture.invalid')&&<p>Synthetic test fixture — not a real offering.</p>}
     <p className="muted">These are source descriptions of a business or listing, not proof of individual expertise. Separate items do not establish a combined trip.</p>
     <ul>{attributes.map((item,index)=><li key={`${item.guide_id}-${item.kind}-${item.value}-${index}`}>
       <strong>{item.kind.replace('_',' ')}: {item.value}</strong> · {item.source.source_type==='operator_site'?'Operator website':item.source.source_type==='industry_directory'?'Industry directory':'Third-party directory'} · <a href={item.source.url} target="_blank" rel="noopener noreferrer">Source ↗</a> · Reviewed {item.source.reviewed_on}
       {item.relationship&&<span> · Source explicitly connects: {[item.relationship.species,item.relationship.method,item.relationship.waterway].filter(Boolean).join(' · ')}</span>}
     </li>)}</ul>
   </div>}
   <p className="muted">Public-facing names and advertised fisheries do not independently prove that two identities are the same person. Original registration details remain visible separately.</p>
 </section>;
}
