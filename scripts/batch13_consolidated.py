#!/usr/bin/env python3
"""Build a deterministic, unpublished Batch 13 population candidate."""
import argparse
import copy
import csv
import io
import hashlib
import json
from collections import Counter
from pathlib import Path

import batch13_enrichment_proposal as original
import extended_enrichment_proposal as extended
import batch13_next10_candidates as converter
import batch13_next10_review as next10
import batch13_next10b_review as next10b
import batch13_remaining41 as remaining

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'docs/research'
OUTPUT = RESEARCH / 'BATCH13_CONSOLIDATED_POPULATION.json'
CSV_OUTPUT = RESEARCH / 'BATCH13_CONSOLIDATED_POPULATION.csv'
BATCHES = [
 ('original20','BATCH13_SOURCE_REVIEW_20261115.json',20),
 ('supplemental30','BATCH13_NEXT30_SOURCE_REVIEW_20261115.json',30),
 ('first10','BATCH13_NEXT10_SOURCE_REVIEW_20261115.json',10),
 ('second10','BATCH13_NEXT10B_SOURCE_REVIEW_20261115.json',10),
 ('final41','BATCH13_REMAINING41_SOURCE_REVIEW_20261115.json',41),
]
PINNED = {
 'docs/research/BATCH13_DEDUPED_RESEARCH_MANIFEST_20261115.json':'9a410bebb6d8b65122a709a55615440cad39fa7ad63fd7dd263a3e9d8bae41ad',
 'docs/research/BATCH13_SOURCE_REVIEW_20261115.json':'da334c7ae8e3629691b50a88c7db6b149266e88993b28a5ea9e55efab2c82437',
 'docs/research/BATCH13_NEXT30_SOURCE_REVIEW_20261115.json':'b171cf4fa04ab7a62dee05c8ece0025c8b128e32f384e6ae826a1d372ed6f7e5',
 'docs/research/BATCH13_NEXT10_SOURCE_REVIEW_20261115.json':'677997a85b66be95fc3cd34605332b34310e10f4fc5ad4e86d649b0399bea13c',
 'docs/research/BATCH13_NEXT10B_SOURCE_REVIEW_20261115.json':'0270df337c64f57ad7d089961a1255d58c2573c30bd9117ea0604c9a3ce074d8',
 'docs/research/BATCH13_REMAINING41_SOURCE_REVIEW_20261115.json':'78ffa2ea837d5481bcb002080107ec7a153ef03ccb6fb3e6145628b4c026c3ec',
 'lib/oregon-guides.json':'3f0671e58d8d9f5615ba15668b7043fbc4f11859dafb10cf91068a5eb2a62081',
 'lib/guide-evidence-holds.json':'11921639b83b0c754cf57443f0afe78c61b5d0d02f237ede29a5858344d5fdfc',
}
FIELDS={'advertised_species':'species','advertised_methods':'method','advertised_trip_types':'trip_type',
        'display_names':'person_name','business_names':'business_name','advertised_waters':'waterway'}
SUPPORTED='source_supported_pending_editorial'

def require(ok,message):
 if not ok: raise ValueError(message)

def canonical(value): return json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':'))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path): return json.loads(path.read_text(encoding='utf-8'))
def ensure_unique(rows,key,label):
 ids=[key(x) for x in rows];require(len(ids)==len(set(ids)),'Duplicate '+label);return ids

