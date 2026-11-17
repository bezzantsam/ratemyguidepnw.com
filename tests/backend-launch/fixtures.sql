\set ON_ERROR_STOP on
-- The captured snapshot omitted guide_media. This table/policy is explicitly
-- synthetic; it proves grant removal works, not its hosted structure or storage.
CREATE TABLE public.guide_media(id uuid PRIMARY KEY,guide_id uuid NOT NULL,caption text);
ALTER TABLE public.guide_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_media_owner ON public.guide_media FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.guide_media TO authenticated;
GRANT UPDATE(caption) ON public.guide_media TO authenticated;
-- Deliberately add column-only grants as drift fixtures; the repair must
-- remove them rather than relying on table-level REVOKE alone.
GRANT SELECT(author_id) ON public.reviews TO authenticated;
GRANT INSERT(public_evidence) ON public.claim_evidence TO authenticated;
INSERT INTO auth.users(id) SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,6) n;
INSERT INTO public.site_admins(user_id) VALUES ('00000000-0000-0000-0000-000000000004'),('00000000-0000-0000-0000-000000000005');
INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES
 ('10000000-0000-0000-0000-000000000001','fixture-one','Fixture one','published'),
 ('10000000-0000-0000-0000-000000000002','fixture-two','Fixture two','published'),
 ('10000000-0000-0000-0000-000000000003','fixture-three','Fixture three','draft');
INSERT INTO public.guide_claims(id,guide_id,claimant_id,status) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','approved'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','pending');
INSERT INTO public.claim_evidence(claim_id,claimant_name,public_evidence) VALUES ('20000000-0000-0000-0000-000000000002','Synthetic claimant','synthetic private evidence');
INSERT INTO public.guide_details(guide_id,expertise) VALUES ('10000000-0000-0000-0000-000000000001','original');
INSERT INTO public.guide_media VALUES ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','original');
INSERT INTO public.reviews(id,guide_id,author_id,quality,intensity,would_book_again,body,status,published_at) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',5,4,true,repeat('published ',10),'published',now()),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',3,4,false,repeat('pending ',11),'pending',NULL),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',4,4,true,repeat('pending ',11),'pending',NULL);
CREATE FUNCTION public.fixture_assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; RAISE NOTICE 'PASS: %',message; END$$;
GRANT EXECUTE ON FUNCTION public.fixture_assert(boolean,text) TO anon,authenticated;
