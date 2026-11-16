import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import editorial_review as e

class EditorialReviewTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.actual=e.load_model()
  cls.src={'url':'https://fixture.invalid/source','source_type':'operator_site','reviewed_on':'2026-01-01','locator':'Synthetic evidence','retrieval_method':'parsed_page'}
  cls.sid=e.digest(cls.src);cls.guide='OG.9999998';cls.items=[]
  def add(cat,kind,value,relationship=None):
   record={'guide_id':cls.guide,'kind':kind,'value':value,'source':cls.src,'evidence_scope':'operator_advertises','editorial_status':'pending','publication_approved':False}
   if relationship:record['relationship']=relationship
   payload={'category':cat,'guide_id':cls.guide,'record':record,'source_id':cls.sid};cls.items.append({'item_id':e.digest(payload),**payload})
  add('attribute','species','Synthetic salmon');add('attribute','method','Synthetic method');add('waterway','waterway','Synthetic river')
  add('relationship','species','Synthetic salmon',{'species':'Synthetic salmon','method':'Synthetic method','waterway':'Synthetic river'})
  hold={'category':'hold','guide_id':cls.guide,'record':{'guide_id':cls.guide,'reason':'Synthetic hold'},'evidence_options':[cls.sid]};cls.items.append({'item_id':e.digest(hold),**hold})
  conflict={'category':'conflict','guide_id':cls.guide,'record':{'guide_id':cls.guide,'details':['Synthetic conflict']},'evidence_options':[cls.sid]};cls.items.append({'item_id':e.digest(conflict),**conflict})
  unsupported={'category':'unsupported','guide_id':cls.guide,'record':{'guide_id':cls.guide,'value':'Synthetic unsupported'},'source_id':cls.sid};cls.items.append({'item_id':e.digest(unsupported),**unsupported})
  cls.model={'schema_version':1,'baseline_sha256':'baseline','candidate_sha256':'candidate','followup_sha256':'followup','model_sha256':'model','items':cls.items,'sources':{cls.sid:cls.src}}
  cls.hard={'held_guides':[],'excluded_waterways':[]};cls.known={cls.guide}
  cls.existing=[{'guide_id':cls.guide,'kind':'trip_type','value':'Synthetic existing','source':{k:cls.src[k] for k in ('url','source_type','reviewed_on','locator')},'evidence_scope':'operator_advertises','editorial_status':'approved','publication_approved':True}]
  cls.old_water={cls.guide:{'searchAliases':['Synthetic existing alias'],'advertisedWaters':[]}}
 def doc(self,decisions):
  return {**{k:self.model[k] for k in ('schema_version','baseline_sha256','candidate_sha256','followup_sha256','model_sha256')},'editor':'Synthetic reviewer','decisions':decisions}
 def d(self,i,action='approve',evidence=None):
  x=self.items[i];return {'item_id':x['item_id'],'guide_id':x['guide_id'],'action':action,'reason':'Synthetic test reason','evidence_id':self.sid if evidence is None else evidence}
 def patch(self,decisions,**kwargs):return e.generate_patch(self.doc(decisions),self.model,kwargs.get('attrs',self.existing),kwargs.get('waters',self.old_water),kwargs.get('hard',self.hard),kwargs.get('known',self.known))
 def test_page_and_model_regenerate_deterministically(self):
  again=e.load_model();self.assertEqual(self.actual,again);self.assertEqual(e.render(self.actual),e.render(again))
 def test_followup_is_separate_and_holds_remain(self):
  self.assertEqual(len(self.actual['followup']),10)
  lead=[x for x in self.actual['items'] if x.get('origin')=='followup']
  self.assertEqual(sorted(x['record']['value'] for x in lead),['Salmon','Steelhead'])
  self.assertTrue(all(x['record']['blocked_by_baseline_hold'] and x['record']['publication_approved'] is False for x in lead))
  self.assertEqual(sum(x['category']=='hold' for x in self.actual['items']),59)
 def test_synthetic_approval_and_relationship_preserve_baseline(self):
  decisions=[self.d(i) for i in range(4)]+[self.d(4,'resolve'),self.d(5,'resolve')]
  a=self.patch(decisions);b=self.patch(decisions)
  self.assertEqual(a,b);self.assertEqual(a['before']['approved_attributes'],self.existing)
  self.assertEqual(a['after']['approved_attributes'][0],self.existing[0]);self.assertEqual(len(a['changes']),4)
  self.assertEqual(a['after']['guide_enrichment'][self.guide]['searchAliases'],['Synthetic existing alias'])
  self.assertEqual(len(a['decisions']),6);self.assertFalse(a['publication_approved'])
  self.assertEqual(a['before']['guide_evidence_holds'],a['after']['guide_evidence_holds'])
  self.assertEqual(a['evidence'][self.sid],self.src);self.assertEqual(len(a['review_context']),6)
 def test_held_and_conflict_bypasses_rejected(self):
  with self.assertRaisesRegex(ValueError,'hold resolution'):self.patch([self.d(0)])
  with self.assertRaisesRegex(ValueError,'conflict requires'):self.patch([self.d(0),self.d(4,'resolve')])
  with self.assertRaisesRegex(ValueError,'Product-level identity hold'):self.patch([self.d(0),self.d(4,'resolve'),self.d(5,'resolve')],hard={'held_guides':[{'guide_id':self.guide}],'excluded_waterways':[]})
 def test_each_relationship_component_requires_approval(self):
  resolutions=[self.d(4,'resolve'),self.d(5,'resolve')]
  for missing in range(3):
   decisions=[self.d(3)]+[self.d(i) for i in range(3) if i!=missing]+resolutions
   with self.subTest(missing=missing),self.assertRaisesRegex(ValueError,'Relationship requires separately approved'):self.patch(decisions)
  with self.assertRaisesRegex(ValueError,'component is rejected'):
   self.patch([self.d(0,'reject'),self.d(1),self.d(2),self.d(3)]+resolutions)
 def test_stale_unknown_duplicate_and_changed_evidence_fail(self):
  for key in ('baseline_sha256','candidate_sha256','followup_sha256','model_sha256'):
   doc=self.doc([]);doc[key]='stale'
   with self.subTest(key=key),self.assertRaisesRegex(ValueError,'Stale'):e.valid_decision_file(doc,self.model)
  for bad in ({**self.d(0),'item_id':'unknown'},{**self.d(0),'guide_id':'OG.9999999'},{**self.d(0),'evidence_id':'changed'}, {**self.d(0),'reason':''}):
   with self.assertRaises(ValueError):e.valid_decision_file(self.doc([bad]),self.model)
  with self.assertRaisesRegex(ValueError,'Duplicate/conflicting'):e.valid_decision_file(self.doc([self.d(0),self.d(0,'reject')]),self.model)
 def test_unsupported_and_unknown_approvals_fail(self):
  with self.assertRaisesRegex(ValueError,'Unsupported decision'):self.patch([self.d(6)])
  with self.assertRaisesRegex(ValueError,'Unknown product guide'):self.patch([self.d(0),self.d(4,'resolve'),self.d(5,'resolve')],known=set())
 def test_unsupported_scope_and_exclusion_are_closed(self):
  model=copy.deepcopy(self.model);model['items'][0]['record']['evidence_scope']='tourism_lists'
  with self.assertRaisesRegex(ValueError,'Unsupported source'):e.generate_patch(self.doc([self.d(0),self.d(4,'resolve'),self.d(5,'resolve')]),model,self.existing,self.old_water,self.hard,self.known)
  hard={'held_guides':[],'excluded_waterways':[{'guide_id':self.guide,'value':'Synthetic river'}]}
  with self.assertRaisesRegex(ValueError,'Excluded waterway'):self.patch([self.d(2),self.d(4,'resolve'),self.d(5,'resolve')],hard=hard)
 def test_conflicting_same_fact_decisions_rejected(self):
  model=copy.deepcopy(self.model);item=copy.deepcopy(model['items'][0]);item['item_id']='second-source-item';model['items'].append(item)
  decisions=[self.d(0),{**self.d(0,'reject'),'item_id':'second-source-item'},self.d(4,'resolve'),self.d(5,'resolve')]
  with self.assertRaisesRegex(ValueError,'Conflicting decisions'):e.generate_patch(self.doc(decisions),model,self.existing,self.old_water,self.hard,self.known)
 def test_schema_and_editor_must_be_explicit(self):
  doc=self.doc([]);doc['schema_version']=True
  with self.assertRaisesRegex(ValueError,'schema version'):e.valid_decision_file(doc,self.model)
  doc=self.doc([self.d(4,'hold',evidence='')]);doc['editor']=''
  with self.assertRaisesRegex(ValueError,'Editor label'):e.valid_decision_file(doc,self.model)
 def test_duplicate_json_keys_rejected(self):
  with self.assertRaisesRegex(ValueError,'Duplicate JSON key'):e.strict_json('{"x":1,"x":2}')
 def test_safe_output_and_escaped_html(self):
  original=e.ATTRS.read_bytes()
  with self.assertRaisesRegex(ValueError,'Output inside repository'):e.write_safe(e.ATTRS,'bad')
  self.assertEqual(e.ATTRS.read_bytes(),original)
  model=copy.deepcopy(self.model);model['attack']='</script><script>alert(1)</script>'
  html=e.render(model);self.assertNotIn('</script><script>alert(1)</script>',html);self.assertIn('\\u003c/script',html)
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'patch.json';e.write_safe(p,'{}')
   with self.assertRaisesRegex(ValueError,'overwriting'):e.write_safe(p,'{}')
if __name__=='__main__':unittest.main()
