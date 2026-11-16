import copy
import json
import sys
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'));sys.path.insert(0,str(ROOT/'tests'))
import editorial_release as release
import test_editorial_review as review_tests

class ReleaseTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  review_tests.EditorialReviewTests.setUpClass();cls.fixture=review_tests.EditorialReviewTests();f=cls.fixture
  cls.decisions=[f.d(i) for i in range(4)]+[f.d(4,'resolve'),f.d(5,'resolve')]
  cls.doc=f.doc(cls.decisions);cls.data=(json.dumps(cls.doc,indent=2)+'\n').encode();cls.before={'lib/approved-guide-attributes.json':json.dumps(f.existing,indent=2)+'\n','lib/guide-enrichment.json':json.dumps(f.old_water,indent=2)+'\n'}
  cls.commit='a'*40
 def build(self):
  f=self.fixture;return release.build_package(self.doc,f.model,f.existing,f.old_water,f.hard,f.known,self.commit,self.before,self.data)
 def test_deterministic_exact_reverse(self):
  a=self.build();self.assertEqual(a,self.build());self.assertEqual(a['counts']['affected_guides'],1);self.assertEqual(a['counts']['source_specific_additions'],4)
  self.assertEqual(a['reverse_patch']['files'],self.before);self.assertEqual(a['reverse_patch']['requires_after_hash'],a['after_hash'])
  self.assertIn('Synthetic salmon',a['readable_diff']);self.assertTrue(release.validate_package(a,self.fixture.model,self.commit,self.data,self.before,a['after_files']))
  changed=copy.deepcopy(a['after_files']);changed['lib/guide-enrichment.json']+=' '
  with self.assertRaisesRegex(ValueError,'rollback guard'):release.validate_package(a,self.fixture.model,self.commit,self.data,self.before,changed)
 def test_changed_after_reverse_base_or_decisions_rejected(self):
  original=self.build()
  for kind in ('after','reverse','base','decision'):
   x=copy.deepcopy(original);data=self.data
   if kind=='after':x['after_files']['lib/approved-guide-attributes.json']+=' '
   elif kind=='reverse':x['reverse_patch']['files']['lib/approved-guide-attributes.json']+=' '
   elif kind=='base':x['base_commit']='b'*40
   else:data=b'{}'
   with self.subTest(kind=kind),self.assertRaises(ValueError):release.validate_package(x,self.fixture.model,self.commit,data,self.before)
 def test_product_baseline_must_match_exact_bytes(self):
  before=copy.deepcopy(self.before);before['lib/approved-guide-attributes.json']='[]\n';f=self.fixture
  with self.assertRaisesRegex(ValueError,'Baseline bytes mismatch'):release.build_package(self.doc,f.model,f.existing,f.old_water,f.hard,f.known,self.commit,before,self.data)
if __name__=='__main__':unittest.main()
