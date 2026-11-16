-- LOCAL PROPOSAL ONLY. The storage schema is created by the pinned upstream
-- service in a disposable database; it is NOT a captured hosted definition.
BEGIN;
CREATE SCHEMA qa_storage_private;
REVOKE ALL ON SCHEMA qa_storage_private FROM PUBLIC;
GRANT USAGE ON SCHEMA qa_storage_private TO authenticated;
CREATE TABLE qa_storage_private.intents (
 bucket_id text NOT NULL,
 object_key text NOT NULL,
 owner_id uuid NOT NULL REFERENCES auth.users(id),
 purpose text NOT NULL CHECK (purpose IN ('claim-evidence','guide-media')),
 claim_id uuid REFERENCES public.guide_claims(id),
 guide_id uuid REFERENCES public.guides(id),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','blocked')),
 PRIMARY KEY (bucket_id,object_key),
 CHECK ((purpose='claim-evidence' AND bucket_id='qa-private-evidence' AND claim_id IS NOT NULL AND guide_id IS NULL) OR
        (purpose='guide-media' AND bucket_id='qa-media-quarantine' AND guide_id IS NOT NULL AND claim_id IS NULL))
);
REVOKE ALL ON qa_storage_private.intents FROM PUBLIC,anon,authenticated;
-- The caller cannot supply an actor. These boolean predicates are not a
-- publication mechanism and expose no private evidence contents.
CREATE FUNCTION qa_storage_private.can_insert(p_bucket text,p_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM qa_storage_private.intents i WHERE i.bucket_id=p_bucket AND i.object_key=p_key
   AND i.owner_id=auth.uid() AND i.state='pending' AND (
    (i.purpose='claim-evidence' AND EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.id=i.claim_id AND c.claimant_id=auth.uid() AND c.status='pending')) OR
    (i.purpose='guide-media' AND EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=i.guide_id AND c.claimant_id=auth.uid() AND c.status='approved'))
   )
 )
$$;
CREATE FUNCTION qa_storage_private.can_read(p_bucket text,p_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM qa_storage_private.intents i WHERE i.bucket_id=p_bucket AND i.object_key=p_key AND (
   public.is_site_admin() OR (i.owner_id=auth.uid() AND (
    (i.purpose='claim-evidence' AND EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.id=i.claim_id AND c.claimant_id=auth.uid() AND c.status IN ('pending','denied'))) OR
    (i.purpose='guide-media' AND EXISTS(SELECT 1 FROM public.guide_claims c WHERE c.guide_id=i.guide_id AND c.claimant_id=auth.uid() AND c.status='approved'))
   ))
  )
 )
$$;
REVOKE ALL ON FUNCTION qa_storage_private.can_insert(text,text),qa_storage_private.can_read(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION qa_storage_private.can_insert(text,text),qa_storage_private.can_read(text,text) TO authenticated;
-- Default-off customer writes. Policies permit only private reads, and an
-- optional local fixture explicitly grants INSERT. No UPDATE/DELETE/promotion.
REVOKE ALL ON storage.objects FROM PUBLIC,anon,authenticated;
GRANT SELECT ON storage.objects TO authenticated;
CREATE POLICY qa_private_object_read ON storage.objects FOR SELECT TO authenticated USING (qa_storage_private.can_read(bucket_id,name));
COMMIT;
