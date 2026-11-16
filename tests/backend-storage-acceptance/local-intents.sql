-- All IDs and object keys below are synthetic; no storage.objects writes.
INSERT INTO public.guide_claims(id,guide_id,claimant_id,status) VALUES
 ('20000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','pending');
INSERT INTO qa_storage_private.intents(bucket_id,object_key,owner_id,purpose,claim_id,guide_id) VALUES
 ('qa-private-evidence','claims/one.png','00000000-0000-0000-0000-000000000001','claim-evidence','20000000-0000-0000-0000-000000000002',NULL),
 ('qa-private-evidence','claims/two.png','00000000-0000-0000-0000-000000000002','claim-evidence','20000000-0000-0000-0000-000000000010',NULL),
 ('qa-private-evidence','claims/two-later.png','00000000-0000-0000-0000-000000000002','claim-evidence','20000000-0000-0000-0000-000000000010',NULL),
 ('qa-media-quarantine','media/owner.png','00000000-0000-0000-0000-000000000005','guide-media',NULL,'10000000-0000-0000-0000-000000000001'),
 ('qa-media-quarantine','media/oversize.png','00000000-0000-0000-0000-000000000005','guide-media',NULL,'10000000-0000-0000-0000-000000000001'),
 ('qa-media-quarantine','media/active.png','00000000-0000-0000-0000-000000000005','guide-media',NULL,'10000000-0000-0000-0000-000000000001'),
 ('qa-media-quarantine','media/spoof.png','00000000-0000-0000-0000-000000000005','guide-media',NULL,'10000000-0000-0000-0000-000000000001');