def build(manifest, batches, registry, holds, converted):
 """Inputs are explicit so conflicts and lost holds can be challenged in tests."""
 manifest_ids=ensure_unique(manifest['records'],lambda x:x['registration_id'],'manifest ID')
 require(len(manifest_ids)==111,'Expected exactly 111 manifest IDs')
 statuses=sorted((r['registration_id'],r['review_status']) for batch,_,_ in BATCHES for r in batches[batch]['records'])
 require(hashlib.sha256(canonical(statuses).encode()).hexdigest()=='24e081209d2a988caaf314469f9049b0274f71d1afeb9f4b93583e995a73064c','Frozen review statuses or holds changed')
 manifest_by={r['registration_id']:r for r in manifest['records']}
 directory={r['registration']:r for r in registry}
 require(len(directory)==len(registry),'Duplicate registry ID')
 held_registry={r['guide_id']:r['reason'] for r in holds['held_guides']}
 require(set(held_registry)=={'OG.0000782','OG.0001224','OG.0001881'},'Original identity holds changed')
 exclusions=copy.deepcopy(holds['excluded_waterways'])
 require(any(x['guide_id']=='OG.0001116' and x['value']=='Grindstone Lakes' for x in exclusions),'Original water exclusion lost')
 seen=set();attrs=[];waters=[];unsupported=[];held=[];conflicts=[];ledger=[];index=[];dedup={}
 def add(target,item):
  # Exact source-specific duplicate only; distinct locators, scopes or relationships remain separate.
  signature=canonical([target,item['guide_id'],item.get('kind'),item['value'],item.get('relationship'),item['source'],item['evidence_scope']])
  if signature not in dedup:
   dedup[signature]=len(attrs if target=='attribute' else waters)
   (attrs if target=='attribute' else waters).append(item)
  return dedup[signature]
 for batch,path,count in BATCHES:
  review=batches[batch];rows=review['records']; require(len(rows)==count,'Unexpected batch size '+batch)
  ensure_unique(rows,lambda r:r['registration_id'],batch+' ID')
  sources=review['sources']
  for row in rows:
   ident=row['registration_id'];require(ident in manifest_by and ident not in seen,'Duplicate or unknown reviewed ID '+ident);seen.add(ident)
   m=manifest_by[ident];require(ident in directory,'Unknown registry ID '+ident);reg=directory[ident]
   require(row['imported_name']==m['imported_name'] and row['imported_business']==m['imported_business'],'Review/manifest identity differs '+ident)
   if 'registry_website' in row: require(row['registry_website']==m['registry_website'],'Review/manifest website differs '+ident)
   require(row['publication_approved'] is False and row['current_credentials_verified'] is False and row['identity']['legal_identity_verified'] is False,'Unsafe record approval '+ident)
   differences=[]
   for mf,rf in [('imported_name','name'),('imported_business','business'),('registry_website','website')]:
    registry_value=reg[rf]; manifest_value=m[mf]
    if rf=='business' and registry_value is None and manifest_value=='': continue # upstream null encoding only
    if registry_value!=manifest_value:
     if ident=='OG.0003288' and rf=='business' and registry_value=='Tenacity Outdoors ' and manifest_value=='Tenacity Outdoors' and row['review_status']=='name_variant_hold' and row['facts']==[] and reg['name']=='John Kaiser' and reg['website']=='tenacityoutdoors.com':
      differences.append({'field':rf,'registry_value':registry_value,'manifest_value':manifest_value,'decision':'specific_comparison_exception_identity_still_held'})
     else:
      differences.append({'field':rf,'registry_value':registry_value,'manifest_value':manifest_value,'decision':'hold_for_exact_identity_review'})
   bad=[d for d in differences if d['decision']=='hold_for_exact_identity_review']
   if bad: conflicts.append({'guide_id':ident,'type':'registry_manifest_mismatch','details':bad,'publication_approved':False})
   def normalized(value): return ' '.join(value.casefold().split())
   blocked={normalized(x['value']) for x in exclusions if x['guide_id']==ident}
   contradicts=[]
   for fact in row['facts']:
    claimed=list(fact.get('advertised_waters',[]))+[rel.get('waterway','') for rel in fact.get('explicit_relationships',[])]
    contradicts.extend(x for x in claimed if normalized(x) in blocked)
   if contradicts: conflicts.append({'guide_id':ident,'type':'excluded_waterway_claim','details':sorted(set(contradicts)),'publication_approved':False})
   is_held=row['review_status']!=SUPPORTED or ident in held_registry or bool(bad) or bool(contradicts)
   if is_held:
    held.append({'guide_id':ident,'batch':batch,'review_status':row['review_status'],'reason':row['identity']['assessment'],
      'registry_hold':held_registry.get(ident),'identity_conflicts':bad,'review_record':copy.deepcopy(row),
      'sources':{sid:copy.deepcopy(sources[sid]) for sid in sorted({f['source_id'] for f in row['facts']}|set(row['identity']['source_ids'])|{x['source_id'] for x in row.get('held_observations',[])})},'publication_approved':False})
   before=(len(attrs),len(waters),len(unsupported),len(ledger));source_counts=Counter()
   for fi,fact in enumerate(row['facts']):
    allowed={'source_id','scope','relationship','explicit_relationships',*FIELDS,'advertised_locations','advertised_accessibility','listed_business_names','historical_directory_area'}
    require(set(fact)<=allowed,'Unknown field needs decision '+ident)
    sid=fact['source_id'];require(sid in sources,'Unknown source '+ident);source=copy.deepcopy(sources[sid]);source['source_id']=sid
    source['reviewed_on']=source.get('reviewed_on',review['reviewed_on']);source['retrieval_method']=source.pop('method')
    scope=fact['scope'];contract_scope=scope in ('operator_advertises','industry_lists') and source['source_type'] in ('operator_site','industry_directory','third_party_directory')
    is_current=source['retrieval_method']=='parsed_page' and scope in ('operator_advertises','industry_lists','tourism_lists')
    for field,values in fact.items():
     if field in ('source_id','scope','relationship','explicit_relationships'):continue
     require(isinstance(values,list),'Expected field list '+ident)
     for vi,value in enumerate(values):
      require(isinstance(value,str) and value.strip(),'Empty value '+ident)
      unit={'guide_id':ident,'batch':batch,'fact_index':fi,'field':field,'value_index':vi,'value':value,'source_id':sid,'evidence_scope':scope}
      item={'guide_id':ident,'value':value,'source':copy.deepcopy(source),'evidence_scope':scope,'editorial_status':'pending','publication_approved':False,
            'identity_evidence':copy.deepcopy(row['identity']),'limitations':copy.deepcopy(row['limitations'])}
      field_kind=FIELDS.get(field)
      if is_held:
       unit['decision']='held';unit['reason']='Record identity, source, status or registry conflict remains held'
      elif not is_current:
       unit['decision']='unsupported';unit['reason']='Historical or indexed-only evidence cannot be a current offering'
       unsupported.append({**unit,'source':copy.deepcopy(source),'publication_approved':False})
      elif field_kind is None:
       unit['decision']='unsupported';unit['reason']='Field has no discovery-contract representation'
       unsupported.append({**unit,'source':copy.deepcopy(source),'publication_approved':False})
      elif not contract_scope and field_kind!='waterway':
       unit['decision']='unsupported';unit['reason']='Source scope/type is not supported by discovery contract'
       unsupported.append({**unit,'source':copy.deepcopy(source),'publication_approved':False})
      else:
       if field_kind!='waterway':item['kind']=field_kind
       else:item['contract_status']='candidate' if contract_scope else 'scope_requires_editorial_mapping'
       target='waterway' if field_kind=='waterway' else 'attribute'
       add(target,item);unit['decision']='candidate_'+target;source_counts[target]+=1
       if not contract_scope:
        unsupported.append({**unit,'decision':'unsupported_scope','reason':'Separate water retained with original tourism attribution; no discovery scope mapping approved','source':copy.deepcopy(source),'publication_approved':False})
      ledger.append(unit)
    relationships=fact.get('explicit_relationships',[])
    if fact.get('relationship'):
     require(fact['relationship']=='explicit_single_trip_section' and len(fact.get('advertised_waters',[]))==len(fact.get('advertised_species',[]))==1,'Unrecognized relationship format '+ident)
     relationships=[{'waterway':fact['advertised_waters'][0],'species':fact['advertised_species'][0]}]
    for ri,rel in enumerate(relationships):
     require(isinstance(rel,dict) and {'waterway','species'}<=set(rel)<= {'waterway','species','method'},'Invalid relationship '+ident)
     require(rel['waterway'] in fact.get('advertised_waters',[]) and rel['species'] in fact.get('advertised_species',[]) and ('method' not in rel or rel['method'] in fact.get('advertised_methods',[])),'Relationship crosses fact groups '+ident)
     unit={'guide_id':ident,'batch':batch,'fact_index':fi,'field':'explicit_relationship','value_index':ri,'value':copy.deepcopy(rel),'source_id':sid,'evidence_scope':scope}
     if is_held or not is_current or not contract_scope:
      unit['decision']='held' if is_held else 'unsupported';unit['reason']='Identity or source scope requires review'
      if not is_held:unsupported.append({**unit,'source':copy.deepcopy(source),'publication_approved':False})
     else:
      item={'guide_id':ident,'kind':'species','value':rel['species'],'relationship':copy.deepcopy(rel),'source':copy.deepcopy(source),'evidence_scope':scope,'editorial_status':'pending','publication_approved':False,'identity_evidence':copy.deepcopy(row['identity']),'limitations':copy.deepcopy(row['limitations'])}
      add('attribute',item);unit['decision']='candidate_relationship';source_counts['relationship']+=1
     ledger.append(unit)
   index.append({'guide_id':ident,'batch':batch,'manifest_identity':{k:m[k] for k in ('imported_name','imported_business','registry_website')},
      'registry_identity':{'name':reg['name'],'business':reg['business'],'website':reg['website']},'review_status':row['review_status'],
      'disposition':'held' if is_held else 'pending_candidates','identity_differences':differences,'field_decisions':dict(source_counts),
      'identity_evidence':copy.deepcopy(row['identity']),'limitations':copy.deepcopy(row['limitations']),
      'identity_sources':{sid:copy.deepcopy(sources[sid]) for sid in row['identity']['source_ids']},
      'held_observations':copy.deepcopy(row.get('held_observations',[])),
      'failed_or_limited_fetches':copy.deepcopy(row.get('failed_or_limited_fetches',[])),
      'source_exclusions':copy.deepcopy(row.get('exclusions',[])),
      'input_fact_groups':len(row['facts']),'accounted_field_values':len(ledger)-before[3],'publication_approved':False})
 require(seen==set(manifest_ids),'Manifest coverage incomplete')
 require(len(index)==111 and len({x['guide_id'] for x in index})==111,'Index must have exactly one row per ID')
 # Compare all three modern-batch emitted candidates to their existing converter output.
 for batch,result in converted.items():
  def sig(x):return (x['guide_id'],x.get('kind','waterway'),x['value'],canonical(x.get('relationship')),x['source']['source_id'])
  expected={sig(x) for x in result['attributes']+result['pending_waters']}
  actual={sig(x) for x in attrs+waters if x['guide_id'] in {r['registration_id'] for r in batches[batch]['records']}}
  require(actual==expected,'Consolidated facts differ from existing converter for '+batch)
 index.sort(key=lambda x:x['guide_id']);attrs.sort(key=canonical);waters.sort(key=canonical);held.sort(key=lambda x:x['guide_id']);unsupported.sort(key=canonical);conflicts.sort(key=canonical)
 counts={'manifest_ids':len(index),'batches':{b:sum(x['batch']==b for x in index) for b,_,_ in BATCHES},
  'held_records':len(held),'conflict_records':len(conflicts),'pending_candidate_records':sum(x['disposition']=='pending_candidates' for x in index),
  'attribute_entries':len(attrs),'standalone_attributes':sum('relationship' not in a for a in attrs),'distinct_standalone_facts':len({(a['guide_id'],a['kind'],a['value']) for a in attrs if 'relationship' not in a}),'relationship_entries':sum('relationship' in a for a in attrs),
  'water_entries':len(waters),'distinct_guide_water_pairs':len({(w['guide_id'],w['value']) for w in waters}),
  'unsupported_field_decisions':len(unsupported),'accounted_input_values':len(ledger),'input_value_decisions':dict(sorted(Counter(x['decision'] for x in ledger).items()))}
 return {'schema_version':1,'status':'pending_review_only','publication_approved':False,'input_sha256':PINNED,'counts':counts,
         'index':index,'attributes':attrs,'waters':waters,'holds':held,'conflicts':conflicts,'unsupported_fields':unsupported,'exclusions':exclusions,'field_ledger':ledger,
         'limitations':['No publication or identity approval. Business offerings are not individual expertise.','Independent lists do not establish combined trips.','Source citations count as evidence entries, not people.']}

