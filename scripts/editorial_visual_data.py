#!/usr/bin/env python3
"""Create temporary, unapproved visual overlays; never alter product data."""
import argparse
import copy
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
import editorial_review as e

def visual(model,decisions=None):
 held={x['guide_id'] for x in model['items'] if x['category'] in ('hold','conflict')}
 hard={x['guide_id'] for x in e.read(e.HOLDS)['held_guides']};held|=hard
 attrs=[];waters={};changes=[]
 if decisions is None:
  selected=[x for x in model['items'] if x['category'] in ('attribute','relationship','waterway') and x['guide_id'] not in held and x.get('origin') not in ('followup','followup16','baseline_hold')]
  for item in selected:
   r=item['record'];src=model['sources'][item['source_id']]
   if not e.safe_source(src) or src.get('retrieval_method')!='parsed_page':continue
   if (src.get('source_type'),r.get('evidence_scope')) not in (('operator_site','operator_advertises'),('industry_directory','industry_lists'),('third_party_directory','industry_lists')):continue
   if item['category']=='waterway':
    waters.setdefault(item['guide_id'],[]).append({'name':r['value'],'sourceUrl':src['url'],'sourceType':'operator_site' if src['source_type']=='operator_site' else 'third_party_directory','observedOn':src['reviewed_on']})
   else:
    value={k:copy.deepcopy(r[k]) for k in ('guide_id','kind','value','source','evidence_scope','editorial_status','publication_approved')}
    if 'relationship' in r:value['relationship']=copy.deepcopy(r['relationship'])
    e.require(value['editorial_status']=='pending' and value['publication_approved'] is False,'Preview candidates must remain pending')
    attrs.append(value)
  mode='candidate simulation';changes=[{'guide_id':x['guide_id'],'kind':x.get('kind','waterway'),'value':x['value'],'relationship':x.get('relationship')} for x in attrs]
  changes += [{'guide_id':g,'kind':'waterway','value':x['name']} for g,items in waters.items() for x in items]
 else:
  known={r['registration'] for r in e.read(e.REGISTRY)}|set(e.read(e.ROOT/'lib/washington-stable-ids.json').values())
  patch=e.generate_patch(decisions,model,e.read(e.ATTRS),e.read(e.WATERS),e.read(e.HOLDS),known)
  for c in patch['changes']:
   x=copy.deepcopy(c['after'])
   if c['target'].endswith('approved-guide-attributes.json'):
    # Rendering the proposal is not a publication decision or a new approval.
    x['editorial_status']='pending';x['publication_approved']=False;attrs.append(x)
   else:waters.setdefault(c['guide_id'],[]).append(x)
  changes=patch['changes'];mode='decision-file rehearsal'
 return {'mode':mode,'attributes':attrs,'waters':waters,'changes':changes,'publication_approved':False,
         'counts':{'guides':len({x['guide_id'] for x in attrs}|set(waters)),'attributes':len(attrs),'waters':sum(map(len,waters.values())),'changes':len(changes)},
         'candidate_sha256':model['candidate_sha256'],'followup_sha256':model['followup_sha256'],'followup16_sha256':model['followup16_sha256'],'baseline_sha256':model['baseline_sha256']}

def main():
 p=argparse.ArgumentParser();p.add_argument('--decisions',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 model=e.load_model();data=visual(model,e.read(a.decisions) if a.decisions else None)
 e.write_safe(a.output,json.dumps(data,indent=2,ensure_ascii=False)+'\n');print(json.dumps(data['counts'],sort_keys=True))
if __name__=='__main__':main()
