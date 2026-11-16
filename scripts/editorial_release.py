#!/usr/bin/env python3
"""Create or verify an unapplied, reversible editorial release package."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import editorial_review as editorial

def require(ok,msg):
 if not ok:raise ValueError(msg)
def sha_bytes(data):return hashlib.sha256(data).hexdigest()
def state_hash(files):return editorial.digest({name:sha_bytes(text.encode()) for name,text in sorted(files.items())})
def check_git_base(commit):
 actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 require(commit==actual,'Base commit does not match current HEAD')
 require(not subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=ROOT,text=True).strip(),'Commit or stash tracked changes before packaging')
 for path in (editorial.ATTRS,editorial.WATERS,editorial.HOLDS,editorial.REGISTRY,editorial.CONTRACT,editorial.BUNDLE,editorial.FOLLOWUP):
  rel=path.relative_to(ROOT).as_posix();old=subprocess.check_output(['git','show',commit+':'+rel],cwd=ROOT)
  require(old==path.read_bytes(),'Base file differs from commit: '+rel)

def build_package(doc,model,attrs,waters,holds,known,base_commit,raw_before,decision_bytes,evidence=None):
 patch=editorial.generate_patch(doc,model,attrs,waters,holds,known)
 require(set(raw_before)=={'lib/approved-guide-attributes.json','lib/guide-enrichment.json'},'Invalid baseline files')
 require(editorial.strict_json(raw_before['lib/approved-guide-attributes.json'])==attrs and editorial.strict_json(raw_before['lib/guide-enrichment.json'])==waters,'Baseline bytes mismatch')
 after={'lib/approved-guide-attributes.json':json.dumps(patch['after']['approved_attributes'],indent=2,ensure_ascii=False)+'\n',
        'lib/guide-enrichment.json':json.dumps(patch['after']['guide_enrichment'],indent=2,ensure_ascii=False)+'\n'}
 # Avoid formatting-only changes to unmodified files.
 for path in after:
  if editorial.strict_json(after[path])==editorial.strict_json(raw_before[path]):after[path]=raw_before[path]
 changes=patch['changes'];ids=sorted({x['guide_id'] for x in changes})
 facts={(x['guide_id'],x['after'].get('kind','waterway'),x['after'].get('value',x['after'].get('name')),editorial.canonical(x['after'].get('relationship'))) for x in changes}
 inventory=model;decisions=editorial.valid_decision_file(doc,inventory)
 unresolved=[{'guide_id':x['guide_id'],'category':x['category'],'item_id':x['item_id']} for x in inventory['items'] if x['category'] in ('hold','conflict','unsupported') and decisions.get(x['item_id'],{}).get('action')!='resolve']
 require(editorial.strict_json(decision_bytes.decode())==doc,'Decision artifact mismatch')
 report=['# Unapplied editorial changes','',f'Guides: {len(ids)}; distinct facts: {len(facts)}; additions: {len(changes)}; removals: 0.','']
 for change in changes:
  value=change['after'];report.append('- '+change['guide_id']+' — '+value.get('kind','waterway')+': '+value.get('value',value.get('name',''))+' | before: absent | after: '+editorial.canonical(value))
 if not changes:report.append('No product changes were proposed.')
 result={'schema_version':1,'status':'unapplied_release_rehearsal','base_commit':base_commit,
  'input_hashes':{'baseline_sha256':model['baseline_sha256'],'candidate_sha256':model['candidate_sha256'],'followup_sha256':model['followup_sha256'],'model_sha256':model['model_sha256'],'decision_sha256':sha_bytes(decision_bytes)},
  'test_evidence':evidence or {'status':'not_supplied','required_checks':['editorial unit tests','release package tests','ordinary and synthetic isolated browsers','visual preview browser'],'note':'Run the documented checks; no test pass is implied.'},
  'decision_artifact':decision_bytes.decode(),'decisions':copy.deepcopy(doc['decisions']),'review_context':patch['review_context'],'evidence':patch['evidence'],
  'counts':{'affected_guides':len(ids),'distinct_facts':len(facts),'source_specific_additions':len(changes),'removals':0,'unresolved_items':len(unresolved)},
  'affected_guide_ids':ids,'changes':changes,'readable_diff':'\n'.join(report)+'\n','unresolved':unresolved,'before_files':raw_before,'after_files':after,
  'file_hashes':{'before':{k:sha_bytes(v.encode()) for k,v in sorted(raw_before.items())},'after':{k:sha_bytes(v.encode()) for k,v in sorted(after.items())}},
  'before_hash':state_hash(raw_before),'after_hash':state_hash(after),
  'reverse_patch':{'requires_after_hash':state_hash(after),'restores_before_hash':state_hash(raw_before),'files':raw_before},
  'publication_approved':False}
 return result

def validate_package(package,model,commit,decision_bytes,raw_before,proposed_state=None):
 require(package.get('schema_version')==1 and package.get('publication_approved') is False,'Invalid package')
 require(package.get('base_commit')==commit,'Stale base commit')
 require(package['input_hashes']=={'baseline_sha256':model['baseline_sha256'],'candidate_sha256':model['candidate_sha256'],'followup_sha256':model['followup_sha256'],'model_sha256':model['model_sha256'],'decision_sha256':sha_bytes(decision_bytes)},'Stale inputs')
 require(package['decision_artifact'].encode()==decision_bytes,'Changed decision artifact')
 require(package['before_files']==raw_before and state_hash(package['before_files'])==package['before_hash'],'Changed before files')
 require(state_hash(package['after_files'])==package['after_hash'],'Changed proposed output')
 require(package['file_hashes']=={'before':{k:sha_bytes(v.encode()) for k,v in sorted(raw_before.items())},'after':{k:sha_bytes(v.encode()) for k,v in sorted(package['after_files'].items())}},'Changed individual file hashes')
 if proposed_state is not None:require(state_hash(proposed_state)==package['after_hash'],'Proposed state does not match rollback guard')
 reverse=package['reverse_patch'];require(reverse['requires_after_hash']==package['after_hash'] and reverse['restores_before_hash']==package['before_hash'] and reverse['files']==raw_before,'Invalid reverse patch')
 require(state_hash(reverse['files'])==reverse['restores_before_hash'],'Rollback does not restore original bytes')
 return True

def main():
 p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='cmd',required=True)
 for name in ('generate','validate'):
  q=sub.add_parser(name);q.add_argument('--decisions',type=Path,required=True);q.add_argument('--base-commit',required=True)
  q.add_argument('--output' if name=='generate' else '--package',type=Path,required=True)
  if name=='generate':q.add_argument('--test-evidence',type=Path)
  else:q.add_argument('--proposed-dir',type=Path)
 args=p.parse_args();check_git_base(args.base_commit);model=editorial.load_model();raw={p.relative_to(ROOT).as_posix():p.read_text(encoding='utf-8') for p in (editorial.ATTRS,editorial.WATERS)};decisions=args.decisions.read_bytes();doc=editorial.strict_json(decisions.decode())
 if args.cmd=='generate':
  known={r['registration'] for r in editorial.read(editorial.REGISTRY)}|set(editorial.read(ROOT/'lib/washington-stable-ids.json').values())
  evidence=None
  if args.test_evidence:
   data=args.test_evidence.read_bytes();editorial.strict_json(data.decode());evidence={'status':'provided_not_independently_verified','sha256':sha_bytes(data),'artifact':data.decode()}
  package=build_package(doc,model,editorial.read(editorial.ATTRS),editorial.read(editorial.WATERS),editorial.read(editorial.HOLDS),known,args.base_commit,raw,decisions,evidence)
  editorial.write_safe(args.output,json.dumps(package,indent=2,ensure_ascii=False)+'\n');print('Unapplied package:',args.output.resolve());print(json.dumps(package['counts'],sort_keys=True))
 else:
  package=editorial.read(args.package);proposed={p:(args.proposed_dir/p).read_text(encoding='utf-8') for p in raw} if args.proposed_dir else None
  validate_package(package,model,args.base_commit,decisions,raw,proposed)
  evidence=package['test_evidence']
  if evidence.get('status')=='provided_not_independently_verified':
   require(set(evidence)=={'status','sha256','artifact'} and sha_bytes(evidence['artifact'].encode())==evidence['sha256'],'Changed test evidence');editorial.strict_json(evidence['artifact'])
  else:require(evidence=={'status':'not_supplied','required_checks':['editorial unit tests','release package tests','ordinary and synthetic isolated browsers','visual preview browser'],'note':'Run the documented checks; no test pass is implied.'},'Unrecognized test evidence')
  # Recompute the full proposal and reject forged/tampered change sets and counts.
  known={r['registration'] for r in editorial.read(editorial.REGISTRY)}|set(editorial.read(ROOT/'lib/washington-stable-ids.json').values())
  expected=build_package(doc,model,editorial.read(editorial.ATTRS),editorial.read(editorial.WATERS),editorial.read(editorial.HOLDS),known,args.base_commit,raw,decisions,package['test_evidence'])
  require(package==expected,'Package content or decisions changed');print('Package and byte-exact reverse patch verified; nothing applied.')
if __name__=='__main__':
 try:main()
 except (ValueError,KeyError,TypeError,OSError,subprocess.CalledProcessError) as exc:print('ERROR:',exc,file=sys.stderr);sys.exit(1)
