#!/usr/bin/env python3
"""Build a human review pack, never an editorial decision or population patch."""
from collections import defaultdict
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
import editorial_review as e

# Deliberately small sample with directly inspected operator identity and offerings.
IDS=('OG.0000236','OG.0000353','OG.0000419','OG.0000642','OG.0003823')
OUTPUT=e.ROOT/'docs/qa/editorial-first-release-review.md'

def generate(model,attrs,waters,hard):
 guides={x['guide_id']:x for x in model['guides']};blocked={x['guide_id'] for x in model['items'] if x['category'] in ('hold','conflict','unsupported')}|{x['guide_id'] for x in hard['held_guides']}
 lines=['# First publication batch: editorial review only','',
  '**Recommendations are not approvals.** No decision file or product patch has been created. Each fact needs a separate decision by the editor. No current licensing, personal expertise or availability is asserted.','',
  'Selection: five non-held records with unchanged registry identity fields, direct parsed operator identity context and parsed operator offering evidence; all listed values fit the discovery contract. Existing exclusions and relationship-component requirements still apply. Identity context is not legal identity verification.','',
  'Manifest: 111 registrations; follow-up observations do not add guides. Original and both follow-up files remain separately traceable.','',
  f"Candidate hash: `{model['candidate_sha256']}`; prior follow-up: `{model['followup_sha256']}`; follow-up 16: `{model['followup16_sha256']}`; evidence model: `{model['model_sha256']}`.",'']
 for ident in IDS:
  g=guides[ident];e.require(ident not in blocked and g['disposition']=='pending_candidates' and not g['identity_differences'],'Record has unresolved dependency: '+ident)
  identity=g['identity_sources'];e.require(identity and all(x['source_type']=='operator_site' and x['method']=='parsed_page' and e.safe_source(e.evidence(x)) for x in identity.values()),'Identity context not direct operator evidence: '+ident)
  items=[x for x in model['items'] if x['guide_id']==ident and x['category'] in ('attribute','waterway','relationship')]
  e.require(items and all(model['sources'][x['source_id']]['source_type']=='operator_site' and model['sources'][x['source_id']]['retrieval_method']=='parsed_page' and x['record']['evidence_scope']=='operator_advertises' for x in items),'Unsupported candidate: '+ident)
  for item in items:
   for kind,value in item['record'].get('relationship',{}).items():
    e.require(any(x['category']==('waterway' if kind=='waterway' else 'attribute') and x['record'].get('kind', 'waterway')==kind and x['record']['value']==value for x in items),'Relationship missing component')
  reg=g['registry_identity'];current=[x for x in attrs if x['guide_id']==ident];current_water=waters.get(ident,{}).get('advertisedWaters',[])
  lines += [f"## {ident} — {reg['name']}",'',f"Registry business: {reg['business'] or '(not listed)'}; registry website: `{reg['website'] or '(not listed)'}`.",
   f"Identity context: {g['identity_evidence']['assessment']}"]
  for source in identity.values():lines.append(f"Identity source: [{source['url']}]({source['url']}) — {source['locator']} (operator page; review date not separately recorded)." if not source.get('reviewed_on') else f"Identity source: [{source['url']}]({source['url']}) — {source['locator']} (reviewed {source['reviewed_on']}).")
  lines += ['',f"Current display: registry name/business above; approved attributes: {e.canonical(current)}; advertised water entries: {e.canonical(current_water)}.",
    'Proposed display: the separate source-listed fields below, with business scope and attribution; the registry name and business remain unchanged.','',
    '| Proposed field | Source and locator | Evidence scope | Decision item |','| --- | --- | --- | --- |']
  for x in items:
   r=x['record'];s=model['sources'][x['source_id']];value=e.canonical(r['relationship']) if x['category']=='relationship' else r['value'];kind='explicit relationship' if x['category']=='relationship' else r.get('kind','waterway')
   esc=lambda v:str(v).replace('|','\\|').replace('\n',' ')
   lines.append(f"| {esc(kind)}: {esc(value)} | [{esc(s['url'])}]({s['url']}) — {esc(s['locator'])}; reviewed {s['reviewed_on']} | {esc(r['evidence_scope'])} | `{x['item_id']}` |")
  lines += ['', 'Limitations: '+ ' '.join(g['limitations']),
    '**Editorial recommendation:** Review the identity context and each listed source-backed business field for possible inclusion; retain the stated scope and limitations.',
    '**Sam’s decision:** For each item, choose approve, reject or hold with a reason in the existing editorial page. For an explicit relationship, decide each species and waterway component separately as well. No approval is inferred from this recommendation.','']
 return '\n'.join(lines).rstrip('\n')+'\n'

if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');a=p.parse_args()
 text=generate(e.load_model(),e.read(e.ATTRS),e.read(e.WATERS),e.read(e.HOLDS))
 if a.check:e.require(OUTPUT.read_text(encoding='utf-8')==text,'First-release pack is stale');print('First-release pack is current')
 else:OUTPUT.write_text(text,encoding='utf-8');print('Wrote',OUTPUT)
