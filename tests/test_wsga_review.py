import io
import csv
import hashlib
import json
import subprocess
import tempfile
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import wsga_capture as capture
import wsga_review as review

HTML = (Path(__file__).parent / 'fixtures/wsga/synthetic.html').read_text()
STAMP = '2026-11-17T12:00:00+00:00'


class ReviewTests(unittest.TestCase):
    def test_active_section_contacts_and_memorial(self):
        rows = review.parse(HTML, STAMP)
        self.assertEqual(len(rows), 6)
        self.assertEqual([r['name'] for r in rows[:2]], ['Alice Example','Bob Example'])
        self.assertNotIn('Memorial Person', [r['name'] for r in rows])
        self.assertEqual(rows[2]['emails'], ['casey@example.com'])
        self.assertEqual(rows[2]['business'], '')
        self.assertFalse(rows[2]['licensing_independently_verified'])
        self.assertIn('link_label_without_website_url', rows[3]['anomalies'])
        self.assertIn('website_label_contains_email', rows[4]['anomalies'])
        self.assertIn('email_shared_by_different_people', rows[4]['anomalies'])
        self.assertIn('instagram_label_url_mismatch', rows[5]['anomalies'])
        self.assertIn('website_domain_shared_by_different_businesses', rows[0]['anomalies'])

    def test_fail_closed_on_bad_section_and_time(self):
        for html, stamp in [(HTML.replace('Active Professional Guides and Charter Operators','Other'), STAMP), (HTML.replace('Email them (casey@example.com)',''), STAMP), (HTML, '2026-11-17')]:
            with self.subTest(html=html[:30], stamp=stamp), self.assertRaises(ValueError): review.parse(html, stamp)

    def test_name_never_sufficient_and_shared_business_keeps_people_distinct(self):
        rows = review.parse(HTML, STAMP)[:3]
        wa = [{'name':'Alice Example','business':'Shared Guides','source':'WSGA','notes':None}, {'name':'Bob Example','business':'Shared Guides','source':'WSGA','notes':None}, {'name':'Casey Example','business':'Different','source':'WSGA','notes':None}]
        # Remove unrelated anomaly introduced by the deliberately bad sixth row.
        for row in rows: row['anomalies'] = []
        result = review.reconcile(rows, wa, [])
        self.assertEqual([r['classification'] for r in result], ['exact_source_duplicate','exact_source_duplicate','likely_duplicate_review'])
        self.assertEqual([len(r['matches']) for r in result], [1,1,1])

    def test_oregon_match_review_and_shared_social_domain_not_evidence(self):
        row = review.parse(HTML, STAMP)[0]; row['anomalies'] = []
        orrows = [{'registration':'OG.123', 'name':'Alice Example','business':'Shared Guides','website':'https://shared.example'}]
        r = review.reconcile([row], [], orrows)[0]
        self.assertEqual(r['classification'], 'likely_duplicate_review')
        self.assertEqual(r['matches'][0]['id'], 'OG.123')
        self.assertEqual(review.domain('https://www.facebook.com/shared'), '')

    def test_malformed_link_preserved_and_flagged(self):
        rows = review.parse(HTML.replace('https://shared.example/', 'javascript:bad', 1), STAMP)
        self.assertEqual(rows[0]['website_urls'], ['javascript:bad'])
        self.assertIn('malformed_website_url', rows[0]['anomalies'])

    def test_duplicate_rows_and_phone_do_not_merge(self):
        block = '<p>Sam Example<br>Acme<br>Phone (206) 555-0123</p>'
        html = '<h2>Active Professional Guides and Charter Operators</h2>' + block + block + '<h2>Other</h2>'
        rows = review.parse(html, STAMP)
        self.assertEqual(rows[0]['phones'], ['(206) 555-0123'])
        self.assertIn('duplicate_source_name_and_business', rows[0]['anomalies'])
        self.assertTrue(all(x['classification'] == 'anomaly_review' for x in review.reconcile(rows, [], [])))

    def test_curated_alias_is_review_not_auto_merge(self):
        root = Path(__file__).resolve().parents[1]
        curated = review.curated_links((root/'lib/washington-reconciled.ts').read_text())
        row = {'name':'Daniel Benowitz','business':'PHD Guide Service','website_urls':[], 'anomalies':[], 'emails':[], 'phones':[]}
        result = review.reconcile([row], [], [], curated)[0]
        self.assertEqual(result['classification'], 'likely_duplicate_review')
        self.assertEqual(result['matches'][0]['id'], 'OG.0003982')
        self.assertEqual(result['matches'][0]['strength'], 'review')

    def test_synthetic_cli_generates_json_csv_and_checks_manifest(self):
        root = Path(__file__).resolve().parents[1]
        raw = HTML.encode(); robots = b'User-agent: *\nAllow: /\n'
        with tempfile.TemporaryDirectory() as d:
            cap = Path(d)/'capture'; cap.mkdir()
            (cap/'members.html').write_bytes(raw); (cap/'robots.txt').write_bytes(robots)
            manifest = {'source_url':review.SOURCE, 'captured_at':STAMP, 'sha256':hashlib.sha256(raw).hexdigest(), 'robots_sha256':hashlib.sha256(robots).hexdigest(), 'user_agent':'RateMyGuidePNW-Research'}
            (cap/'capture.json').write_text(json.dumps(manifest))
            out = Path(d)/'result'
            run = subprocess.run([sys.executable, 'scripts/wsga_review.py', '--capture-dir', str(cap), '--out', str(out)], cwd=root, text=True, capture_output=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            report = json.loads((out/'wsga-review.json').read_text())
            self.assertEqual(report['source_row_count'], 6)
            with (out/'wsga-review.csv').open(newline='') as f: self.assertEqual(len(list(csv.DictReader(f))), 6)
            (cap/'members.html').write_bytes(raw+b'tampered')
            run = subprocess.run([sys.executable, 'scripts/wsga_review.py', '--capture-dir', str(cap), '--out', str(Path(d)/'bad')], cwd=root, text=True, capture_output=True)
            self.assertNotEqual(run.returncode, 0)
            self.assertFalse((Path(d)/'bad').exists())


class Response(io.BytesIO):
    status = 200


class Opener:
    def __init__(self, robots): self.urls = []; self.robots = robots
    def open(self, req, timeout):
        self.urls.append(req.full_url)
        if len(self.urls) == 1:
            if isinstance(self.robots, Exception): raise self.robots
            return Response(self.robots)
        return Response(b'<html/>')


class CaptureTests(unittest.TestCase):
    def test_disallow_and_robots_failure_do_not_fetch_page(self):
        import tempfile
        for robots in (b'User-agent: *\nDisallow: /our-members/', b'<html>error</html>', OSError('unavailable')):
            op = Opener(robots)
            with tempfile.TemporaryDirectory() as d:
                with self.assertRaises((ValueError, OSError)): capture.capture(Path(d)/'new', op, lambda _: None)
                self.assertEqual(op.urls, [capture.ROBOTS])

    def test_one_page_request_after_delay(self):
        import tempfile
        op = Opener(b'User-agent: *\nAllow: /\nCrawl-delay: 3')
        delays = []
        with tempfile.TemporaryDirectory() as d:
            capture.capture(Path(d)/'new', op, delays.append)
            self.assertEqual(op.urls, [capture.ROBOTS, capture.PAGE])
            self.assertEqual(delays, [3])
            self.assertTrue((Path(d)/'new'/'capture.json').exists())


if __name__ == '__main__': unittest.main()
