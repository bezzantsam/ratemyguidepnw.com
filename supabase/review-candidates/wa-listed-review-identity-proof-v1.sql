-- Local proof only. No public routes, historical rows or legacy maps are changed.
CREATE TABLE rmg_private.wa_listed_review_identity_v1 (
 -- Only the pinned historical namespace is eligible. Exact membership comes from the intake.
 source_id text PRIMARY KEY CHECK (CASE WHEN source_id ~ '^wa-[0-9]{3}$'
  THEN substring(source_id FROM 4)::integer BETWEEN 1 AND 163 ELSE false END),
 source_key_sha256 text NOT NULL UNIQUE CHECK (source_key_sha256 ~ '^[0-9a-f]{64}$'),
 listing_sha256 text NOT NULL UNIQUE CHECK (listing_sha256 ~ '^[0-9a-f]{64}$'),
 person_fingerprint text NOT NULL UNIQUE CHECK (person_fingerprint ~ '^[0-9a-f]{64}$'),
 packet_sha256 text NOT NULL UNIQUE CHECK (packet_sha256 ~ '^[0-9a-f]{64}$'),
 review_identity uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 enabled boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX wa_listed_one_enabled_v1
 ON rmg_private.wa_listed_review_identity_v1 ((true)) WHERE enabled;
ALTER TABLE rmg_private.wa_listed_review_identity_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rmg_private.wa_listed_review_identity_v1 FROM PUBLIC, anon, authenticated, service_role;

-- Owner-only proof. The caller provides digests from independent intake, never a guide UUID.
CREATE FUNCTION rmg_private.prepare_wa_listed_review_identity_v1(
 p_source_id text, p_key_sha256 text, p_listing_sha256 text,
 p_person_fingerprint text, p_packet_sha256 text
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE review_id uuid;
BEGIN
 IF EXISTS (SELECT 1 FROM rmg_private.guide_identity_map
            WHERE jurisdiction='WA' AND source_id=p_source_id) THEN
  RAISE EXCEPTION 'Source already has a review mapping' USING ERRCODE='23505';
 END IF;
 INSERT INTO rmg_private.wa_listed_review_identity_v1
 (source_id,source_key_sha256,listing_sha256,person_fingerprint,packet_sha256)
 VALUES (p_source_id,p_key_sha256,p_listing_sha256,p_person_fingerprint,p_packet_sha256)
 RETURNING review_identity INTO review_id;
 IF EXISTS (SELECT 1 FROM public.guides WHERE id=review_id) THEN
  RAISE EXCEPTION 'Generated identity collides with a legacy guide' USING ERRCODE='23505';
 END IF;
 RETURN review_id;
END $$;

-- A version mismatch or later collision fails closed. This does not authorize review writes.
CREATE FUNCTION rmg_private.wa_listed_review_identity_for_version_v1(
 p_source_id text, p_listing_sha256 text
) RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT w.review_identity
 FROM rmg_private.wa_listed_review_identity_v1 w
 WHERE w.source_id=p_source_id AND w.listing_sha256=p_listing_sha256 AND w.enabled
   AND NOT EXISTS (SELECT 1 FROM public.guides g WHERE g.id=w.review_identity)
   AND NOT EXISTS (SELECT 1 FROM rmg_private.guide_identity_map m
                   WHERE (m.jurisdiction='WA' AND m.source_id=w.source_id) OR m.guide_id=w.review_identity)
   AND NOT EXISTS (SELECT 1 FROM rmg_private.wa_review_pilot_v1 WHERE singleton AND enabled)
$$;

REVOKE ALL ON FUNCTION rmg_private.prepare_wa_listed_review_identity_v1(text,text,text,text,text),
 rmg_private.wa_listed_review_identity_for_version_v1(text,text) FROM PUBLIC, anon, authenticated, service_role;
