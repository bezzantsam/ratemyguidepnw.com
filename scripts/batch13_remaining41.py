#!/usr/bin/env python3
"""Validate all final Batch 13 records and emit an unpublished population bundle."""
import argparse
import csv
import copy
import hashlib
import io
import ipaddress
import json
from pathlib import Path
from urllib.parse import urlsplit
import batch13_next10_review as core

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'docs/research/BATCH13_REMAINING41_SOURCE_REVIEW_20261115.json'
SELECTION = ROOT / 'docs/research/BATCH13_REMAINING41_SELECTION_20261115.json'
BASELINE = '5c70d488478cdc833a1becbeae163533329e6be7'
PRIOR_SELECTION = ROOT / 'docs/research/BATCH13_NEXT10B_SELECTION_20261115.json'
PRIOR_REVIEW = ROOT / 'docs/research/BATCH13_NEXT10B_SOURCE_REVIEW_20261115.json'
PRIOR_BLOBS = {PRIOR_SELECTION.name: 'c870d96bfb9500fe82fba84d76edeaef9b9fd390',
               PRIOR_REVIEW.name: '7ca8efa32930275ab481343dcabc6e5defeb0e08'}
STATUSES = core.STATUSES | {'identity_review_hold', 'operator_source_hold', 'source_access_hold'}
HOLD_IDS = {'OG.0002727','OG.0002817','OG.0002938','OG.0003060','OG.0003154','OG.0003191',
 'OG.0003288','OG.0003361','OG.0003468','OG.0003538','OG.0003540','OG.0003606','OG.0003609',
 'OG.0003633','OG.0003634','OG.0003691','OG.0003701','OG.0003716','OG.0003817','OG.0003834',
 'OG.0003836','OG.0003837','OG.0003842','OG.0003868','OG.0003960','OG.0004090'}

def blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()

def registry_comparison(review, registry):
    """Retain both exact strings for the one inspected historical whitespace mismatch.

    No general trimming, fuzzy matching, public-data edit or identity approval.
    The comparison-only copy cannot change the caller's registry.
    """
    comparison = copy.deepcopy(registry)
    discrepancies = []
    for original, item in zip(registry, comparison):
        if item.get('registration') != 'OG.0003288' or item.get('business') != 'Tenacity Outdoors ':
            continue
        record = next((r for r in review['records'] if r['registration_id'] == 'OG.0003288'), None)
        core.require(record is not None and record['review_status'] == 'name_variant_hold'
                     and record['facts'] == [] and record['imported_business'] == 'Tenacity Outdoors',
                     'Whitespace exception requires the unchanged held manifest record')
        core.require(item.get('name') == 'John Kaiser' and item.get('website') == 'tenacityoutdoors.com',
                     'Whitespace exception cannot change the person or source domain')
        discrepancies.append({'guide_id':'OG.0003288','field':'business',
            'registry_value':original['business'],'manifest_value':record['imported_business'],
            'resolution':'Comparison-only handling of one inspected trailing ASCII space; both source strings retained; identity remains held.'})
        item['business'] = record['imported_business']
    return comparison, discrepancies

