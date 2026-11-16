#!/usr/bin/env python3
"""Generate an offline editorial review page or an unapplied population patch."""
import argparse
import copy
from datetime import date
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import unicodedata
import webbrowser
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import batch13_consolidated as consolidated
BUNDLE=ROOT/'docs/research/BATCH13_CONSOLIDATED_POPULATION.json'
FOLLOWUP=ROOT/'docs/research/BATCH13_HOLD_FOLLOWUP10_20261115.json'
FOLLOWUP_HASH='d29d9258ff1a91217a8654c437fe90d812c33216665a48156baa4f0544f7beab'
FOLLOWUP16=ROOT/'docs/research/BATCH13_HOLD_FOLLOWUP16_20261116.json'
FOLLOWUP16_HASH='8dd05d9bf273db63d39fc31f2c758c5036126eaad38830587d73872b8c3892e4'
ATTRS=ROOT/'lib/approved-guide-attributes.json'
WATERS=ROOT/'lib/guide-enrichment.json'
HOLDS=ROOT/'lib/guide-evidence-holds.json'
REGISTRY=ROOT/'lib/oregon-guides.json'
CONTRACT=ROOT/'lib/guide-attributes.ts'
TEMPLATE=ROOT/'scripts/editorial/review.html'
LOCAL_OUTPUT=ROOT/'outputs/editorial-review'
FIELDS={'advertised_species':'species','advertised_methods':'method','advertised_trip_types':'trip_type','display_names':'person_name','business_names':'business_name','advertised_waters':'waterway'}
KINDS={'species','method','trip_type','person_name','business_name'}

def require(value,message):
 if not value:raise ValueError(message)
