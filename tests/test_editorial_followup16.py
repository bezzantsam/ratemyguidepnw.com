import copy
from collections import Counter
import sys
import unittest
from unittest.mock import patch
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import editorial_review as e
import editorial_visual_data as visual
import editorial_first_batch as batch

class FollowupIntegrationTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.model=e.load_model();cls.raw=e.read(e.FOLLOWUP16)
 def test_complete_additive_sources_and_held_candidates(self):
  m=self.model;self.assertEqual(len(m['guides']),111);self.assertEqual(len(m['followup']),10);self.assertEqual(len(m['followup16']),16)
  held={x['guide_id'] for x in m['items'] if x['category']=='hold'};self.assertEqual(len(held),59)
  new=[x for x in m['items'] if x.get('origin')=='followup16'];self.assertEqual(Counter(x['category'] for x in new),{'attribute':21,'waterway':6,'relationship':4})
  for x in new:
   self.assertIn(x['guide_id'],held);self.assertIs(x['record']['blocked_by_baseline_hold'],True);self.assertIs(x['record']['publication_approved'],False)
   self.assertEqual(x['record']['editorial_status'],'pending');self.assertEqual(x['record']['evidence_scope'],'operator_advertises')
   src=m['sources'][x['source_id']];self.assertEqual((src['source_type'],src['retrieval_method']),('operator_site','parsed_page'))
  self.assertEqual(len({x['item_id'] for x in new}),len(new))
  self.assertEqual(len({(x['guide_id'],x['category'],x['record']['kind'],x['record']['value'],e.canonical(x['record'].get('relationship')),x['source_id']) for x in new}),len(new))
 def test_exact_relationships_and_broad_tuna(self):
  new=[x for x in self.model['items'] if x.get('origin')=='followup16']
  relationships={(x['guide_id'],x['record']['relationship']['waterway'],x['record']['relationship']['species']) for x in new if x['category']=='relationship'}
  self.assertEqual(relationships,{('OG.0003191','Rogue River','Steelhead'),('OG.0003540','Columbia River','Chinook Salmon'),('OG.0003540','Columbia River','Coho Salmon'),('OG.0003540','Columbia River','Dungeness Crab')})
  self.assertEqual([x['record']['value'] for x in new if x['guide_id']=='OG.0003468'],['Tuna'])
 def test_original_holds_and_registry_strings_remain(self):
  bundle=e.read(e.BUNDLE);m=self.model;new_holds={x['guide_id']:x for x in m['items'] if x['category']=='hold'}
  for old in bundle['holds']:self.assertEqual(new_holds[old['guide_id']]['record'],old)
  registry={x['registration']:x for x in e.read(e.REGISTRY)}
  for row in self.raw['records']:
   guide=next(g for g in m['guides'] if g['guide_id']==row['registration_id']);identity=guide['manifest_identity']
   self.assertEqual((identity['imported_name'],identity['imported_business'],identity['registry_website']),(row['imported_name'],row['imported_business'],row['registry_website']))
   source=registry[row['registration_id']];self.assertEqual(guide['registry_identity'],{'name':source['name'],'business':source['business'],'website':source['website']})
   if row['registration_id']=='OG.0003288':self.assertEqual(guide['registry_identity']['business'],'Tenacity Outdoors ')
  parsed=m['followup16']['OG.0003842']['sources'];same=[x for x in parsed.values() if x['url']=='https://www.windingwatersrafting.com/fish-five-plus']
  self.assertEqual({x['method'] for x in same},{'parsed_page','indexed_page_text'})
 def test_unapproved_recovered_items_excluded_from_default_preview(self):
  data=visual.visual(self.model);self.assertFalse({'OG.0003191','OG.0003468','OG.0003540'} & ({x['guide_id'] for x in data['attributes']}|set(data['waters'])))
 def test_old_model_decisions_are_rejected_without_mutation(self):
  doc={k:self.model[k] for k in ('schema_version','baseline_sha256','candidate_sha256','followup_sha256','model_sha256')};doc.update(editor='',decisions=[]);doc['model_sha256']='old-model';before=copy.deepcopy(doc)
  with self.assertRaisesRegex(ValueError,'Stale or mismatched model_sha256'):e.valid_decision_file(doc,self.model)
  self.assertEqual(doc,before)
 def test_followup_bytes_are_pinned_and_indexed_text_cannot_resolve(self):
  real_hash=e.filehash
  with patch.object(e,'filehash',side_effect=lambda path:'changed' if path==e.FOLLOWUP16 else real_hash(path)):
   with self.assertRaisesRegex(ValueError,'Follow-up 16 evidence changed'):e.load_model()
  src={'url':'https://fixture.invalid/indexed','locator':'Synthetic index','reviewed_on':'2026-11-15','source_type':'operator_site','retrieval_method':'indexed_page_text'}
  item={'item_id':'synthetic-hold','guide_id':'synthetic-guide','category':'hold','evidence_options':['synthetic-source']}
  model={'schema_version':1,'baseline_sha256':'b','candidate_sha256':'c','followup_sha256':'f','model_sha256':'m','items':[item],'sources':{'synthetic-source':src}}
  doc={k:model[k] for k in ('schema_version','baseline_sha256','candidate_sha256','followup_sha256','model_sha256')};doc.update(editor='Synthetic test',decisions=[{'item_id':'synthetic-hold','guide_id':'synthetic-guide','action':'resolve','reason':'Synthetic test','evidence_id':'synthetic-source'}])
  with self.assertRaisesRegex(ValueError,'readable, nonhistorical evidence'):e.valid_decision_file(doc,model)
 def test_first_batch_pack_is_deterministic_and_closed(self):
  attrs=e.read(e.ATTRS);waters=e.read(e.WATERS);hard=e.read(e.HOLDS);pack=batch.generate(self.model,attrs,waters,hard)
  self.assertEqual(pack,batch.generate(self.model,attrs,waters,hard));self.assertEqual(pack,batch.OUTPUT.read_text());self.assertLessEqual(len(batch.IDS),15)
  self.assertIn('Recommendations are not approvals',pack);self.assertIn('Each fact needs a separate decision',pack)
  altered=copy.deepcopy(self.model);altered['items'].append({'guide_id':batch.IDS[0],'category':'hold'})
  with self.assertRaisesRegex(ValueError,'unresolved dependency'):batch.generate(altered,attrs,waters,hard)
if __name__=='__main__':unittest.main()