def validate(review, selection_bytes, registry):
    comparison, discrepancies = registry_comparison(review, registry)
    result = core.validate(review, selection_bytes, comparison, selection_path=SELECTION,
        expected_prior_count=70, selection_count=41, statuses=STATUSES,
        source_types={'operator_site','industry_directory','tourism_directory'},
        source_methods={'parsed_page','indexed_page_text'},
        fetch_results={'tool_unavailable','timeout','http_404','no_readable_text'})
    selection=json.loads(selection_bytes)
    core.require(selection['baseline_commit']==BASELINE,'Baseline changed')
    core.require(selection['prior_selection_path']==str(PRIOR_SELECTION.relative_to(ROOT)), 'Prior path changed')
    core.require(selection['prior_selection_git_blob_sha']==PRIOR_BLOBS[PRIOR_SELECTION.name], 'Prior blob changed')
    core.require(selection['original_manifest_git_blob_sha']=='e39cadfad510d1f7407d79a6f124b1ad0981cc9e', 'Manifest blob changed')
    core.require(result['cumulative_checked']==111 and result['remaining_unchecked']==0, 'Coverage incomplete')
    for s in review['sources'].values():
        host=urlsplit(s['url']).hostname.lower()
        core.require('.' in host and host not in {'localhost','localhost.localdomain'} and not host.endswith(('.local','.internal','.localhost')), 'Non-public source hostname')
        try: ipaddress.ip_address(host)
        except ValueError: pass
        else: raise ValueError('Literal-IP source URL not accepted')
    rows={r['registration_id']:r for r in review['records']}
    core.require({i for i,r in rows.items() if r['review_status']!=core.SUPPORTED}==HOLD_IDS, 'Frozen editorial holds changed')
    # Domain correction, category correction, and name linkage are distinct decisions.
    core.require(rows['OG.0003361']['review_status']=='name_variant_hold', 'Vertical trip evidence must retain individual hold')
    core.require(rows['OG.0003154']['review_status']==rows['OG.0003634']['review_status']==rows['OG.0003868']['review_status']==rows['OG.0004090']['review_status']=='identity_review_hold', 'Wrong-person hold lost')
    core.require(rows['OG.0003538']['review_status']==rows['OG.0003842']['review_status']=='category_review_hold', 'Paddling converted to fishing')
    core.require(rows['OG.0003540']['review_status']==rows['OG.0003701']['review_status']=='source_access_hold', 'Indexed-only access hold lost')
    core.require(rows['OG.0003643']['registry_website']=='Jackcreeckguidedadventures.com', 'Registry typo overwritten')
    for row in review['records']:
        if row['review_status']==core.SUPPORTED:
            core.require(all(review['sources'][s]['method']=='parsed_page' for s in row['identity']['source_ids']), 'Supported identity relies on indexed-only text')
    # Business-page text must not turn broad species into unsupported subspecies.
    core.require([f['advertised_species'] for f in rows['OG.0003823']['facts']]==[['Salmon']], 'Broad salmon expanded')
    core.require(all(not f['advertised_species'] and not f['advertised_methods'] for f in rows['OG.0003697']['facts']), 'Book topics became trip expertise')
    ry=rows['OG.0003383']['facts'][0]
    core.require(ry['explicit_relationships']==[{'waterway':'Sacramento River','species':'Striped Bass'},{'waterway':'Upper Rogue River','species':'Chinook Salmon'}], 'Ryan trip relationships crossed')
    for r in rows.values():
        for f in r['facts']:
            core.require('Lake Sturgeon' not in f['advertised_species'], 'Unsupported species label')
            core.require('Fintruder' not in f['advertised_waters'], 'Boat name became water')
    result['registry_discrepancies'] = discrepancies
    return result

def validate_repository(review, selection_bytes, registry):
    """Check the actual earlier files/registry, not a reconstructed local selection."""
    import batch13_next10b_review as prior
    for path in (PRIOR_SELECTION,PRIOR_REVIEW):
        core.require(blob(path.read_bytes())==PRIOR_BLOBS[path.name], 'Pinned prior source changed: '+path.name)
    old_selection=json.loads(PRIOR_SELECTION.read_text())
    old_review=json.loads(PRIOR_REVIEW.read_text())
    prior.validate(old_review,PRIOR_SELECTION.read_bytes(),registry)
    selection=json.loads(selection_bytes)
    expected_prior=sorted(set(old_selection['previously_checked_registration_ids']) | {r['registration_id'] for r in old_review['records']})
    core.require(selection['previously_checked_registration_ids']==expected_prior, 'Prior 70 IDs do not reconcile')
    core.require(selection['manifest_registration_ids']==old_selection['manifest_registration_ids'], 'Manifest universe differs')
    core.require(len(registry)==1027,'Unexpected complete-registry size; review changes explicitly')
    core.require(blob(core.REGISTRY.read_bytes())=='a0d2515e171f4204ade4b87a4d6c8508108ec766', 'Complete registry snapshot changed; inspect before reuse')
    return validate(review,selection_bytes,registry)

def build(review, selection_bytes, registry):
    validate(review,selection_bytes,registry)
    # Reuse the existing population contract and converter; no public app import.
    import batch13_next10_candidates as converter
    result=converter.build(review,selection_bytes,registry,validate_fn=validate)
    result['batch_id']='batch13-remaining41-20261115'
    result['coverage']=review['scope']
    _, discrepancies = registry_comparison(review, registry)
    result['registry_discrepancies'] = discrepancies
    for hold in result['holds']:
        hold['registry_discrepancies'] = [d for d in discrepancies if d['guide_id'] == hold['guide_id']]
    result['input_sha256']={'review':hashlib.sha256(REVIEW.read_bytes()).hexdigest(),
                            'selection':hashlib.sha256(selection_bytes).hexdigest()}
    result['limitations'] += ['Seven records have only unsuccessful retrieval attempts; indexed-only sources are held.',
      'The preceding 70 were checked or attempted, not all approved or populated. Full 111-record coverage does not mean 111 verified guides.']
    return result

