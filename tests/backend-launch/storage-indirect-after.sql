\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
DO $$BEGIN
 BEGIN INSERT INTO storage.objects VALUES ('60000000-0000-0000-0000-000000000002','guide-photos','fixture-one/after.jpg'); RAISE EXCEPTION 'photo upload still permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
DELETE FROM storage.objects WHERE id='60000000-0000-0000-0000-000000000001';
INSERT INTO storage.objects VALUES ('60000000-0000-0000-0000-000000000003','unrelated-bucket','separate.jpg');
SELECT public.fixture_assert((public.rmg_own_status('claim','20000000-0000-0000-0000-000000000001')->>'status')='approved','approved owner still reads own status through authorized RPC');
SELECT public.fixture_assert((public.rmg_edit_details('OR','fixture-1','Boat','Gear',5::smallint,'Expertise','Species')->>'status')='saved','approved owner still edits allowed details through RPC');
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='guide-photos'),'existing photo survives denied delete');
SELECT public.fixture_assert((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='unrelated-bucket'),'unrelated bucket still available in faithful fixture');
