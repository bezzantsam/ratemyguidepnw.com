import {guideEnrichmentFor,type GuideAdvertisedTag} from '@/lib/guide-enrichment';

const sourceLabels={
 operator_site:'Operator website',
 third_party_directory:'Public third-party directory',
} as const;

/** Evidence-backed tags are operator-advertised, not independently certified expertise. */
function SourcedTags({title,tags}:{title:string;tags:GuideAdvertisedTag[]}){
 if(!tags.length)return null;
 return <div>
  <h3>{title}</h3>
  <ul className="guide-enrichment-waters">
   {tags.map(tag=><li key={tag.name}>
    <strong>{tag.name}</strong>{' '}
    <a href={tag.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
     {sourceLabels[tag.sourceType]} ↗ {tag.observedOn&&`· Observed ${tag.observedOn}`}
    </a>
   </li>)}
  </ul>
 </div>;
}

/** A historical government import is useful, but not a validated operator web presence. */
export default function GuideEnrichmentPanel({registration}:{registration:string}){
 const enrichment=guideEnrichmentFor(registration);
 if(!enrichment)return null;
 const operatorLink=enrichment.sourceLinks?.find(source=>source.sourceType==='operator_site');
 const hasEvidence=Boolean(enrichment.sourceLinks?.length||enrichment.advertisedWaters.length);
 const hasOfferings=Boolean(enrichment.advertisedSpecies?.length||enrichment.advertisedTechniques?.length||enrichment.advertisedTripTypes?.length);
 if(!hasEvidence&&!hasOfferings&&!enrichment.registryWebsite)return null;
 return <section className="section card guide-enrichment" aria-labelledby="guide-enrichment-title">
  <p className="eyebrow">PUBLIC SOURCE RESEARCH · NOT CAPTAIN VERIFIED</p>
  <h2 id="guide-enrichment-title">{enrichment.advertisedWaters.length||hasOfferings ? 'Fishing services and public business sources' : 'Public business sources'}</h2>
  <p className="muted">Named fishing waters, species and techniques are taken from attributed public operator or third-party materials. They are not verified departure ports, certified expertise, current bookings, active licenses, or RateMyGuidePNW endorsements. Confirm availability with the operator before booking.</p>
  {operatorLink&&<p><a className="button" href={operatorLink.url} target="_blank" rel="noopener noreferrer nofollow">Visit guide website ↗</a> <span className="muted">External website, current trip availability unconfirmed.</span></p>}
  {enrichment.registryWebsite&&<p className="muted">
    <strong>Website reported in the imported Oregon guide registry: </strong>
    <a href={enrichment.registryWebsite.url} target="_blank" rel="noopener noreferrer nofollow">{enrichment.registryWebsite.importedValue} ↗</a>
    {' '}This historical registry reference has not been independently verified; the address could be old, unrelated or inactive.
  </p>}
  {enrichment.searchAliases.length>0&&<p><strong>Public operating names / search aliases:</strong> {enrichment.searchAliases.join(' · ')}. Business aliases do not prove that two legal identities are the same person.</p>}
  <SourcedTags title="Publicly advertised fishing waters" tags={enrichment.advertisedWaters}/>
  <SourcedTags title="Publicly advertised target species" tags={enrichment.advertisedSpecies??[]}/>
  <SourcedTags title="Fishing techniques mentioned in public trip offerings" tags={enrichment.advertisedTechniques??[]}/>
  <SourcedTags title="Publicly advertised trip types" tags={enrichment.advertisedTripTypes??[]}/>
  {enrichment.sourceLinks?.length ? <div>
   <h3>Public business research sources</h3>
   <ul>{enrichment.sourceLinks.map(source=><li key={source.url}>
    <a href={source.url} target="_blank" rel="noopener noreferrer nofollow">{source.label} ↗</a>
    {' · '}{sourceLabels[source.sourceType]} · Observed {source.observedOn}
   </li>)}</ul>
   <p className="muted">A commercial source may report an affiliation; it does not verify credentials, legal identity or current service availability.</p>
  </div>:null}
  <p className="muted">Angler reviews belong to the individual guide. A business link, shared website or nickname never merges two captain identities or their reviews.</p>
 </section>;
}