def render(result):
    c=result['counts']; lines=['# Remaining 41 guide records: population handoff','',
      'Research complete for this selection; no live profiles changed and no publication approval granted.','',
      f"Coverage: 70 earlier + 41 current = 111/111 checked or attempted; 0 unchecked in this manifest.",
      f"This batch: {c['supported_records']} source-supported candidate records; {c['held_records']} held records.",
      f"Population entries: {c['standalone_attributes']} standalone attributes; {c['relationship_attributes']} explicit relationships; {c['pending_waters']} separate water records.",'',
      'Only attributed operator facts feed pending attributes. Held observations, directory claims, indexed-only content, credentials, prices and ratings never feed discovery.','',
      'Use the generated CANDIDATES.json and WATERS.json as review inputs, not as replacements for approved-guide-attributes.json. Preserve all original guide IDs.','',
      '## Candidate records','']
    for i in sorted({a['guide_id'] for a in result['attributes']} | {a['guide_id'] for a in result['pending_waters']}):
        items=[a for a in result['attributes']+result['pending_waters'] if a['guide_id']==i]
        first=items[0]
        lines += [f"### {i} — {first['directory_name']}",first['identity_evidence']['assessment']]
        for a in items:
            rel='; relationship: '+json.dumps(a['relationship'],ensure_ascii=False) if 'relationship' in a else ''
            lines.append(f"- {a.get('kind','waterway')}: {a['value']}{rel} — {a['source']['url']} ({a['source']['locator']})")
        lines += ['Limitations: '+' '.join(first['limitations']),'']
    lines += ['## Original registry discrepancies','']
    for discrepancy in result.get('registry_discrepancies', []):
        lines += [json.dumps(discrepancy, ensure_ascii=False), '']
    lines += ['## Holds','']
    for r in result['holds']:
        lines += [f"### {r['guide_id']} — {r['name']} ({r['review_status']})",r['reason']]
        for o in r['held_observations']: lines.append(o['note']+' Source: '+o['source']['url'])
        for f in r['failed_or_limited_fetches']: lines.append('Attempt: '+f['url']+' — '+f['result'])
        lines.append('')
    lines += ['## Limits','All retrieval failures describe the research tool outcome, not business closure. Parsed/indexed pages can be cached. Review dates are not publication dates. Real identity, credentials, current availability and source truth are not established by structural tests.','']
    return '\n'.join(lines)

def artifacts(result):
    attrs={k:v for k,v in result.items() if k!='pending_waters'}
    waters={'schema_version':1,'status':'pending_review_only','publication_approved':False,
            'reviewed_on':result['reviewed_on'],'input_sha256':result['input_sha256'],'waters':result['pending_waters']}
    buf=io.StringIO(); writer=csv.writer(buf)
    writer.writerow(['guide_id','directory_name','kind','value','relationship','source_url','source_locator','reviewed_on','editorial_status','publication_approved'])
    for x in result['attributes']+result['pending_waters']:
        # Neutralize spreadsheet formula execution in all externally sourced cells.
        vals=[x['guide_id'],x['directory_name'],x.get('kind','waterway'),x['value'],json.dumps(x.get('relationship',{}),ensure_ascii=False),x['source']['url'],x['source']['locator'],x['source']['reviewed_on'],'pending','false']
        writer.writerow([("'"+v if v and v[0] in '=+-@' else v) for v in vals])
    return {'CANDIDATES.json':json.dumps(attrs,indent=2,ensure_ascii=False)+'\n',
            'WATERS.json':json.dumps(waters,indent=2,ensure_ascii=False)+'\n',
            'POPULATION.csv':buf.getvalue(),'REPORT.md':render(result)}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output-dir',type=Path,default=ROOT/'outputs/batch13-remaining41')
    p.add_argument('--check',action='store_true',help='Check an already generated bundle without modifying it')
    a=p.parse_args(); review=json.loads(REVIEW.read_text()); selection=SELECTION.read_bytes();registry=json.loads(core.REGISTRY.read_text())
    validation=validate_repository(review,selection,registry)
    result=build(review,selection,registry); generated=artifacts(result)
    out=a.output_dir.resolve()
    core.require(out!=ROOT and not any(p in out.parts for p in ['lib','public','app','supabase']), 'Unsafe output destination')
    if a.check:
        for name,content in generated.items(): core.require((out/name).read_bytes().decode('utf-8')==content,'Non-reproducible artifact '+name)
    else:
        out.mkdir(parents=True,exist_ok=True)
        for name,content in generated.items():
            target=out/name
            core.require(not target.is_symlink(),'Refuse symlink output')
            if target.exists(): core.require(target.read_bytes().decode('utf-8')==content,'Refuse overwriting different artifact '+name)
            else: target.write_text(content,encoding='utf-8')
    print(json.dumps({'validation':validation,'population':result['counts']},indent=2,sort_keys=True))

if __name__=='__main__': main()
