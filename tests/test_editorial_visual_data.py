import copy
import json
from pathlib import Path
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
import editorial_review as editorial
import editorial_visual_data as visual

class VisualDataTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.model=editorial.load_model()
 def test_unapproved_supported_candidates_never_include_holds(self):
  a=visual.visual(self.model);b=visual.visual(self.model);self.assertEqual(a,b)
  self.assertFalse(a['publication_approved']);self.assertGreater(a['counts']['guides'],0)
  self.assertTrue(all(x['editorial_status']=='pending' and x['publication_approved'] is False for x in a['attributes']))
  held={x['guide_id'] for x in self.model['items'] if x['category'] in ('hold','conflict')}
  self.assertFalse(held & ({x['guide_id'] for x in a['attributes']}|set(a['waters'])))
  self.assertFalse(any(x['guide_id']=='OG.0003060' for x in a['attributes']))
 def test_empty_decisions_do_not_invent_approvals(self):
  doc={k:self.model[k] for k in ('schema_version','baseline_sha256','candidate_sha256','followup_sha256','model_sha256')};doc.update(editor='',decisions=[])
  x=visual.visual(self.model,doc);self.assertEqual(x['counts']['changes'],0);self.assertEqual(x['attributes'],[]);self.assertEqual(x['waters'],{})
 def test_wrong_decision_baseline_fails(self):
  doc={k:self.model[k] for k in ('schema_version','baseline_sha256','candidate_sha256','followup_sha256','model_sha256')};doc.update(editor='',decisions=[]);doc['candidate_sha256']='stale'
  with self.assertRaisesRegex(ValueError,'Stale'):visual.visual(self.model,doc)
if __name__=='__main__':unittest.main()