def assemble():
 for path,digest in PINNED.items():require(sha(ROOT/path)==digest,'Pinned input changed: '+path)
 manifest=read(RESEARCH/'BATCH13_DEDUPED_RESEARCH_MANIFEST_20261115.json')
 registry=read(ROOT/'lib/oregon-guides.json');hold_data=read(ROOT/'lib/guide-evidence-holds.json')
 batches={name:read(RESEARCH/path) for name,path,_ in BATCHES}
 # Execute the existing frozen proposal converter and its extension before adapting its older format.
 base=original.build_proposal(batches['original20'],registry,read(ROOT/'lib/guide-enrichment.json'))
 base['input_sha256']={path.name:sha(path) for path in (original.SOURCE,original.REGISTRY,original.PUBLIC)}
 require(base==read(RESEARCH/'BATCH13_MVP_CANDIDATE_PATCH.json'),'Frozen original proposal changed')
 require(extended.build(base)==read(RESEARCH/'BATCH13_EXTENDED_PROPOSAL.json'),'Frozen extended proposal changed')
 s10=next10.SELECTION.read_bytes();s10b=next10b.SELECTION.read_bytes();s41=remaining.SELECTION.read_bytes()
 next10.validate(batches['first10'],s10,registry);next10b.validate(batches['second10'],s10b,registry)
 remaining.validate_repository(batches['final41'],s41,registry)
 converted={'first10':converter.build(batches['first10'],s10,registry),
  'second10':converter.build(batches['second10'],s10b,registry,validate_fn=next10b.validate),
  'final41':remaining.build(batches['final41'],s41,registry)}
 return build(manifest,batches,registry,hold_data,converted)

