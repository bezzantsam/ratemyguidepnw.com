\set ON_ERROR_STOP on
-- Synthetic identities and content, created only by the disposable database owner.
INSERT INTO auth.users(id) SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,7) n;
INSERT INTO public.site_admins(user_id) VALUES ('00000000-0000-0000-0000-000000000004'),('00000000-0000-0000-0000-000000000005');
INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES
 ('10000000-0000-0000-0000-000000000001','qa-one','Test one','published'),
 ('10000000-0000-0000-0000-000000000002','qa-two','Test two','published'),
 ('10000000-0000-0000-0000-000000000003','qa-three','Test three','draft'),
 ('10000000-0000-0000-0000-000000000004','qa-four','Test four','published');
INSERT INTO public.guide_claims(id,guide_id,claimant_id,status) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','approved'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','pending'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','pending');
INSERT INTO public.claim_evidence(claim_id,claimant_name,public_evidence) VALUES ('20000000-0000-0000-0000-000000000002','QA Claimant','QA private evidence');
INSERT INTO public.guide_details(guide_id,expertise) VALUES ('10000000-0000-0000-0000-000000000001','before');
INSERT INTO public.reviews(id,guide_id,author_id,quality,intensity,would_book_again,body,status,published_at) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',4,3,true,repeat('public ',14),'published',now()),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',3,2,false,repeat('pending ',12),'pending',NULL),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',5,5,true,repeat('pending ',12),'pending',NULL),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',2,2,false,repeat('pending ',12),'pending',NULL);
-- Every assertion uses the calling role; these helpers are not privileged.
CREATE FUNCTION public.qa_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %',label; END IF; RAISE NOTICE 'PASS: %',label; END$$;
CREATE FUNCTION public.qa_expect(sql_text text,expected_state text,expected_message text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE got_state text; got_message text; denied boolean := false;
BEGIN
 BEGIN EXECUTE sql_text; EXCEPTION WHEN insufficient_privilege OR undefined_column OR raise_exception THEN GET STACKED DIAGNOSTICS got_state=RETURNED_SQLSTATE,got_message=MESSAGE_TEXT; denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'unexpected success: %',sql_text; END IF;
 IF got_state IS DISTINCT FROM expected_state OR (expected_message IS NOT NULL AND got_message IS DISTINCT FROM expected_message) THEN RAISE EXCEPTION 'wrong error %, % for %',got_state,got_message,sql_text; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.qa_assert(boolean,text),public.qa_expect(text,text,text) TO anon,authenticated;
