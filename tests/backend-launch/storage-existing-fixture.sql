-- Synthetic approximation of the *observed* hosted Storage RLS predicates.
-- Does not prove Storage HTTP behavior or the current production catalog.
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO authenticated;
CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text NOT NULL,name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(regexp_replace($1,'/[^/]+$',''),'/') $$;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;
CREATE POLICY fixture_read ON storage.objects FOR SELECT TO authenticated USING (true);
CREATE POLICY fixture_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='guide-photos' AND EXISTS(SELECT 1 FROM public.guides g JOIN public.guide_claims c ON c.guide_id=g.id WHERE g.slug=(storage.foldername(objects.name))[1] AND c.claimant_id=(SELECT auth.uid()) AND c.status='approved')
);
CREATE POLICY fixture_delete ON storage.objects FOR DELETE TO authenticated USING (
 bucket_id='guide-photos' AND EXISTS(SELECT 1 FROM public.guides g JOIN public.guide_claims c ON c.guide_id=g.id WHERE g.slug=(storage.foldername(objects.name))[1] AND c.claimant_id=(SELECT auth.uid()) AND c.status='approved')
);
CREATE POLICY fixture_unrelated_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='unrelated-bucket');
