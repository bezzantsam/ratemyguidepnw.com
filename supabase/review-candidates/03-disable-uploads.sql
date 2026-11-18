-- REVIEW CANDIDATE ONLY. Existing approved-claim storage policies otherwise
-- allow direct uploads/deletes to the public guide-photos bucket. Keep these
-- operations disabled without changing other buckets or existing policies.
BEGIN;
CREATE POLICY rmg_launch_no_guide_photo_insert ON storage.objects AS RESTRICTIVE
 FOR INSERT TO authenticated WITH CHECK (bucket_id <> 'guide-photos');
CREATE POLICY rmg_launch_no_guide_photo_update ON storage.objects AS RESTRICTIVE
 FOR UPDATE TO authenticated USING (bucket_id <> 'guide-photos') WITH CHECK (bucket_id <> 'guide-photos');
CREATE POLICY rmg_launch_no_guide_photo_delete ON storage.objects AS RESTRICTIVE
 FOR DELETE TO authenticated USING (bucket_id <> 'guide-photos');
COMMIT;
