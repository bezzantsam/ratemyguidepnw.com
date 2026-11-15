import hashlib
import json
import pathlib
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]

class CatalogSnapshotTests(unittest.TestCase):
    def test_fingerprint_and_security_surface(self):
        data = (ROOT/'docs/backend-catalog-snapshot.json').read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(), '7bab10cbbd0b9246fbd9a19591b8fa21f5afc0de2d9f0e0ad47cfd018ddc9ec4')
        schema = json.loads(data)
        relations = {r['name']:r for r in schema['relations']}
        for table in ('guides','reviews','guide_claims','claim_evidence','guide_details','site_admins'):
            self.assertTrue(relations[table]['rls'])
        for view in ('public_angler_reviews','admin_pending_reviews','admin_pending_claims'):
            self.assertIn('security_invoker=true',relations[view]['options'])
        self.assertEqual({f['name'] for f in schema['functions']}, {'admin_decide_review','admin_decide_claim','is_site_admin','throttle_review_submission','refresh_guide_rating','reviews_rating_trigger'})
    def test_generated_identity_query_is_aggregate_only(self):
        query = subprocess.check_output(['python3',str(ROOT/'scripts/backend-audit/identity-aggregate.py')],text=True)
        self.assertIn('count(*) FILTER (WHERE n=0) AS missing',query)
        self.assertIn('count(*) FILTER (WHERE n>1) AS ambiguous',query)
        self.assertIn('AS conflicting',query)
        self.assertIn('AS jurisdiction_unverified',query)
        self.assertNotIn('full_name',query)
        self.assertNotIn('claimant_id',query)

if __name__ == '__main__':
    unittest.main()
