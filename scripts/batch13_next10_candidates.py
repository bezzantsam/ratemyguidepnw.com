#!/usr/bin/env python3
"""Convert the next-ten review into an unpublished, evidence-preserving proposal."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

import batch13_next10_review as review_validator

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'docs/research/BATCH13_NEXT10_SOURCE_REVIEW_20261115.json'
SELECTION = ROOT / 'docs/research/BATCH13_NEXT10_SELECTION_20261115.json'
REGISTRY = ROOT / 'lib/oregon-guides.json'
OUTPUT = ROOT / 'docs/research/BATCH13_NEXT10_PENDING_CANDIDATES.json'
WATERS = ROOT / 'docs/research/BATCH13_NEXT10_PENDING_WATERS.json'
REPORT = ROOT / 'docs/research/BATCH13_NEXT10_CANDIDATE_REPORT.md'
FIELDS = {'advertised_species': 'species', 'advertised_methods': 'method', 'advertised_trip_types': 'trip_type'}


def build(review, selection_bytes, registry):
    """Validate exact identities and group boundaries before producing any output."""
    review_validator.validate(review, selection_bytes, registry)
    sources = review['sources']
    def source(source_id):
        item = sources[source_id]
        return {'source_id': source_id, 'url': item['url'], 'source_type': item['source_type'],
                'reviewed_on': item['reviewed_on'], 'locator': item['locator'],
                'retrieval_method': item['method'], 'source_content_date': item['content_date']}

    output = {'schema_version': 1, 'status': 'pending_review_only', 'publication_approved': False,
              'reviewed_on': review['reviewed_on'], 'attributes': [], 'pending_waters': [], 'holds': [],
              'limitations': ['Operator offerings do not establish an individual guide’s expertise.',
                  'Separate lists are independent; only explicit relationships connect attributes.',
                  'Review dates do not establish publication dates, current availability or direct-server capture.',
                  'Evidence URLs are not registry corrections or approved booking links.']}
    seen = set()
    for row in review['records']:
        identity = {'assessment': row['identity']['assessment'], 'legal_identity_verified': False,
                    'sources': [source(sid) for sid in row['identity']['source_ids']]}
        common = {'guide_id': row['registration_id'], 'directory_name': row['imported_name'],
                  'directory_business': row['imported_business'], 'registry_website': row['registry_website'], 'identity_evidence': identity,
                  'limitations': copy.deepcopy(row['limitations']), 'editorial_status': 'pending',
                  'publication_approved': False}
        if row['review_status'] != review_validator.SUPPORTED:
            output['holds'].append({**copy.deepcopy(common), 'name': row['imported_name'],
                'review_status': row['review_status'], 'registry_website': row['registry_website'],
                'reason': row['identity']['assessment'],
                'held_observations': [{**copy.deepcopy(note), 'source': source(note['source_id'])} for note in row['held_observations']],
                'failed_or_limited_fetches': copy.deepcopy(row['failed_or_limited_fetches'])})
            continue
        for fact in row['facts']:
            attribution = source(fact['source_id'])
            def emit(target, kind, value, relationship=None):
                key=(row['registration_id'], target, kind, value, fact['source_id'],
                     json.dumps(relationship,sort_keys=True) if relationship else '')
                if key in seen: return
                seen.add(key)
                item={**copy.deepcopy(common), 'value': value, 'source': copy.deepcopy(attribution),
                      'evidence_scope': fact['scope']}
                if kind is not None: item['kind']=kind
                if relationship is not None: item['relationship']=copy.deepcopy(relationship)
                output[target].append(item)
            for field, kind in FIELDS.items():
                for value in fact[field]: emit('attributes',kind,value)
            for water in fact['advertised_waters']: emit('pending_waters',None,water)
            # Anchor each explicit relationship to its source-stated species once.
            for relationship in fact['explicit_relationships']:
                emit('attributes','species',relationship['species'],relationship)
    output['counts']={'supported_records':sum(r['review_status']==review_validator.SUPPORTED for r in review['records']),
                      'held_records':len(output['holds']), 'attributes':len(output['attributes']),
                      'standalone_attributes':sum('relationship' not in x for x in output['attributes']),
                      'relationship_attributes':sum('relationship' in x for x in output['attributes']),
                      'pending_waters':len(output['pending_waters']),
                      'distinct_standalone_attributes':len({(x['guide_id'],x['kind'],x['value'].casefold()) for x in output['attributes'] if 'relationship' not in x}),
                      'distinct_guide_waters':len({(x['guide_id'],x['value'].casefold()) for x in output['pending_waters']})}
    return output


def render(result):
    c=result['counts']
    lines=['# Next ten: pending discovery candidates', '',
      'Review-only conversion. No item is approved or published. Each attribute retains its original source, locator, review date, identity evidence, scope and limitations in the JSON proposal.', '',
      f"Counts: {c['supported_records']} supported records; {c['held_records']} held records; {c['standalone_attributes']} source-specific standalone attributes ({c['distinct_standalone_attributes']} distinct by guide, kind and value); {c['relationship_attributes']} explicitly sourced relationship attributes; {c['attributes']} total attribute entries; {c['pending_waters']} source-specific water entries ({c['distinct_guide_waters']} distinct guide-water pairs).", '',
      'Business offerings are not individual expertise. Independent lists are not trip combinations; summer trout methods are not transferred to winter steelhead. Evidence URLs do not replace registry URLs. Standalone water records are in `BATCH13_NEXT10_PENDING_WATERS.json`.', '']
    for row in result['holds']:
        lines += [f"## Held: {row['guide_id']} — {row['name']}", '', f"Status: {row['review_status']}. {row['reason']}"]
        lines += ['- '+x for x in row['limitations']]
        lines.append('')
    for ident in sorted({x['guide_id'] for x in result['attributes']}):
        first=next(x for x in result['attributes'] if x['guide_id']==ident)
        lines += [f"## Pending: {ident} — {first['directory_name']}", '',
                  f"Imported business: {first['directory_business'] or '(not listed)'}. Registry website retained as supplied: `{first['registry_website'] or '(not listed)'}`.",
                  'Identity assessment: '+first['identity_evidence']['assessment']]
        for src in first['identity_evidence']['sources']:
            lines.append(f"- Identity source: {src['url']} ({src['locator']}; reviewed {src['reviewed_on']}).")
        for item in result['attributes']:
            if item['guide_id'] != ident: continue
            relation = ('; explicit relationship: '+', '.join(f'{k}={v}' for k,v in item['relationship'].items())) if 'relationship' in item else ''
            lines.append(f"- {item['kind']}: {item['value']}{relation} — {item['source']['url']} ({item['source']['locator']}; reviewed {item['source']['reviewed_on']}).")
        lines.append('- Separate pending waters:')
        for item in result['pending_waters']:
            if item['guide_id'] == ident:
                lines.append(f"  - {item['value']} — {item['source']['url']} ({item['source']['locator']}; reviewed {item['source']['reviewed_on']}).")
        for note in next(x['limitations'] for x in result['attributes'] if x['guide_id']==ident): lines.append('- Limitation: '+note)
        lines.append('')
    return '\n'.join(lines).rstrip()+'\n'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    source_bytes=REVIEW.read_bytes();selection=SELECTION.read_bytes();registry_bytes=REGISTRY.read_bytes()
    result=build(json.loads(source_bytes),selection,json.loads(registry_bytes))
    result['input_sha256']={p.name:hashlib.sha256(data).hexdigest() for p,data in ((REVIEW,source_bytes),(SELECTION,selection),(REGISTRY,registry_bytes))}
    water_doc={'schema_version':1,'status':'pending_review_only','publication_approved':False,
               'reviewed_on':result['reviewed_on'],'input_sha256':result['input_sha256'],
               'waters':result['pending_waters']}
    attribute_doc={k:v for k,v in result.items() if k!='pending_waters'}
    artifacts={OUTPUT:json.dumps(attribute_doc,indent=2,ensure_ascii=False)+'\n',
               WATERS:json.dumps(water_doc,indent=2,ensure_ascii=False)+'\n',REPORT:render(result)}
    if args.check:
        for path,contents in artifacts.items():
            if not path.exists() or path.read_text(encoding='utf-8') != contents: raise SystemExit('Outdated proposal: '+str(path))
        print('Next-ten candidate artifacts match the reviewed inputs.')
    else:
        for path,contents in artifacts.items(): path.write_text(contents,encoding='utf-8')
        print(json.dumps(result['counts'],sort_keys=True))

if __name__=='__main__': main()
