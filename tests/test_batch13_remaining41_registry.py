"""Exact raw registry mismatch handling, not a general identity normalizer."""
import copy
import json
from pathlib import Path
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import batch13_remaining41 as batch
REVIEW=json.loads(batch.REVIEW.read_text())
SELECTION=batch.SELECTION.read_bytes()
REGISTRY=[dict(registration=r['registration_id'],name=r['imported_name'],business=r['imported_business'] or None,website=r['registry_website']) for r in json.loads(SELECTION)['selected_registry_records']]

def original_registry():
    data=copy.deepcopy(REGISTRY)
    next(r for r in data if r['registration']=='OG.0003288')['business']='Tenacity Outdoors '
    return data

class RegistryWhitespaceTests(unittest.TestCase):
    def test_exact_inspected_difference_retains_both_values(self):
        data=original_registry(); before=copy.deepcopy(data)
        result=batch.build(REVIEW,SELECTION,data)
        self.assertEqual(data,before)
        self.assertEqual(len(result['registry_discrepancies']),1)
        difference=result['registry_discrepancies'][0]
        self.assertEqual(difference['registry_value'],'Tenacity Outdoors ')
        self.assertEqual(difference['manifest_value'],'Tenacity Outdoors')
        held=next(r for r in result['holds'] if r['guide_id']=='OG.0003288')
        self.assertEqual(held['registry_discrepancies'],[difference])
        self.assertEqual(held['review_status'],'name_variant_hold')
        self.assertFalse(any(r['guide_id']=='OG.0003288' for r in result['attributes']))

    def test_other_whitespace_or_business_change_is_rejected(self):
        for value in [' Tenacity Outdoors','Tenacity Outdoors  ','Tenacity Outdoors LLC']:
            data=original_registry()
            next(r for r in data if r['registration']=='OG.0003288')['business']=value
            with self.subTest(value=value),self.assertRaisesRegex(ValueError,'Imported identity changed'):
                batch.validate(REVIEW,SELECTION,data)

    def test_no_other_record_gets_a_whitespace_exception(self):
        data=original_registry(); data[0]['business']+=' '
        with self.assertRaisesRegex(ValueError,'Imported identity changed'):
            batch.validate(REVIEW,SELECTION,data)

    def test_exception_cannot_relax_person_or_domain(self):
        for field,value in [('name','Another Kaiser'),('website','another.example')]:
            data=original_registry()
            next(r for r in data if r['registration']=='OG.0003288')[field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'person or source domain'):
                batch.validate(REVIEW,SELECTION,data)

    def test_exception_requires_original_hold(self):
        review=copy.deepcopy(REVIEW)
        next(r for r in review['records'] if r['registration_id']=='OG.0003288')['review_status']=batch.core.SUPPORTED
        with self.assertRaisesRegex(ValueError,'unchanged held manifest'):
            batch.validate(review,SELECTION,original_registry())

if __name__=='__main__': unittest.main()
