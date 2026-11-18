\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
DO $$BEGIN
 BEGIN INSERT INTO storage.objects VALUES ('50000000-0000-0000-0000-000000000002','guide-photos','new.jpg'); RAISE EXCEPTION 'photo upload permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
UPDATE storage.objects SET name='changed.jpg' WHERE id='50000000-0000-0000-0000-000000000001';
DELETE FROM storage.objects WHERE id='50000000-0000-0000-0000-000000000001';
INSERT INTO storage.objects VALUES ('50000000-0000-0000-0000-000000000003','unrelated-bucket','separate.jpg');
RESET ROLE;
SELECT public.fixture_assert((SELECT name='fixture.jpg' FROM storage.objects WHERE id='50000000-0000-0000-0000-000000000001'),'guide photo update and delete denied');
SELECT public.fixture_assert((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='unrelated-bucket'),'unrelated bucket policy unaffected in fixture');
