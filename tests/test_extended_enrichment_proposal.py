import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('extended',ROOT/'scripts/extended_enrichment_proposal.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ExtendedProposalTests(unittest.TestCase):
 def setUp(self): self.base=json.loads(m.BASE.read_text())
 def test_counts_provenance_and_independent_lists(self):
  before=copy.deepcopy(self.base);p=m.build(self.base)
  self.assertEqual(p['counts'],{'newly_representable':81,'existing_proposed_names':7,'unrepresentable':11,'withheld_records':3})
  self.assertEqual(self.base,before)
  for a in p['attributes']:
   self.assertEqual(a['editorial_status'],'pending');self.assertIs(a['publication_approved'],False)
   self.assertTrue(a['guide_id']);self.assertTrue(a['source']['url']);self.assertTrue(a['source']['reviewed_on']);self.assertTrue(a['evidence_scope']);self.assertTrue(a['limitations'])
   self.assertNotIn('relationship',a)
  self.assertEqual({r['guide_id'] for r in p['holds']},set(m.HOLD_IDS))
  self.assertTrue(any(x['guide_id']=='OG.0001116' and x['value']=='Grindstone Lakes' and not x['publication_approved'] for x in p['exclusions']))
  subprocess.run([sys.executable,str(ROOT/'scripts/extended_enrichment_proposal.py'),'--check'],check=True,capture_output=True)
 def test_explicit_relationship_requires_same_source(self):
  record=next(r for r in self.base['records'] if r['unsupported_fields'])
  claim=record['unsupported_fields'][0]
  claim['relationship']={'source_id':claim['source']['source_id'],'species':'Salmon','waterway':'Example River'}
  result=m.build(self.base)
  self.assertTrue(any(a.get('relationship',{}).get('waterway')=='Example River' for a in result['attributes']+result['unrepresentable']))
  claim['relationship']['source_id']='unrelated'
  with self.assertRaises(ValueError):m.build(self.base)
 def test_missing_source_and_approval_are_rejected(self):
  record=next(r for r in self.base['records'] if r['unsupported_fields'])
  record['unsupported_fields'][0]['source']['locator']=''
  with self.assertRaises(ValueError):m.build(self.base)
  self.base['publication_approved']=True
  with self.assertRaises(ValueError):m.build(self.base)
 def test_holds_and_discontinued_water_cannot_be_promoted(self):
  held=next(r for r in self.base['records'] if r['registration_id']=='OG.0001881')
  held['withheld_reason']=None;held['review_status']='source_supported_pending_editorial'
  self.assertIn('OG.0001881',{x['guide_id'] for x in m.build(self.base)['holds']})
  burrell=next(r for r in self.base['records'] if r['registration_id']=='OG.0001116');burrell['exclusions']=[]
  with self.assertRaises(ValueError):m.build(self.base)
if __name__=='__main__':unittest.main()