def canonical(v):return json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':'))
def digest(v):return hashlib.sha256(canonical(v).encode()).hexdigest()
def filehash(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def norm(value):return ' '.join(unicodedata.normalize('NFKC',value).strip().lower().split())
def strict_json(text):
 def unique(pairs):
  result={}
  for k,v in pairs:
   require(k not in result,'Duplicate JSON key: '+k);result[k]=v
  return result
 return json.loads(text,object_pairs_hook=unique)
def read(path):return strict_json(path.read_text(encoding='utf-8'))
def safe_source(src):
 try:
  u=urlsplit(src.get('url',''))
  required=(src.get('url'),src.get('locator'),src.get('reviewed_on'))
  if not all(isinstance(v,str) and v.strip() and len(v)<=256 and not any(ord(c)<32 or ord(c)==127 for c in v) for v in required):return False
  reviewed=date.fromisoformat(src['reviewed_on'])
  return u.scheme=='https' and bool(u.hostname) and not u.username and not u.password and not any(c.isspace() for c in src['url']) and reviewed.isoformat()==src['reviewed_on'] and reviewed<=date.today()
 except (TypeError,ValueError):return False

def baseline_hash():
 return digest({p.relative_to(ROOT).as_posix():filehash(p) for p in (ATTRS,WATERS,HOLDS,REGISTRY,CONTRACT,ROOT/'lib/guide-enrichment.ts',ROOT/'lib/guide-attributes-server.ts',ROOT/'lib/directory.ts',ROOT/'lib/washington-stable-ids.json')})

def evidence(src,default_date='2026-11-15'):
 data=copy.deepcopy(src);data['reviewed_on']=data.get('reviewed_on',default_date)
 if 'method' in data:data['retrieval_method']=data.pop('method')
 return data

def load_model():
 bundle=read(BUNDLE);require(bundle==consolidated.assemble(),'Consolidated input is stale')
 require(filehash(FOLLOWUP)==FOLLOWUP_HASH,'Follow-up evidence changed')
 spec=importlib.util.spec_from_file_location('followup_validator',ROOT/'tests/test_batch13_hold_followup10.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 followup=read(FOLLOWUP);module.validate(followup,(ROOT/module.BASE_PATH).read_bytes())
 require(filehash(FOLLOWUP16)==FOLLOWUP16_HASH,'Follow-up 16 evidence changed')
 spec16=importlib.util.spec_from_file_location('followup16_validator',ROOT/'tests/test_batch13_hold_followup16.py')
 module16=importlib.util.module_from_spec(spec16);spec16.loader.exec_module(module16)
 followup16=read(FOLLOWUP16);module16.validate(followup16,module16.BASE.read_bytes(),FOLLOWUP.read_bytes())
 index={r['guide_id']:r for r in bundle['index']};held={r['guide_id']:r for r in bundle['holds']}
 require(len(index)==111 and len(held)==59,'Unexpected input coverage')
 sources={}
 def register(src):
  s=evidence(src);key=digest(s);sources[key]=s;return key
 # Source choices used to resolve holds are always explicit and remain traceable.
 for ident,h in held.items():
  for src in h['sources'].values():register(src)
 for row in followup['records']:
  for sid in row['source_ids']:register(followup['sources'][sid])
 followby={r['registration_id']:r for r in followup['records']}
 follow16by={r['registration_id']:r for r in followup16['records']}
 for row in followup16['records']:
  for sid in row['source_ids']:register(followup16['sources'][sid])
 triage={}
 for line in (ROOT/'docs/qa/identity-hold-triage.md').read_text(encoding='utf-8').splitlines():
  cells=[v.strip() for v in line.split('|')]
  if len(cells)>=6 and cells[1].startswith('OG.'):triage[cells[1]]=cells[4]
 requirements={
  'retrieval_limited':'Obtain readable attributable operator evidence; a failed retrieval is not proof of closure.',
  'retrieval_limited_pending_editorial':'Obtain readable attributable operator evidence and review the original identity hold.',
  'operator_source_hold':'Obtain a readable operator source or a reviewed operator-control decision.',
  'source_access_hold':'Obtain readable direct evidence; indexed-only text does not establish a current offering.',
  'category_review_hold':'Determine whether inspected evidence describes a guided fishing offering.',
  'historical_listing_only':'Obtain current attributable operator evidence; the historical listing is not current authorization.',
  'historical_source_hold':'Obtain current evidence and resolve any named-person discrepancy.',
  'name_variant_hold':'Obtain explicit evidence linking the name variant to the registered person.',
  'identity_review_hold':'Establish the exact person-to-business association.',
  'business_identity_hold':'Establish the exact person-to-business association.',
  'source_supported_pending_editorial':'Resolve the exact registry identity conflict without changing source strings.',
 }
 items=[]
 def add(category,record,source=None,**extra):
  ident=record['guide_id'];payload={'category':category,'guide_id':ident,'record':record,**extra}
  if source is not None:payload['source_id']=register(source)
  item={'item_id':digest(payload),**payload};items.append(item)
 for x in bundle['attributes']:add('relationship' if 'relationship' in x else 'attribute',x,x['source'])
 for x in bundle['waters']:add('waterway',x,x['source'])
 for x in bundle['unsupported_fields']:add('unsupported',x,x.get('source'))
 for h in bundle['holds']:
  ident=h['guide_id'];options=[register(s) for s in h['sources'].values()]
  if ident in followby:options += [register(followup['sources'][s]) for s in followby[ident]['source_ids']]
  if ident in follow16by:options += [register(followup16['sources'][s]) for s in follow16by[ident]['source_ids']]
  needed=follow16by.get(ident,{}).get('next_evidence_needed') or followby.get(ident,{}).get('next_evidence_needed') or triage.get(ident) or requirements.get(h['review_status'])
  require(bool(needed),'Hold lacks a review requirement: '+ident)
  add('hold',h,evidence_options=sorted(set(options)),next_evidence_needed=needed)
 for c in bundle['conflicts']:
  options=[register(s) for s in held.get(c['guide_id'],{}).get('sources',{}).values()]
  add('conflict',c,evidence_options=sorted(set(options)))
 # Preserve facts quarantined by the original record hold as individually reviewable leads.
 for unit in bundle['field_ledger']:
  if unit['decision']!='held':continue
  ident=unit['guide_id'];h=held[ident];kind=FIELDS.get(unit['field']);src=evidence(h['sources'][unit['source_id']])
  row={'guide_id':ident,'kind':kind,'value':unit['value'],'source':src,'evidence_scope':unit.get('evidence_scope'),
       'limitations':h['review_record']['limitations'],'identity_evidence':h['review_record']['identity'],
       'editorial_status':'pending','publication_approved':False,'blocked_by_baseline_hold':True,'ledger':unit}
  add(('waterway' if kind=='waterway' else 'attribute') if kind else 'unsupported',row,src,origin='baseline_hold')
 for row in followup['records']:
  for fact in row['candidate_facts']:
   src=evidence(followup['sources'][fact['source_id']]);item={'guide_id':row['registration_id'],'kind':fact['kind'],'value':fact['value'],'source':src,
     'evidence_scope':fact['evidence_scope'],'identity_evidence':{'assessment':row['finding']},'limitations':[row['next_evidence_needed']],
     'editorial_status':'pending','publication_approved':False,'blocked_by_baseline_hold':True}
   add('attribute',item,src,origin='followup')
 for row in followup16['records']:
  require(row['registration_id'] in held,'Follow-up 16 cannot introduce an unheld record')
  for field,category in (('candidate_facts','attribute'),('candidate_waterways','waterway'),('explicit_relationships','relationship')):
   for fact in row[field]:
    src=evidence(followup16['sources'][fact['source_id']]);relationship={k:fact[k] for k in ('species','method','waterway') if k in fact}
    item={'guide_id':row['registration_id'],'kind':fact.get('kind','species' if category=='relationship' else 'waterway'),
      'value':fact.get('value',fact.get('species')),'source':src,'evidence_scope':fact['evidence_scope'],
      'identity_evidence':{'assessment':row['finding']},'limitations':[row['next_evidence_needed']],
      'editorial_status':'pending','publication_approved':False,'blocked_by_baseline_hold':True}
    if category=='relationship':item['relationship']=relationship
    add(category,item,src,origin='followup16')
 require(len({x['item_id'] for x in items})==len(items),'Duplicate item identities')
 for item in items:require(item['guide_id'] in index,'Unknown guide ID')
 follow_evidence={r['registration_id']:{'record':r,'sources':{sid:followup['sources'][sid] for sid in r['source_ids']}} for r in followup['records']}
 follow16_evidence={r['registration_id']:{'record':r,'sources':{sid:followup16['sources'][sid] for sid in r['source_ids']}} for r in followup16['records']}
 model={'schema_version':1,'candidate_sha256':filehash(BUNDLE),'followup_sha256':filehash(FOLLOWUP),
        'followup16_sha256':filehash(FOLLOWUP16),'baseline_sha256':baseline_hash(),'guides':bundle['index'],'items':items,'sources':sources,'followup':follow_evidence,'followup16':follow16_evidence}
 model['model_sha256']=digest(model)
 return model

def valid_decision_file(doc,model):
 require(isinstance(doc,dict) and set(doc)=={'schema_version','baseline_sha256','candidate_sha256','followup_sha256','model_sha256','editor','decisions'},'Invalid decision file fields')
 require(type(doc['schema_version']) is int,'Invalid schema version')
 for k in ('schema_version','baseline_sha256','candidate_sha256','followup_sha256','model_sha256'):require(doc[k]==model[k],'Stale or mismatched '+k)
 require(isinstance(doc['editor'],str) and len(doc['editor'])<=200,'Invalid editor')
 require(isinstance(doc['decisions'],list),'Decisions must be a list')
 lookup={i['item_id']:i for i in model['items']};seen=set();result={}
 for d in doc['decisions']:
  require(isinstance(d,dict) and set(d)=={'item_id','guide_id','action','reason','evidence_id'},'Invalid decision fields')
  ident=d['item_id'];require(isinstance(ident,str) and ident in lookup,'Unknown or changed item')
  require(ident not in seen,'Duplicate/conflicting decision');seen.add(ident);item=lookup[ident]
  require(d['guide_id']==item['guide_id'],'Guide identity mismatch')
  require(isinstance(d['reason'],str) and d['reason'].strip() and len(d['reason'])<=2000,'Decision requires a reason')
  require(d['action'] in ('approve','reject','hold','resolve'),'Unknown decision')
  allowed=('resolve','reject','hold') if item['category'] in ('hold','conflict') else ('reject','hold') if item['category']=='unsupported' else ('approve','reject','hold')
  require(d['action'] in allowed,'Unsupported decision for item')
  if item['category'] in ('hold','conflict'):
   require(d['evidence_id']=='' or d['evidence_id'] in item['evidence_options'],'Hold/conflict evidence is unrelated')
   if d['action']=='resolve':
    require(d['evidence_id'] in item['evidence_options'],'Hold resolution needs its own referenced evidence')
    src=model['sources'][d['evidence_id']]
    require(safe_source(src) and src.get('retrieval_method')=='parsed_page' and src.get('source_type')!='historical_restored_site','Hold resolution needs readable, nonhistorical evidence')
  else:require(d['evidence_id']==item.get('source_id'),'Changed or unrelated supporting evidence')
  result[ident]=d
 require(not result or bool(doc['editor'].strip()),'Editor label required for decisions')
 return result

def generate_patch(doc,model,attrs,waters,hard_holds,known,validate_product=True):
 decisions=valid_decision_file(doc,model);lookup={i['item_id']:i for i in model['items']}
 hold_items={i['guide_id']:i for i in model['items'] if i['category']=='hold'}
 conflict_items={i['guide_id']:i for i in model['items'] if i['category']=='conflict'}
 hard={x['guide_id'] for x in hard_holds['held_guides']};exclusions=hard_holds['excluded_waterways']
 bykey={};selected=[]
 for ident,d in decisions.items():
  i=lookup[ident];r=i['record'];cat=i['category']
  if cat in ('attribute','waterway','relationship'):
   key=(i['guide_id'],r.get('kind','waterway'),norm(r['value']),canonical(r.get('relationship')) if cat=='relationship' else '')
   if key in bykey:require(bykey[key]==d['action'],'Conflicting decisions for same fact')
   else:bykey[key]=d['action']
  if d['action']!='approve':continue
  require(i['guide_id'] in known,'Unknown product guide')
  h=hold_items.get(i['guide_id']);c=conflict_items.get(i['guide_id'])
  if h:require(decisions.get(h['item_id'],{}).get('action')=='resolve','Held item requires explicit hold resolution')
  if c:require(decisions.get(c['item_id'],{}).get('action')=='resolve','Identity conflict requires explicit resolution')
  require(i['guide_id'] not in hard,'Product-level identity hold requires a separate reviewed product change')
  src=model['sources'][i['source_id']]
  require(safe_source(src) and src.get('retrieval_method')=='parsed_page','Candidate requires readable source evidence')
  require((src.get('source_type'),r.get('evidence_scope')) in (('operator_site','operator_advertises'),('industry_directory','industry_lists'),('third_party_directory','industry_lists')),'Unsupported source type or scope')
  require(not any(e['guide_id']==i['guide_id'] and (norm(r['value'])==norm(e['value']) or norm(r.get('relationship',{}).get('waterway',''))==norm(e['value'])) for e in exclusions),'Excluded waterway')
  selected.append(i)
 # Relationships require separate field approvals or pre-existing approved product facts.
 def exists(kind,value,guide):
  if kind=='waterway':
   return any(x['guide_id']==guide and x['category']=='waterway' and norm(x['record']['value'])==norm(value) for x in selected) or any(norm(x['name'])==norm(value) for x in waters.get(guide,{}).get('advertisedWaters',[]))
  return any(x['guide_id']==guide and x['category']=='attribute' and x['record'].get('kind')==kind and norm(x['record']['value'])==norm(value) for x in selected) or any(x['guide_id']==guide and x['kind']==kind and norm(x['value'])==norm(value) and x.get('editorial_status')=='approved' and x.get('publication_approved') is True for x in attrs)
 for i in selected:
  if i['category']=='relationship':
   for kind,value in i['record']['relationship'].items():
    require(bykey.get((i['guide_id'],kind,norm(value),'')) not in ('reject','hold'),'Relationship component is rejected or held: '+kind)
    require(exists(kind,value,i['guide_id']),'Relationship requires separately approved '+kind)
 after_attrs=copy.deepcopy(attrs);after_waters=copy.deepcopy(waters);changes=[]
 for i in sorted(selected,key=lambda x:x['item_id']):
  r=i['record'];src=model['sources'][i['source_id']];guide=i['guide_id']
  if i['category']=='waterway':
   value={'name':r['value'],'sourceUrl':src['url'],'sourceType':'operator_site' if src['source_type']=='operator_site' else 'third_party_directory','observedOn':src['reviewed_on']}
   entry=after_waters.setdefault(guide,{'searchAliases':[],'advertisedWaters':[]});require(isinstance(entry.get('advertisedWaters'),list) and isinstance(entry.get('searchAliases'),list),'Malformed existing water baseline')
   if value not in entry['advertisedWaters']:entry['advertisedWaters'].append(value);changes.append({'item_id':i['item_id'],'target':'lib/guide-enrichment.json','guide_id':guide,'before':None,'after':value})
  else:
   require(r.get('kind') in KINDS,'Unsupported attribute kind')
   value={'guide_id':guide,'kind':r['kind'],'value':r['value'],'source':{k:src[k] for k in ('url','source_type','reviewed_on','locator')},'evidence_scope':r['evidence_scope'],'editorial_status':'approved','publication_approved':True}
   if 'relationship' in r:value['relationship']=r['relationship']
   if value not in after_attrs:after_attrs.append(value);changes.append({'item_id':i['item_id'],'target':'lib/approved-guide-attributes.json','guide_id':guide,'before':None,'after':value})
 if validate_product:
  proc=subprocess.run(['node',str(ROOT/'scripts/editorial/contract-check.mjs')],input=json.dumps({'attributes':after_attrs,'known':sorted(known)}),text=True,capture_output=True,cwd=ROOT)
  require(proc.returncode==0,'Actual discovery contract rejected patch: '+proc.stderr.strip())
 return {'schema_version':1,'status':'dry_run_only_not_applied','publication_approved':False,'baseline_sha256':model['baseline_sha256'],
   'candidate_sha256':model['candidate_sha256'],'followup_sha256':model['followup_sha256'],'followup16_sha256':model.get('followup16_sha256'),'model_sha256':model['model_sha256'],
   'editor':doc['editor'],'decisions':copy.deepcopy(doc['decisions']),'changes':changes,
   'review_context':[copy.deepcopy(lookup[d['item_id']]) for d in doc['decisions']],
   'evidence':{sid:copy.deepcopy(model['sources'][sid]) for sid in sorted({d['evidence_id'] for d in doc['decisions'] if d['evidence_id']})},
   'before':{'approved_attributes':attrs,'guide_enrichment':waters,'guide_evidence_holds':hard_holds},
   'after':{'approved_attributes':after_attrs,'guide_enrichment':after_waters,'guide_evidence_holds':copy.deepcopy(hard_holds)}}

def write_safe(path,content):
 target=path.resolve();root=ROOT.resolve();allowed=LOCAL_OUTPUT.resolve()
 require(target!=root and (not target.is_relative_to(root) or target.is_relative_to(allowed)),'Output inside repository must be under outputs/editorial-review')
 require(not path.is_symlink(),'Refuse symlink output');target.parent.mkdir(parents=True,exist_ok=True)
 require(not target.exists(),'Refuse overwriting an existing file')
 with target.open('x',encoding='utf-8') as f:f.write(content)

def render(model):
 payload=canonical(model).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
 return TEMPLATE.read_text(encoding='utf-8').replace('/*__REVIEW_DATA__*/',payload)

def main():
 parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='cmd',required=True)
 op=sub.add_parser('open',help='generate and open the offline page');op.add_argument('--output',type=Path,default=LOCAL_OUTPUT/'review.html')
 gen=sub.add_parser('generate',help='generate offline HTML without opening');gen.add_argument('--output',type=Path,default=LOCAL_OUTPUT/'review.html')
 patch=sub.add_parser('patch',help='generate an unapplied JSON patch');patch.add_argument('--decisions',required=True,type=Path);patch.add_argument('--output',required=True,type=Path)
 args=parser.parse_args();model=load_model()
 if args.cmd in ('open','generate'):
  content=render(model)
  if args.output.exists() and args.output.is_file() and not args.output.is_symlink() and args.output.read_text(encoding='utf-8')==content:pass
  else:write_safe(args.output,content)
  print('Offline review page:',args.output.resolve())
  if args.cmd=='open' and not webbrowser.open(args.output.resolve().as_uri()):print('Open the path above in a browser.',file=sys.stderr)
 else:
  doc=read(args.decisions);known={r['registration'] for r in read(REGISTRY)}|set(read(ROOT/'lib/washington-stable-ids.json').values())
  result=generate_patch(doc,model,read(ATTRS),read(WATERS),read(HOLDS),known)
  write_safe(args.output,json.dumps(result,indent=2,ensure_ascii=False)+'\n');print('Dry-run patch:',args.output.resolve(),'changes:',len(result['changes']))
if __name__=='__main__':
 try:main()
 except (ValueError,KeyError,TypeError,OSError,json.JSONDecodeError) as e:print('ERROR:',e,file=sys.stderr);sys.exit(1)
