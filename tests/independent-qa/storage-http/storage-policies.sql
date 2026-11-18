-- Exact captured guide-photo RLS predicate shape (snapshot SHA-256 documented in README).
GRANT USAGE ON SCHEMA storage TO anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;
CREATE POLICY guide_photo_public ON storage.objects FOR SELECT TO anon,authenticated USING
 (bucket_id='guide-photos' AND EXISTS (SELECT 1 FROM public.guide_media m WHERE m.photo_path=objects.name));
CREATE POLICY guide_photo_verified_delete ON storage.objects FOR DELETE TO authenticated USING
 (bucket_id='guide-photos' AND EXISTS (SELECT 1 FROM public.guides g JOIN public.guide_claims c ON c.guide_id=g.id
  WHERE g.slug=(storage.foldername(objects.name))[1] AND c.claimant_id=(SELECT auth.uid()) AND c.status='approved'));
CREATE POLICY guide_photo_verified_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK
 (bucket_id='guide-photos' AND (storage.foldername(name))[1] IS NOT NULL AND EXISTS (SELECT 1 FROM public.guides g JOIN public.guide_claims c ON c.guide_id=g.id
  WHERE g.slug=(storage.foldername(objects.name))[1] AND c.claimant_id=(SELECT auth.uid()) AND c.status='approved'));
-- Synthetic control only; no assertion about any actual unrelated hosted bucket.
CREATE POLICY qa_unrelated_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='qa-unrelated');
CREATE POLICY qa_unrelated_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='qa-unrelated');
CREATE POLICY qa_unrelated_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='qa-unrelated');
