#!/usr/bin/env python3
"""Offline WSGA review tooling. Never writes directory data or a database."""
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from difflib import SequenceMatcher
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

SOURCE = 'https://waguidesassociation.org/our-members/'
SOCIAL = {'facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com', 'x.com'}
EMAIL = re.compile(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}')
ACTION = re.compile(r'^(?:visit\b|website\b|email\b|phone\b|call\b)', re.I)
PHONE = re.compile(r'(?<!\d)(?:\+1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?!\d)')


def textkey(value):
    s = unicodedata.normalize('NFKD', value or '').casefold()
    return ' '.join(re.findall(r'[a-z0-9]+', s))


def domain(url):
    try:
        u = urlparse(url if '://' in url else 'https://' + url)
        host = (u.hostname or '').lower().removeprefix('www.').rstrip('.')
        if u.scheme not in ('http', 'https') or not host or u.username or u.password or '.' not in host:
            return ''
        if any(host == s or host.endswith('.' + s) for s in SOCIAL):
            return ''
        return host
    except ValueError:
        return ''


class Lines(HTMLParser):
    """Extract visible block/line text and literal links; no network calls."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.events, self.parts, self.links = [], [], []
        self.heading, self.heading_parts = None, []
        self.hidden = 0
        self.anchor = None

    def flush(self):
        s = ' '.join(''.join(self.parts).split())
        if s: self.events.append(('line', s, self.links))
        self.parts, self.links = [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style', 'noscript'): self.hidden += 1
        if self.hidden: return
        if re.fullmatch(r'h[1-6]', tag):
            self.flush(); self.heading, self.heading_parts = int(tag[1]), []
        elif tag == 'br': self.flush()
        elif tag in ('p', 'li', 'div', 'section', 'article'): self.flush()
        elif tag == 'a': self.anchor = {'href': attrs.get('href', ''), 'parts': []}

    def handle_data(self, data):
        if self.hidden: return
        if self.heading is not None: self.heading_parts.append(data)
        else: self.parts.append(data)
        if self.anchor is not None: self.anchor['parts'].append(data)

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript') and self.hidden:
            self.hidden -= 1; return
        if self.hidden: return
        if tag == 'a' and self.anchor is not None:
            self.links.append({'text': ' '.join(''.join(self.anchor['parts']).split()), 'href': self.anchor['href']})
            self.anchor = None
        elif re.fullmatch(r'h[1-6]', tag) and self.heading is not None:
            self.events.append(('heading', ' '.join(''.join(self.heading_parts).split()), self.heading))
            self.heading = None
        elif tag in ('p', 'li', 'div', 'section', 'article'): self.flush()

    def close(self):
        super().close(); self.flush()


def parse(html, captured_at):
    # Must be a real aware timestamp supplied by the acquisition manifest.
    stamp = datetime.fromisoformat(captured_at.replace('Z', '+00:00'))
    if stamp.tzinfo is None or stamp.utcoffset() is None: raise ValueError('capture time must include timezone')
    p = Lines(); p.feed(html); p.close()
    active, found, level, pending, rows = False, 0, None, [], []
    for kind, value, extra in p.events:
        if kind == 'heading':
            if value.casefold() == 'active professional guides and charter operators':
                found += 1; active, level = True, extra; continue
            if active and extra <= level:
                if pending: raise ValueError('incomplete active member before next section')
                active = False
            continue
        if not active: continue
        pending.append((value, extra))
        if not ACTION.match(value): continue
        if len(pending) not in (2, 3):
            raise ValueError('unexpected member structure; manual review required')
        name = pending[0][0]; business = pending[1][0] if len(pending) == 3 else ''
        action, links = pending[-1]
        urls = [link['href'] for link in links if link['href']]
        emails = list(dict.fromkeys(EMAIL.findall(' '.join([action] + urls))))
        phones = list(dict.fromkeys(PHONE.findall(' '.join([action] + [u[4:] for u in urls if u.lower().startswith('tel:')]))))
        web = [u for u in urls if not u.lower().startswith(('mailto:', 'tel:'))]
        anomalies = []
        if re.search(r'website|instagram|facebook', action, re.I) and not web:
            anomalies.append('link_label_without_website_url')
        if re.search(r'website|instagram|facebook', action, re.I) and emails:
            anomalies.append('website_label_contains_email')
        for u in web:
            try:
                parsed = urlparse(u)
                valid = parsed.scheme in ('http', 'https') and parsed.hostname and '.' in parsed.hostname and not parsed.username and not parsed.password
                if not valid: anomalies.append('malformed_website_url')
            except ValueError:
                anomalies.append('malformed_website_url')
                continue
            host = (parsed.hostname or '').lower()
            if 'instagram' in action.lower() and not (host == 'instagram.com' or host.endswith('.instagram.com')):
                anomalies.append('instagram_label_url_mismatch')
            if 'facebook' in action.lower() and not (host == 'facebook.com' or host.endswith('.facebook.com')):
                anomalies.append('facebook_label_url_mismatch')
        rows.append({'source_row': len(rows)+1, 'name': name, 'business': business,
                     'links': links, 'website_urls': list(dict.fromkeys(web)), 'emails': emails, 'phones': phones,
                     'source_url': SOURCE, 'captured_at': captured_at,
                     'licensing_independently_verified': False, 'anomalies': sorted(set(anomalies))})
        pending = []
    if found != 1 or pending or not rows: raise ValueError('active section absent, ambiguous, empty, or incomplete')
    # Reused non-social links across differently named businesses are review signals, not merges.
    businesses = {}
    for row in rows:
        for u in row['website_urls']:
            d = domain(u)
            if d: businesses.setdefault(d, set()).add(textkey(row['business']))
    source_keys = {}
    for row in rows:
        key = (textkey(row['name']), textkey(row['business']))
        source_keys[key] = source_keys.get(key, 0) + 1
    email_users = {}
    for row in rows:
        for email in row['emails']:
            email_users.setdefault(email.casefold(), set()).add(textkey(row['name']))
    for row in rows:
        if source_keys[(textkey(row['name']), textkey(row['business']))] > 1:
            row['anomalies'].append('duplicate_source_name_and_business')
        if any(len(email_users[email.casefold()]) > 1 for email in row['emails']):
            row['anomalies'].append('email_shared_by_different_people')
        if row['business'] and any(len(businesses.get(domain(u), set()) - {''}) > 1 for u in row['website_urls'] if domain(u)):
            row['anomalies'].append('website_domain_shared_by_different_businesses')
    return rows


def curated_links(text):
    """Read the current one-record-per-line curated source associations for review."""
    links = []
    records = re.findall(r'^\{id:.*$', text, re.M)
    if not records: raise ValueError('unrecognized curated Washington reconciliation format')
    for record in records:
        registration = re.search(r'oregonRegistration:"([^"]+)"', record)
        name = re.search(r'name:"([^"]+)"', record)
        if registration and name:
            businesses = re.findall(r'source:"WSGA[^"]*",business:"([^"]+)"', record)
            for business in businesses:
                links.append({'registration': registration.group(1), 'name': name.group(1), 'business': business})
    if not links: raise ValueError('no curated cross-state associations parsed')
    return links


def reconcile(rows, washington, oregon, curated=()):
    # Keep source records separate, including multiple people at a business.
    existing = []
    for i, x in enumerate(washington):
        existing.append({'id': 'washington-raw-index:' + str(i), 'state': 'WA', **x, 'website': ''})
    for x in oregon:
        existing.append({'id': x['registration'], 'state': 'OR', **x})
    result = []
    for row in rows:
        n, b = textkey(row['name']), textkey(row['business'])
        ds = {domain(u) for u in row['website_urls']} - {''}
        matches = []
        for e in existing:
            en, eb, ed = textkey(e.get('name')), textkey(e.get('business')), domain(e.get('website') or '')
            if not n or not en: continue
            same_name = n == en
            similar_name = SequenceMatcher(None, n, en).ratio() >= .86
            same_business = bool(b and eb and b == eb)
            same_domain = bool(ed and ed in ds)
            if same_name or (similar_name and (same_business or same_domain)):
                support = (['name'] if same_name else ['similar_name']) + (['business'] if same_business else []) + (['domain'] if same_domain else [])
                exact = same_name and (same_business or same_domain)
                matches.append({'id': e['id'], 'state': e['state'], 'name': e['name'], 'business': e.get('business'), 'signals': support, 'strength': 'supported' if exact else 'review', 'source': e.get('source', '')})
        for link in curated:
            if b and b == textkey(link['business']) and SequenceMatcher(None, n, textkey(link['name'])).ratio() >= .70 and not any(m['id'] == link['registration'] for m in matches):
                matches.append({'id': link['registration'], 'state': 'OR', 'name': link['name'], 'business': link['business'], 'signals': ['curated_cross_state_association', 'business', 'similar_name'], 'strength': 'review', 'source': 'washington-reconciled.ts'})
        supported = [m for m in matches if m['strength'] == 'supported']
        same_source = len(supported) == 1 and supported[0]['state'] == 'WA' and 'wsga' in supported[0]['source'].casefold()
        classification = 'exact_source_duplicate' if same_source and not row['anomalies'] else ('likely_duplicate_review' if matches else ('anomaly_review' if row['anomalies'] else 'net_new_candidate'))
        # More than one possible identity is never an automatic duplicate.
        if len(matches) > 1: classification = 'likely_duplicate_review'
        missing = [x for x, absent in [('business', not row['business']), ('website', not row['website_urls']), ('email', not row['emails']), ('phone', not row['phones'])] if absent]
        result.append({**row, 'classification': classification, 'matches': matches, 'missing_fields': missing})
    return result


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--capture-dir', required=True, help='Directory created by wsga_capture.py')
    a.add_argument('--out', required=True, help='New private output directory')
    args = a.parse_args()
    capture_dir = Path(args.capture_dir)
    manifest = json.loads((capture_dir/'capture.json').read_text())
    raw = (capture_dir/'members.html').read_bytes()
    robots_data = (capture_dir/'robots.txt').read_bytes()
    if manifest.get('source_url') != SOURCE or manifest.get('sha256') != hashlib.sha256(raw).hexdigest() or manifest.get('robots_sha256') != hashlib.sha256(robots_data).hexdigest() or manifest.get('user_agent') != 'RateMyGuidePNW-Research' or manifest.get('terms_reviewed') is not True:
        raise ValueError('capture manifest does not match source and snapshot')
    robots_text = robots_data.decode('utf-8-sig')
    if not re.search(r'^\s*user-agent\s*:', robots_text, re.I | re.M): raise ValueError('invalid robots snapshot')
    robots = RobotFileParser(); robots.parse(robots_text.splitlines())
    if not robots.can_fetch(manifest['user_agent'], SOURCE): raise ValueError('robots snapshot disallows source')
    rows = parse(raw.decode('utf-8-sig'), manifest['captured_at'])
    paths = ('lib/washington-raw.json', 'lib/oregon-guides.json', 'lib/washington-reconciled.ts')
    baseline = {path: Path(path).read_bytes() for path in paths}
    washington = json.loads(baseline[paths[0]])
    oregon = json.loads(baseline[paths[1]])
    curated = curated_links(baseline[paths[2]].decode('utf-8'))
    results = reconcile(rows, washington, oregon, curated)
    output = Path(args.out); output.mkdir(parents=True, exist_ok=False, mode=0o700)
    summary = {k: sum(r['classification'] == k for r in results) for k in ('exact_source_duplicate', 'likely_duplicate_review', 'anomaly_review', 'net_new_candidate')}
    summary['matched_existing'] = sum(bool(r['matches']) for r in results)
    summary['manual_review'] = summary['likely_duplicate_review'] + summary['anomaly_review']
    report = {'source': SOURCE, 'capture_time': manifest['captured_at'], 'source_sha256': hashlib.sha256(raw).hexdigest(), 'source_row_count': len(rows), 'baseline_sha256': {path: hashlib.sha256(data).hexdigest() for path, data in baseline.items()}, 'counts': summary, 'records': results}
    (output/'wsga-review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    with (output/'wsga-review.csv').open('w', newline='', encoding='utf-8') as f:
        columns = ['source_row','name','business','website_urls','emails','phones','source_url','captured_at','classification','matches','missing_fields','anomalies']
        w = csv.DictWriter(f, fieldnames=columns, extrasaction='ignore'); w.writeheader()
        for row in results:
            # Spreadsheet formula cells are prefixed; JSON keeps exact source spellings.
            safe = {}
            for col in columns:
                value = row[col]
                value = json.dumps(value, ensure_ascii=False) if isinstance(value, list) else str(value)
                safe[col] = "'"+value if value.lstrip().startswith(('=', '+', '-', '@')) or value.startswith(('\t','\r')) else value
            w.writerow(safe)
    print(json.dumps({'source_row_count':len(rows), 'counts':summary, 'output':str(output)}))


if __name__ == '__main__': main()
