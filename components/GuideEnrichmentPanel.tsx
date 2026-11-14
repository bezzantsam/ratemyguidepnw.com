import {guideEnrichmentFor} from '@/lib/guide-enrichment';

const sourceLabels={
 operator_site:'Operator website',
 third_party_directory:'Public third-party directory',
} as const;

/** Informational source references, never an official license or identity check. */
export default function GuideEnrichmentPanel({registration}:{registration:string}){
 const enrichment=guideEnrichmentFor(registration);
 if(!enrichment)return null;

 return <section className="section card guide-enrichment" aria-labelledby="guide-enrichment-title">
   <p className="eyebrow">PUBLIC SOURCE RESEARCH · LIMITED PILOT</p>
   <h2 id="guide-enrichment-title">Publicly advertised fishing waters</h2>
   <p className="muted">These are named on linked operator or third-party pages, not verified departure ports, current bookings, active licenses, or endorsements by RateMyGuidePNW. Confirm availability directly before booking.</p>
   {enrichment.searchAliases.length>0&&<p><strong>Other public search names:</strong> {enrichment.searchAliases.join(' · ')}</p>}
   <ul className="guide-enrichment-waters">
     {enrichment.advertisedWaters.map(water=>
       <li key={water.name}>
         <strong>{water.name}</strong>
         <a href={water.sourceUrl} target="_blank" rel="noopener noreferrer">
           {sourceLabels[water.sourceType]} ↗
         </a>
       </li>
     )}
   </ul>
   <p className="muted">Public-facing names and advertised fisheries do not independently prove that two identities are the same person. Original registration details remain visible separately.</p>
 </section>;
}
