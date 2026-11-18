\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
INSERT INTO storage.objects VALUES ('60000000-0000-0000-0000-000000000001','guide-photos','fixture-one/before.jpg');
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='guide-photos'),'baseline existing policy permits approved-owner upload');
