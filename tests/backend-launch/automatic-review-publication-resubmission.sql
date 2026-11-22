-- Synthetic, disposable fixture. Keep the second rejected example for the two-session retry below.
BEGIN;
INSERT INTO auth.users(id,email_confirmed_at)
VALUES ('00000000-0000-0000-0000-000000000181',now());
INSERT INTO public.guides(id,slug,full_name,listing_status)
SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'fixture-replacement-'||n,'Synthetic replacement guide '||n,'published' FROM generate_series(181,184) n;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
SELECT 'OR','OG.'||lpad(n::text,7,'0'),
 ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,now(),'synthetic replacement'
 FROM generate_series(181,184) n;
INSERT INTO public.reviews(id,guide_id,author_id,quality,would_book_again,body,trip_responses,status,created_at)
SELECT ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000181',2,false,
 'Synthetic earlier submission','{"version":1,"answers":{"fish_landed":{"state":"answered","value":1}}}',
 state, now()-interval '2 days' FROM (VALUES(181,'rejected'),(182,'pending'),(183,'removed'),(184,'rejected')) f(n,state);
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;

CREATE TEMP TABLE before_replacement AS SELECT to_jsonb(r) AS original FROM public.reviews r
 WHERE r.id='30000000-0000-0000-0000-000000000181';
CREATE TEMP TABLE replacement_receipt(receipt jsonb);
GRANT SELECT, INSERT ON replacement_receipt TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000181',true);
SELECT public.fixture_assert(public.rmg_own_review_for_guide('OR','OG.0000181') IS NULL,
 'the rejected historical review leaves no active review for this guide');
INSERT INTO replacement_receipt SELECT public.rmg_submit_review_v3('OR','OG.0000181',5::smallint,NULL,true,
 'Synthetic replacement from a new trip',true,'none',
 '{"version":1,"answers":{"fish_landed":{"state":"answered","value":7}}}','2026-05','{"equipment":4}');
SELECT public.fixture_assert((SELECT receipt->>'id'<>'30000000-0000-0000-0000-000000000181'
 AND receipt->>'status'='published' AND public.rmg_own_review_for_guide('OR','OG.0000181') @> receipt FROM replacement_receipt),
 'the replacement has a new ID and appears in the author active lookup');
DO $$
DECLARE sample record;
BEGIN
 FOR sample IN SELECT * FROM (VALUES ('OG.0000181','published'),('OG.0000182','pending'),('OG.0000183','removed')) s(source_id,status)
 LOOP
   PERFORM public.fixture_assert(public.rmg_own_review_for_guide('OR',sample.source_id)->>'status'=sample.status,
     'the active lookup returns the existing '||sample.status||' review');
   BEGIN
     PERFORM public.rmg_submit_review_v3('OR',sample.source_id,5::smallint,NULL,true,'Attempted duplicate',true,'none',NULL,NULL,'{}');
     RAISE EXCEPTION 'Duplicate attempt succeeded for %',sample.status;
   EXCEPTION WHEN SQLSTATE 'P4091' THEN NULL;
   END;
 END LOOP;
END $$;
SET LOCAL ROLE anon;
SELECT public.fixture_assert(public.rmg_review_summary('OR','OG.0000181') @> '{"count":1,"averageQuality":5,"wouldBookAgainPercent":100}'
 AND (SELECT count(*)=1 FROM public.public_angler_reviews WHERE guide_id='10000000-0000-0000-0000-000000000181')
 AND EXISTS (SELECT FROM public.public_angler_reviews WHERE guide_id='10000000-0000-0000-0000-000000000181'
    AND trip_month='2026-05-01' AND equipment=4 AND trip_responses#>>'{answers,fish_landed,value}'='7'),
 'only the newly answered trip is public and counted in discovery');
RESET ROLE;
SELECT public.fixture_assert((SELECT original=to_jsonb(r) FROM before_replacement CROSS JOIN public.reviews r
 WHERE r.id='30000000-0000-0000-0000-000000000181'), 'the rejected historical row is unchanged');
COMMIT;
