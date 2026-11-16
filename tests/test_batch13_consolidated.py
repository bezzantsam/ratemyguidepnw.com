import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import batch13_consolidated as mod

class ConsolidatedTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.bundle=mod.assemble()
  cls.manifest=mod.read(mod.RESEARCH/'BATCH13_DEDUPED_RESEARCH_MANIFEST_20261115.json')
  cls.batches={n:mod.read(mod.RESEARCH/p) for n,p,_ in mod.BATCHES}
  cls.registry=mod.read(ROOT/'lib/oregon-guides.json')
  cls.holds=mod.read(ROOT/'lib/guide-evidence-holds.json')
 def build(self,manifest=None,batches=None,registry=None,holds=None):
  return mod.build(manifest or self.manifest,batches or self.batches,registry or self.registry,holds or self.holds,{})
 def test_regeneration_exact(self):
  before=mod.OUTPUT.read_bytes()
  subprocess.run([sys.executable,str(ROOT/'scripts/batch13_consolidated.py'),'--check'],check=True,stdout=subprocess.DEVNULL)
  rendered=(json.dumps(mod.assemble(),indent=2,ensure_ascii=False)+'\n').encode()
  self.assertEqual(before,rendered)
  self.assertEqual(hashlib.sha256(before).hexdigest(),hashlib.sha256(rendered).hexdigest())
  self.assertEqual(mod.CSV_OUTPUT.read_text(),mod.csv_artifact(self.bundle))
 def test_csv_neutralizes_formula_cells(self):
  b=copy.deepcopy(self.bundle);b['attributes'][0]['value']=' =SUM(1,2)'
  self.assertIn("' =SUM(1,2)",mod.csv_artifact(b))
 def test_complete_partition_and_ledger(self):
  c=self.bundle['counts'];self.assertEqual(c['batches'],{'original20':20,'supplemental30':30,'first10':10,'second10':10,'final41':41})
  self.assertEqual(len(self.bundle['index']),111);self.assertEqual(len({r['guide_id'] for r in self.bundle['index']}),111)
  self.assertEqual(c['held_records']+c['pending_candidate_records'],111)
  self.assertEqual(len(self.bundle['field_ledger']),sum(c['input_value_decisions'].values()))
 def test_duplicate_manifest_and_review_id_rejected(self):
  m=copy.deepcopy(self.manifest);m['records'][1]=copy.deepcopy(m['records'][0])
  with self.assertRaisesRegex(ValueError,'Duplicate manifest ID'):self.build(manifest=m)
  b=copy.deepcopy(self.batches);b['original20']['records'][1]=copy.deepcopy(b['original20']['records'][0])
  with self.assertRaises(ValueError):self.build(batches=b)
 def test_lost_registry_and_research_holds_rejected(self):
  h=copy.deepcopy(self.holds);h['held_guides'].pop()
  with self.assertRaisesRegex(ValueError,'holds changed'):self.build(holds=h)
  b=copy.deepcopy(self.batches);next(r for r in b['final41']['records'] if r['review_status']=='name_variant_hold')['review_status']='source_supported_pending_editorial'
  with self.assertRaisesRegex(ValueError,'statuses or holds changed'):self.build(batches=b)
 def test_excluded_water_conflict_is_withheld(self):
  b=copy.deepcopy(self.batches);r=next(r for r in b['original20']['records'] if r['registration_id']=='OG.0001116');r['facts'][0]['advertised_waters'].append('Grindstone Lakes')
  x=self.build(batches=b)
  self.assertTrue(any(c['guide_id']=='OG.0001116' and c['type']=='excluded_waterway_claim' for c in x['conflicts']))
  self.assertFalse(any(a['guide_id']=='OG.0001116' for a in x['waters']+x['attributes']))
 def test_unsupported_field_is_explicit_and_unknown_field_fails(self):
  unsupported=self.bundle['unsupported_fields'];self.assertTrue(any(x['field']=='advertised_accessibility' for x in unsupported))
  self.assertTrue(any(x['decision']=='unsupported_scope' and x['evidence_scope']=='tourism_lists' for x in unsupported))
  b=copy.deepcopy(self.batches);b['original20']['records'][1]['facts'][0]['unknown_field']=['value']
  with self.assertRaisesRegex(ValueError,'Unknown field needs decision'):self.build(batches=b)
 def test_only_tenacity_exception_and_exact_other_conflict(self):
  idx={x['guide_id']:x for x in self.bundle['index']}
  self.assertEqual(idx['OG.0003288']['identity_differences'][0]['decision'],'specific_comparison_exception_identity_still_held')
  self.assertEqual(idx['OG.0003993']['disposition'],'held');self.assertEqual(idx['OG.0003993']['identity_differences'][0]['decision'],'hold_for_exact_identity_review')
  self.assertEqual(idx['OG.0003993']['registry_identity']['business'],"Ferg's Guided Fishing ")
 def test_no_cross_product_relationships(self):
  for x in self.bundle['attributes']:
   if 'relationship' in x:self.assertEqual(x['kind'],'species');self.assertEqual(x['value'],x['relationship']['species'])
if __name__=='__main__':unittest.main()
