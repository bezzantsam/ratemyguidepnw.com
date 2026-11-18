\set ON_ERROR_STOP on
-- Synthetic storage.objects RLS only; NOT a Storage API test.
-- Run in a fresh disposable fixture after storage-fixture.sql and candidate 03.
BEGIN;
DO $$BEGIN
 IF session_user <> 'audit_owner' OR current_database() <> 'postgres'
    OR to_regprocedure('public.fixture_assert(boolean,text)') IS NULL
    OR to_regclass('storage.objects') IS NULL
    OR (SELECT count(*) FROM auth.users) <> 6
    OR (SELECT count(*) FROM public.guides) <> 3
    OR (SELECT count(*) FROM storage.objects) <> 1
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE id='50000000-0000-0000-0000-000000000001' AND bucket_id='guide-photos' AND name='fixture.jpg')
 THEN RAISE EXCEPTION 'Refuse: not the dedicated synthetic storage audit cluster'; END IF;
END$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
-- The unrelated bucket is permitted by the intentionally permissive fixture.
INSERT INTO storage.objects(id,bucket_id,name) VALUES ('50000000-0000-0000-0000-000000000010','unrelated-bucket','qa-synthetic.jpg');
UPDATE storage.objects SET name='qa-updated.jpg' WHERE id='50000000-0000-0000-0000-000000000010';
SELECT public.fixture_assert((SELECT name='qa-updated.jpg' FROM storage.objects WHERE id='50000000-0000-0000-0000-000000000010'),'unrelated bucket update remains available in permissive fixture');
DO $$BEGIN
 BEGIN
  INSERT INTO storage.objects(id,bucket_id,name) VALUES ('50000000-0000-0000-0000-000000000011','guide-photos','qa-new.jpg');
  RAISE EXCEPTION 'QA: direct photo upload accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE storage.objects SET bucket_id='guide-photos' WHERE id='50000000-0000-0000-0000-000000000010';
  RAISE EXCEPTION 'QA: update into restricted bucket accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  INSERT INTO storage.objects(id,bucket_id,name) VALUES ('50000000-0000-0000-0000-000000000001','guide-photos','qa-overwrite.jpg')
  ON CONFLICT(id) DO UPDATE SET name=excluded.name;
  RAISE EXCEPTION 'QA: photo upsert accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END$$;
-- RLS may silently affect zero rows, so check real state afterwards.
UPDATE storage.objects SET bucket_id='unrelated-bucket',name='qa-moved.jpg' WHERE id='50000000-0000-0000-0000-000000000001';
DELETE FROM storage.objects WHERE id='50000000-0000-0000-0000-000000000001';
RESET ROLE;
SELECT public.fixture_assert((SELECT bucket_id='guide-photos' AND name='fixture.jpg' FROM storage.objects WHERE id='50000000-0000-0000-0000-000000000001'),'photo update, move, delete and upsert did not change the original object');
SELECT public.fixture_assert((SELECT bucket_id='unrelated-bucket' AND name='qa-updated.jpg' FROM storage.objects WHERE id='50000000-0000-0000-0000-000000000010'),'cross-bucket update refused without corrupting other bucket');
ROLLBACK;
\echo 'PASS independent synthetic storage RLS checks; transaction rolled back; Storage API untested'
