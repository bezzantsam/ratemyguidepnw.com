import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('next10_candidates',ROOT/'scripts/batch13_next10_candidates.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class NextTenCandidateTests(unittest.TestCase):
 def setUp(self):
  self.review=json.loads(m.REVIEW.read_text());self.selection=m.SELECTION.read_bytes();self.registry=json.loads(m.REGISTRY.read_text())
 def build(self):return m.build(self.review,self.selection,self.registry)
 def test_deterministic_counts_provenance_and_unchanged_inputs(self):
  before=copy.deepcopy((self.review,self.selection,self.registry));result=self.build()
  self.assertEqual(result,self.build());self.assertEqual(before,(self.review,self.selection,self.registry))
  self.assertEqual(result['counts'],{'supported_records':4,'held_records':6,'attributes':44,'standalone_attributes':36,'relationship_attributes':8,'pending_waters':13,'distinct_standalone_attributes':33,'distinct_guide_waters':11})
  self.assertEqual(len(result['holds']),6)
  for item in result['attributes']+result['pending_waters']+result['holds']:
   self.assertEqual(item['editorial_status'],'pending');self.assertIs(item['publication_approved'],False)
   self.assertFalse(item['identity_evidence']['legal_identity_verified']);self.assertTrue(item['limitations'])
  for item in result['attributes']+result['pending_waters']:
   self.assertTrue(item['source']['url'].startswith('https://'));self.assertTrue(item['source']['locator']);self.assertEqual(item['source']['reviewed_on'],'2026-11-15')
   self.assertEqual(item['evidence_scope'],'operator_advertises');self.assertTrue(item['identity_evidence']['sources'])
  self.assertTrue(all('kind' not in item for item in result['pending_waters']))
  self.assertEqual({item['kind'] for item in result['attributes']},{'species','method','trip_type'})
  waters=json.loads(m.WATERS.read_text());self.assertIs(waters['publication_approved'],False);self.assertEqual(waters['waters'],result['pending_waters'])
  self.assertNotIn('pending_waters',json.loads(m.OUTPUT.read_text()))
  subprocess.run([sys.executable,str(ROOT/'scripts/batch13_next10_candidates.py'),'--check'],cwd=ROOT,check=True,capture_output=True)
 def test_identity_mismatch_unknown_id_and_held_facts_fail_closed(self):
  self.review['records'][4]['imported_name']='Another person'
  with self.assertRaisesRegex(ValueError,'Imported identity changed'):self.build()
  self.setUp();self.registry=[r for r in self.registry if r['registration']!='OG.0001277']
  with self.assertRaisesRegex(ValueError,'Unknown directory identity'):self.build()
  self.setUp();self.review['records'][0]['facts']=copy.deepcopy(self.review['records'][4]['facts'])
  with self.assertRaisesRegex(ValueError,'Held record'):self.build()
 def test_holds_preserve_reasons_without_promoting_observations(self):
  result=self.build();held={x['guide_id'] for x in result['holds']}
  self.assertEqual(len(held),6)
  self.assertTrue(all(x['reason'] and x['limitations'] for x in result['holds']))
  self.assertFalse(any(x['guide_id'] in held for x in result['attributes']+result['pending_waters']))
  crisler=next(x for x in result['holds'] if x['guide_id']=='OG.0001298')
  self.assertEqual(crisler['registry_website'],'southeroregonsportfishing.com')
 def test_only_explicit_relationships_survive_and_seasons_remain_separate(self):
  result=self.build()
  expected=[(r['registration_id'],f['source_id'],rel) for r in self.review['records'] for f in r['facts'] for rel in f['explicit_relationships']]
  actual=[(x['guide_id'],x['source']['source_id'],x['relationship']) for x in result['attributes'] if 'relationship' in x]
  self.assertEqual(expected,actual)
  winter=next(x for x in result['attributes'] if x['guide_id']=='OG.0001429' and x['source']['source_id']=='umpqua-winter' and 'relationship' in x)
  self.assertEqual(winter['relationship'],{'waterway':'North Umpqua River','species':'Steelhead'})
  self.assertFalse(any(x.get('kind')=='method' and x['source']['source_id']=='umpqua-winter' for x in result['attributes']))
  self.review['records'][8]['facts'][0]['explicit_relationships'][0]['method']='Fly fishing'
  with self.assertRaisesRegex(ValueError,'crosses source fact boundaries'):self.build()
 def test_missing_attribution_and_publication_flags_are_rejected(self):
  self.review['sources']['helfrich-mckenzie']['locator']=''
  with self.assertRaisesRegex(ValueError,'locator'):self.build()
  self.setUp();self.review['records'][4]['publication_approved']=True
  with self.assertRaisesRegex(ValueError,'approval'):self.build()
  self.setUp();self.review['policy']['publication_approved']=True
  with self.assertRaisesRegex(ValueError,'false'):self.build()

if __name__=='__main__':unittest.main()