def csv_artifact(bundle):
 out=io.StringIO(newline='');writer=csv.writer(out,lineterminator='\n')
 writer.writerow(['guide_id','record_type','kind','value','relationship','evidence_scope','source_type','source_url','source_locator','reviewed_on','water_contract_status','editorial_status','publication_approved'])
 for item in bundle['attributes']+bundle['waters']:
  values=[item['guide_id'],'attribute' if 'kind' in item else 'waterway',item.get('kind','waterway'),item['value'],canonical(item.get('relationship',{})),item['evidence_scope'],item['source']['source_type'],item['source']['url'],item['source']['locator'],item['source']['reviewed_on'],item.get('contract_status',''),item['editorial_status'],'false']
  writer.writerow(["'"+v if v.lstrip().startswith(('=','+','-','@')) else v for v in values])
 return out.getvalue()

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
 bundle=assemble();rendered=json.dumps(bundle,indent=2,ensure_ascii=False)+'\n'
 csv_text=csv_artifact(bundle)
 if args.check:
  require(OUTPUT.read_text(encoding='utf-8')==rendered,'Consolidated bundle is stale')
  require(CSV_OUTPUT.read_text(encoding='utf-8')==csv_text,'Consolidated CSV is stale')
 else:
  OUTPUT.write_text(rendered,encoding='utf-8');CSV_OUTPUT.write_text(csv_text,encoding='utf-8')
 print(json.dumps(bundle['counts'],indent=2,sort_keys=True))
if __name__=='__main__':main()
