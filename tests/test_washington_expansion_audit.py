import unittest
from scripts.washington_expansion_audit import audit, baseline, compact, domain, matches, phone, review_search, safe_cell


def candidate(**overrides):
    row={'candidate_id':'candidate-1','business':'River Guides','guide_name':'','aliases':'','city':'Forks',
         'public_phone':'','listed_website':'','species':'','waterbodies':'','port':''}
    return {**row,**overrides}


class WashingtonExpansionTests(unittest.TestCase):
    def test_names_business_domain_and_phone_are_signals_not_merges(self):
        existing=[{'id':'wa-1','name':'Captain One','business':'River Guides','state':'WA','website':'https://www.river.example', 'phone':'360-555-0100','notes':'Forks'},
                  {'id':'wa-2','name':'Captain Two','business':'River Guides','state':'WA','website':'','phone':'','notes':''}]
        found=matches(candidate(listed_website='https://river.example/a',public_phone='1 (360) 555-0100'),existing)
        self.assertEqual([x['id'] for x in found],['wa-1','wa-2'])
        self.assertIn('same_domain_review',found[0]['signals'])
        self.assertIn('same_phone_review',found[0]['signals'])
        self.assertEqual(found[0]['geography'],'overlap_hint')
        self.assertEqual(found[1]['geography'],'unknown')
        self.assertEqual(audit([candidate()],existing,[])[0]['triage'],'possible_existing_match')

    def test_unknown_and_social_sites_do_not_collapse_people(self):
        self.assertEqual(domain('https://facebook.com/a'),'')
        self.assertEqual(domain('https://user:pass@example.com/'),'')
        self.assertEqual(phone('555'),'')
        self.assertEqual(compact('Angler’s Obsession'),'anglersobsession')
        result=audit([candidate(business='New Outfit')],[],[])[0]
        self.assertTrue(result['manual_review_required'])
        self.assertEqual(result['triage'],'no_match_found_in_snapshot')
        self.assertEqual(result['integration_status'],'held_no_identity_or_publication_approval')

    def test_shared_candidate_phone_is_a_review_signal(self):
        one=candidate(public_phone='360-555-0100')
        two=candidate(candidate_id='candidate-2',business='Different Charter',public_phone='(360) 555-0100')
        result=audit([one,two],[],[])
        self.assertEqual(result[0]['candidate_match_signals'][0]['signals'],['same_phone_review'])
        self.assertEqual(result[1]['triage'],'possible_existing_match')

    def test_review_search_does_not_invent_attributes(self):
        rows=[candidate(business='North Star',guide_name='Jane Smith',aliases='Blue Boat',species='Walleye',waterbodies='Banks Lake',city='Grand Coulee',port='Westport')]
        for query in ('jane','blue boat','walleye banks','westport','grand coulee'):
            with self.subTest(query=query):self.assertEqual(review_search(rows,query),rows)
        self.assertEqual(review_search(rows,'salmon'),[])
        self.assertEqual(review_search(rows,'walleye snake'),[])

    def test_spreadsheet_values_are_safe(self):
        self.assertEqual(safe_cell('  =HYPERLINK("bad")'),"'  =HYPERLINK(\"bad\")")
        self.assertEqual(safe_cell('Normal'),'Normal')


if __name__=='__main__': unittest.main()
