#!/usr/bin/env python3
"""Reproduce an offline Washington snapshot and conservative candidate review queue.

No network, database writes, profile IDs, merges, or editorial approvals are made.
"""
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'tony fisher','shane magnuson','casey weigel','marc bush','nicholas ney','daniel benowitz','jeffrey keightley sr.'}
SOCIAL = {'facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com', 'x.com', 'linkedin.com'}


def key(value):
    value = unicodedata.normalize('NFKD', str(value or '')).casefold()
    return ' '.join(re.findall(r'[a-z0-9]+', ''.join(c for c in value if not unicodedata.combining(c))))


def compact(value): return key(value).replace(' ', '')


def domain(value):
    if not value: return ''
    try:
        u = urlsplit(value if '://' in value else 'https://' + value)
        host = (u.hostname or '').lower().removeprefix('www.').rstrip('.')
        if u.scheme not in ('http', 'https') or not host or '.' not in host or u.username or u.password: return ''
        if any(host == x or host.endswith('.' + x) for x in SOCIAL): return ''
        return host
    except ValueError:
        return ''


def phone(value):
    digits = re.sub(r'\D', '', value or '')
    if len(digits) == 11 and digits.startswith('1'): digits = digits[1:]
    return digits if len(digits) == 10 else ''


def read_json(path): return json.loads((ROOT / path).read_text())


def source_key(row):
    # Mirrors washingtonSourceKey, not the more aggressive fuzzy matcher.
    def norm(s): return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC',s or '').strip().lower())
    return json.dumps([norm(row['name']),norm(row['business']),norm(row['source'])],ensure_ascii=False,separators=(',',':'))


def load_snapshot():
    raw = read_json('lib/washington-raw.json'); ids = read_json('lib/washington-stable-ids.json')
    enrich = read_json('lib/guide-enrichment.json'); attrs = read_json('lib/approved-guide-attributes.json')
    wa=[]
    for row in raw:
        if row['name'].strip().lower() in EXCLUDED: continue
        row = dict(row); row['id'] = ids[source_key(row)]; row['state']='WA'; row['website']=''; row['phone']=''
        entry = enrich.get(row['id'], {})
        row['operator_urls'] = [x['url'] for x in entry.get('sourceLinks',[]) if x.get('sourceType')=='operator_site'] + [x['sourceUrl'] for x in entry.get('advertisedWaters',[]) if x.get('sourceType')=='operator_site']
        row['waters'] = [x['name'] for x in entry.get('advertisedWaters',[])]
        row['species'] = [x['value'] for x in attrs if x.get('guide_id')==row['id'] and x.get('kind')=='species' and x.get('editorial_status')=='approved' and x.get('publication_approved') is True]
        wa.append(row)
    ore=[]
    for row in read_json('lib/oregon-guides.json'):
        ore.append({**row,'id':row['registration'],'state':'OR','phone':'','operator_urls':[]})
    return raw, wa, ore


def groups(rows,field):
    grouped=defaultdict(list)
    for row in rows:
        value=key(row.get(field,''))
        if value: grouped[value].append(row['id'])
    return {k:v for k,v in grouped.items() if len(v)>1}


def baseline(raw,wa,ore):
    return {'population':'repository static snapshot; source rows are not people or current production DB counts',
            'raw_washington_source_rows':len(raw),'displayed_washington_person_rows':len(wa),
            'oregon_registry_rows':len(ore),'washington_raw_rows_excluded_from_wa_display':len(raw)-len(wa),
            'wa_rows_without_raw_website_field':sum('website' not in r or not r.get('website') for r in raw),
            'wa_displayed_with_operator_site_evidence':sum(bool(r['operator_urls']) for r in wa),
            'wa_displayed_with_no_operator_site_evidence':sum(not r['operator_urls'] for r in wa),
            'wa_displayed_with_approved_species':sum(bool(r['species']) for r in wa),
            'wa_displayed_with_source_linked_waters':sum(bool(r['waters']) for r in wa),
            'wa_displayed_with_source_notes':sum(bool(r.get('notes')) for r in wa),
            'same_normalized_person_name_groups_review_only':groups(wa,'name'),
            'same_normalized_business_groups_review_only':groups(wa,'business'),
            'warning':'Shared business can represent different captains; neither grouped names nor businesses establish duplicate people. Source notes are not verified service areas.'}


def matches(candidate, existing):
    """Signals create review holds only; do not merge records, people or fleets."""
    out=[]; cn=compact(candidate['business']); person=compact(candidate.get('guide_name',''))
    cd=domain(candidate.get('listed_website')); cp=phone(candidate.get('public_phone'))
    for row in existing:
        rb=compact(row.get('business')); rn=compact(row.get('name'))
        evidence=[]
        if cn and rb and cn==rb: evidence.append('same_business_normalized')
        elif cn and rb and min(len(cn),len(rb))>=12 and SequenceMatcher(None,cn,rb).ratio()>=.90:
            evidence.append('similar_business_review')
        if person and rn and person==rn: evidence.append('same_person_name_review')
        domains={domain(row.get('website',''))}|{domain(x) for x in row.get('operator_urls',[])}
        if cd and cd in domains: evidence.append('same_domain_review')
        if cp and cp==phone(row.get('phone','')): evidence.append('same_phone_review')
        if not evidence: continue
        # Source notes are hints, not a reliable service-area negative.
        city=key(candidate.get('city','')); note=key(row.get('notes',''))
        geography='overlap_hint' if city and note and city in note else 'unknown'
        out.append({'id':row['id'],'state':row['state'],'name':row.get('name',''),
                    'business':row.get('business',''),'signals':evidence,'geography':geography})
    return out


def audit(candidates, wa, ore):
    output=[]
    for row in candidates:
        found=matches(row,wa+ore)
        other=[]
        for c in candidates:
            if c['candidate_id'] == row['candidate_id']: continue
            signals=[]
            if compact(c['business']) and compact(c['business'])==compact(row['business']): signals.append('same_business_normalized')
            if domain(row['listed_website']) and domain(row['listed_website'])==domain(c['listed_website']): signals.append('same_domain_review')
            if phone(row['public_phone']) and phone(row['public_phone'])==phone(c['public_phone']): signals.append('same_phone_review')
            if signals: other.append({'id':c['candidate_id'],'signals':signals})
        output.append({**row,'snapshot_matches':found,'candidate_match_signals':other,
                       'triage':'possible_existing_match' if found or other else 'no_match_found_in_snapshot',
                       'manual_review_required':True,
                       'integration_status':'held_no_identity_or_publication_approval'})
    return output


def review_search(rows, query):
    terms=key(query).split()
    fields=('business','guide_name','aliases','species','waterbodies','city','port')
    return [row for row in rows if all(term in key(' '.join(row.get(f,'') for f in fields)).split() for term in terms)]


def safe_cell(value):
    value=str(value)
    return "'"+value if value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else value


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidates',default='docs/research/washington-expansion/candidates.csv')
    parser.add_argument('--out',required=True)
    parser.add_argument('--query',default='',help='Internal review search across name, alias, species, water, port and area')
    args=parser.parse_args(); raw,wa,ore=load_snapshot()
    path=ROOT / args.candidates
    with path.open(newline='',encoding='utf-8') as f: candidates=list(csv.DictReader(f))
    if len({r['candidate_id'] for r in candidates})!=len(candidates): raise ValueError('Duplicate candidate IDs')
    if any(r['publication_approved']!='false' or not r['source_url'] or not r['collected_at'] for r in candidates): raise ValueError('Unheld or unsourced candidate')
    data=audit(candidates,wa,ore); out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    hosted=read_json('docs/research/washington-expansion/hosted-aggregate-20261117.json')
    if hosted['candidate_file_sha256'] != hashlib.sha256(path.read_bytes()).hexdigest():
        raise ValueError('Hosted comparison applies to a different candidate snapshot')
    hosted_matches=set(hosted['exact_published_business_match_candidate_ids'])
    for row in data:
        row['hosted_exact_outfit_match'] = row['candidate_id'] in hosted_matches
        if row['hosted_exact_outfit_match']: row['triage']='possible_existing_match'
    counts=Counter(r['triage'] for r in data)
    selected=review_search(data,args.query)
    summary={'baseline':baseline(raw,wa,ore),'candidate_rows':len(data), 'search_query':args.query, 'matching_review_rows':len(selected), 'triage_counts':dict(counts),
             'operator_site_observed':sum(r['website_status']=='operator_site_observed' for r in data),
             'directory_link_not_independently_verified':sum(r['website_status']=='directory_link_unverified' for r in data),
             'species_mentioned':sum(bool(r['species']) for r in data),
             'waterbody_mentioned':sum(bool(r['waterbodies']) for r in data),
             'species_and_waterbody_mentioned':sum(bool(r['species'] and r['waterbodies']) for r in data),
             'manual_review_required':len(data),'hosted_exact_outfit_match_candidates':len(hosted_matches),
             'hosted_snapshot':hosted, 'actual_verified_net_new':None,
             'input_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
             'note':'No-match is a provisional candidate, not proof of a unique new guide. All business/person relationships, site links, license and publication remain unverified.'}
    (out/'baseline-and-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    (out/'candidate-review.json').write_text(json.dumps(selected,indent=2)+'\n')
    fields=['candidate_id','business','guide_name','aliases','city','port','public_phone','listed_website','website_status','species','waterbodies','source_url','operator_source_url','collected_at','confidence','triage','hosted_exact_outfit_match','snapshot_match_ids','manual_review_required','integration_status']
    with (out/'candidate-review.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader()
        for row in selected:
            flat={**row,'snapshot_match_ids':';'.join(x['id'] for x in row['snapshot_matches'])}
            w.writerow({k: safe_cell(flat.get(k,'')) for k in fields})
    print(json.dumps({k:v for k,v in summary.items() if k!='baseline'},indent=2))


if __name__=='__main__': main()
