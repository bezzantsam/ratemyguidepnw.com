-- Additive candidate after the Oregon reviews split. Disabled and empty on install.
DO $$
BEGIN
 IF to_regprocedure('rmg_private.approved_owner_claim_for_source_v1(text,text,boolean)') IS NULL
  OR to_regprocedure('rmg_private.require_claim_actor_v1()') IS NULL
  OR to_regprocedure('rmg_private.lock_claims_for_write_v1()') IS NULL
 THEN RAISE EXCEPTION 'Verified Oregon claim foundation required' USING ERRCODE='P5030'; END IF;
END $$;

CREATE TABLE rmg_private.guide_offerings_control_v1 (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 enabled boolean NOT NULL DEFAULT false
);
INSERT INTO rmg_private.guide_offerings_control_v1 DEFAULT VALUES;

CREATE TABLE rmg_private.guide_offerings_drafts_v1 (
 claim_id uuid PRIMARY KEY REFERENCES public.guide_claims(id),
 revision integer NOT NULL CHECK (revision>0),
 payload jsonb NOT NULL
);
CREATE TABLE rmg_private.guide_offerings_proposals_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 guide_id uuid NOT NULL REFERENCES public.guides(id),
 claim_id uuid NOT NULL REFERENCES public.guide_claims(id),
 source_id text NOT NULL CHECK (source_id ~ '^OG\.[0-9]{7}(\.[A-Z0-9&]+)?$'),
 revision integer NOT NULL CHECK (revision>0),
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 decided_by uuid REFERENCES auth.users(id),
 reason text,
 published_version integer CHECK (published_version>0),
 UNIQUE (claim_id,revision),
 CHECK ((status='pending' AND decided_at IS NULL AND decided_by IS NULL AND reason IS NULL) OR
        (status<>'pending' AND decided_at IS NOT NULL AND decided_by IS NOT NULL AND reason IS NOT NULL)),
 CHECK ((status='approved')=(published_version IS NOT NULL))
);
CREATE UNIQUE INDEX guide_offerings_one_pending_v1 ON rmg_private.guide_offerings_proposals_v1(guide_id) WHERE status='pending';
CREATE INDEX guide_offerings_queue_v1 ON rmg_private.guide_offerings_proposals_v1(created_at,id) WHERE status='pending';
CREATE INDEX guide_offerings_owner_history_v1 ON rmg_private.guide_offerings_proposals_v1(claim_id,revision DESC);
CREATE TABLE rmg_private.guide_offerings_publications_v1 (
 guide_id uuid PRIMARY KEY REFERENCES public.guides(id),
 source_id text NOT NULL UNIQUE CHECK (source_id ~ '^OG\.[0-9]{7}(\.[A-Z0-9&]+)?$'),
 proposal_id uuid NOT NULL UNIQUE REFERENCES rmg_private.guide_offerings_proposals_v1(id),
 version integer NOT NULL CHECK (version>0)
);
ALTER TABLE rmg_private.guide_offerings_control_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE rmg_private.guide_offerings_drafts_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE rmg_private.guide_offerings_proposals_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE rmg_private.guide_offerings_publications_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rmg_private.guide_offerings_control_v1,rmg_private.guide_offerings_drafts_v1,
 rmg_private.guide_offerings_proposals_v1,rmg_private.guide_offerings_publications_v1
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION rmg_private.offering_text_v1(value jsonb, min_length integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT COALESCE(jsonb_typeof(value)='string'
  AND char_length(btrim(value #>> '{}')) BETWEEN min_length AND 80
  AND char_length(value #>> '{}')<=80
  AND (value #>> '{}') !~ '[<>[:cntrl:]]'
  AND (value #>> '{}') !~* '([A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}|(https?://|www[.])|([0-9]{3}[-. ]?){2}[0-9]{4})',false)
$$;

-- The method/gear choices are pinned to lib/captain-fishing/catalog.mjs.
-- The target allowlist is pinned to lib/guide-offerings/species.json.
CREATE FUNCTION rmg_private.offering_choices_v1(value jsonb, allowed text[], minimum integer, maximum integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(value) NOT BETWEEN minimum AND maximum THEN RETURN false; END IF;
 RETURN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(value) e
  WHERE jsonb_typeof(e)<>'string' OR NOT ((e#>>'{}')=ANY(allowed)))
  AND (SELECT count(DISTINCT e) FROM jsonb_array_elements(value) e)=jsonb_array_length(value);
END $$;

CREATE FUNCTION rmg_private.valid_guide_offerings_v1(payload jsonb, for_submission boolean)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE vessel jsonb; trip jsonb; vessel_ids text[]:=ARRAY[]::text[]; trip_ids text[]:=ARRAY[]::text[];
 minimum integer:=CASE WHEN for_submission THEN 1 ELSE 0 END;
BEGIN
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR (payload-ARRAY['vessels','offerings'])<>'{}'::jsonb
  OR jsonb_typeof(payload->'vessels') IS DISTINCT FROM 'array'
  OR jsonb_typeof(payload->'offerings') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(payload->'vessels')>4 OR jsonb_array_length(payload->'offerings')>8
  OR octet_length(payload::text)>24000 THEN RETURN false; END IF;

 FOR vessel IN SELECT value FROM jsonb_array_elements(payload->'vessels') LOOP
  IF jsonb_typeof(vessel)<>'object' OR NOT (vessel ?& ARRAY['id','label','type','covered','heated','maxAnglers','fishCare'])
   OR (vessel-ARRAY['id','label','type','covered','heated','maxAnglers','fishCare'])<>'{}'
   OR jsonb_typeof(vessel->'id')<>'string' OR (vessel->>'id') !~ '^v[1-9][0-9]{0,3}$'
   OR vessel->>'id'=ANY(vessel_ids) OR NOT rmg_private.offering_text_v1(vessel->'label',minimum)
   OR COALESCE(vessel->>'type','') NOT IN ('Sled / jet boat','Ocean charter boat','Drift boat','Raft','Surf-launched dory','Catamaran','Other / varies')
   OR jsonb_typeof(vessel->'covered')<>'boolean' OR jsonb_typeof(vessel->'heated')<>'boolean'
   OR NOT (vessel->'maxAnglers'='null' OR (jsonb_typeof(vessel->'maxAnglers')='number' AND vessel->>'maxAnglers' ~ '^([1-9]|[12][0-9]|30)$'))
   OR NOT rmg_private.offering_choices_v1(vessel->'fishCare',ARRAY['Bleeding','Icing','Filleting','Bagging'],0,4)
  THEN RETURN false; END IF;
  vessel_ids:=array_append(vessel_ids,vessel->>'id');
 END LOOP;

 FOR trip IN SELECT value FROM jsonb_array_elements(payload->'offerings') LOOP
  IF jsonb_typeof(trip)<>'object'
   OR NOT (trip ?& ARRAY['id','title','jurisdiction','waterway','launchArea','species','months','vesselId','bookingStyle','duration','methodIds','gearIds'])
   OR (trip-ARRAY['id','title','jurisdiction','waterway','launchArea','species','months','vesselId','bookingStyle','duration','methodIds','gearIds'])<>'{}'
   OR jsonb_typeof(trip->'id')<>'string' OR (trip->>'id') !~ '^p[1-9][0-9]{0,3}$' OR trip->>'id'=ANY(trip_ids)
   OR NOT rmg_private.offering_text_v1(trip->'title',minimum)
   OR NOT rmg_private.offering_text_v1(trip->'waterway',minimum)
   OR NOT rmg_private.offering_text_v1(trip->'launchArea',minimum)
   OR COALESCE(trip->>'jurisdiction','') NOT IN ('OR','WA')
   OR NOT (trip->'vesselId'='null' OR (jsonb_typeof(trip->'vesselId')='string' AND trip->>'vesselId'=ANY(vessel_ids)))
   OR COALESCE(trip->>'bookingStyle','') NOT IN ('call_to_confirm','per_seat','private_boat','both')
   OR COALESCE(trip->>'duration','') NOT IN ('unspecified','half_day','full_day','multi_day')
   OR NOT rmg_private.offering_choices_v1(trip->'species',ARRAY['Salmon','Chinook Salmon','Coho Salmon','Sockeye Salmon','Pink Salmon','Chum Salmon','Steelhead','Trout','Rainbow trout','Redband trout','Cutthroat trout','Sea-run cutthroat','Brown trout','Brook trout','Lake trout','Bull trout','Kokanee','Whitefish','Burbot','American shad','Sturgeon','White sturgeon','Walleye','Panfish','Perch','Yellow perch','Crappie','Bluegill','Catfish','Channel catfish','Carp','Bass','Smallmouth bass','Largemouth bass','Spotted bass','Striped bass','Hybrid striped bass','Tiger muskie','Tuna','Albacore tuna','Halibut','Sablefish (black cod)','Rockfish','Lingcod','Cabezon','Greenling','Kelp greenling','Pacific cod','Flatfish','Flounder','Starry flounder','Sole','Surfperch','Redtail surfperch','Squid','Crabbing','Dungeness crab','Spot shrimp'],0,8)
   OR (for_submission AND trip->'species'='[]' AND NOT (trip->'methodIds' ? 'bottom-fishing'))
   OR NOT rmg_private.offering_choices_v1(trip->'methodIds',ARRAY['trolling','backtrolling','jigging','vertical-jigging','squid-jigging','deep-dropping','bottom-fishing','mooching','casting-lures','live-bait-fishing','float-fishing','drift-fishing','side-drifting','back-bouncing','plunking','fly-fishing','dry-fly-fishing','nymphing','swinging-flies','pot-fishing','crab-ring-fishing','clam-digging'],0,22)
   OR NOT rmg_private.offering_choices_v1(trip->'gearIds',ARRAY['electric-fishing-reels','downriggers','manual-downriggers','electric-downriggers','pot-pullers','electric-pot-pullers','manual-pot-pullers','crab-pots','shrimp-pots','crab-rings','clam-guns','clam-shovels','clam-rakes','fly-tackle','two-handed-fly-rods','spinning-tackle','baitcasting-tackle','squid-jigs','fishfinders','gps-anchor'],0,20)
   OR jsonb_typeof(trip->'months') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(trip->'months')>12 OR EXISTS (SELECT 1 FROM jsonb_array_elements(trip->'months') m
   WHERE jsonb_typeof(m)<>'number' OR (m#>>'{}') !~ '^([1-9]|1[012])$')
   OR (SELECT count(DISTINCT m) FROM jsonb_array_elements(trip->'months') m)<>jsonb_array_length(trip->'months')
   THEN RETURN false; END IF;
  trip_ids:=array_append(trip_ids,trip->>'id');
 END LOOP;
 RETURN true;
END $$;

CREATE FUNCTION rmg_private.lock_guide_offerings_v1() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE active boolean;
BEGIN
 SELECT enabled INTO active FROM rmg_private.guide_offerings_control_v1 WHERE singleton FOR SHARE;
 IF active IS DISTINCT FROM true THEN RAISE EXCEPTION 'Offerings unavailable' USING ERRCODE='P5030'; END IF;
END $$;

CREATE FUNCTION rmg_private.guide_offerings_owner_state_v1(claim uuid,gid uuid,source text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'draft',COALESCE((SELECT d.payload||jsonb_build_object('revision',d.revision)
   FROM rmg_private.guide_offerings_drafts_v1 d WHERE d.claim_id=claim),
   '{"revision":0,"vessels":[],"offerings":[]}'::jsonb),
  'proposal',(SELECT jsonb_build_object('id',p.id,'revision',p.revision,'status',p.status,'reason',p.reason)
   FROM rmg_private.guide_offerings_proposals_v1 p WHERE p.claim_id=claim ORDER BY p.revision DESC LIMIT 1),
  'publishedVersion',(SELECT a.version FROM rmg_private.guide_offerings_publications_v1 a
    WHERE a.guide_id=gid AND a.source_id=source)
 )
$$;

CREATE FUNCTION rmg_private.edit_guide_offerings_v1(action text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE claim uuid; gid uuid; source text:=input->>'sourceId'; expected integer;
 current_revision integer; saved jsonb; proposal uuid; expected_keys text[];
BEGIN
 expected_keys:=CASE action
  WHEN 'owner_get' THEN ARRAY['jurisdiction','sourceId']
  WHEN 'owner_save' THEN ARRAY['jurisdiction','sourceId','expectedRevision','draft']
  WHEN 'owner_submit' THEN ARRAY['jurisdiction','sourceId','expectedRevision'] END;
 IF expected_keys IS NULL OR jsonb_typeof(input) IS DISTINCT FROM 'object'
  OR NOT (input ?& expected_keys) OR (input-expected_keys)<>'{}'
  OR input->>'jurisdiction' IS DISTINCT FROM 'OR'
  OR NOT COALESCE(source ~ '^OG\.[0-9]{7}(\.[A-Z0-9&]+)?$',false)
 THEN RAISE EXCEPTION 'Invalid owner input' USING ERRCODE='22023'; END IF;
 claim:=rmg_private.approved_owner_claim_for_source_v1('OR',source,action<>'owner_get');
 SELECT c.guide_id INTO STRICT gid FROM public.guide_claims c WHERE c.id=claim;
 IF (SELECT count(*) FROM public.guide_claims c WHERE c.guide_id=gid AND c.status='approved')<>1
 THEN RAISE EXCEPTION 'Unambiguous approved ownership required' USING ERRCODE='42501'; END IF;
 IF action='owner_get' THEN RETURN rmg_private.guide_offerings_owner_state_v1(claim,gid,source); END IF;
 IF jsonb_typeof(input->'expectedRevision')<>'number'
  OR NOT COALESCE((input->>'expectedRevision') ~ '^(0|[1-9][0-9]{0,8})$',false)
 THEN RAISE EXCEPTION 'Invalid draft revision' USING ERRCODE='22023'; END IF;
 expected:=(input->>'expectedRevision')::integer;
 SELECT d.revision,d.payload INTO current_revision,saved FROM rmg_private.guide_offerings_drafts_v1 d WHERE d.claim_id=claim;
 IF expected<>COALESCE(current_revision,0) THEN RAISE EXCEPTION 'Draft changed' USING ERRCODE='P0001'; END IF;
 IF action='owner_save' THEN
  IF NOT rmg_private.valid_guide_offerings_v1(input->'draft',false) OR expected>=999999999
   THEN RAISE EXCEPTION 'Invalid draft' USING ERRCODE='22023'; END IF;
  INSERT INTO rmg_private.guide_offerings_drafts_v1(claim_id,revision,payload)
  VALUES(claim,expected+1,input->'draft') ON CONFLICT (claim_id)
  DO UPDATE SET revision=excluded.revision,payload=excluded.payload;
 ELSE
  IF current_revision IS NULL OR NOT rmg_private.valid_guide_offerings_v1(saved,true)
   THEN RAISE EXCEPTION 'Save complete offerings before submission' USING ERRCODE='22023'; END IF;
  SELECT p.id INTO proposal FROM rmg_private.guide_offerings_proposals_v1 p WHERE p.claim_id=claim AND p.revision=expected;
  IF proposal IS NULL THEN
   INSERT INTO rmg_private.guide_offerings_proposals_v1(guide_id,claim_id,source_id,revision,payload)
   VALUES(gid,claim,source,expected,saved);
  END IF;
 END IF;
 RETURN rmg_private.guide_offerings_owner_state_v1(claim,gid,source);
END $$;

CREATE FUNCTION rmg_private.moderate_guide_offerings_v1(action text,input jsonb,actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p rmg_private.guide_offerings_proposals_v1%ROWTYPE; gid uuid; claimant uuid; proposal uuid;
 approve boolean; decision text; message text; page_offset integer; page_limit integer;
 items jsonb; next_version integer;
BEGIN
 IF public.is_site_admin() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Moderator required' USING ERRCODE='42501'; END IF;
 PERFORM rmg_private.lock_claims_for_write_v1();
 IF action='moderator_list' THEN
  IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR (input-ARRAY['offset','limit'])<>'{}'
   OR jsonb_typeof(input->'offset') IS DISTINCT FROM 'number' OR jsonb_typeof(input->'limit') IS DISTINCT FROM 'number'
   OR NOT COALESCE((input->>'offset') ~ '^(0|[1-9][0-9]{0,4}|100000)$',false)
   OR NOT COALESCE((input->>'limit') ~ '^([1-9]|[1-4][0-9]|50)$',false)
   THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  page_offset:=(input->>'offset')::integer; page_limit:=(input->>'limit')::integer;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'jurisdiction','OR','sourceId',q.source_id,
   'revision',q.revision,'draft',q.payload) ORDER BY q.created_at,q.id),'[]') INTO items
  FROM (SELECT t.id,t.source_id,t.revision,t.payload,t.created_at FROM rmg_private.guide_offerings_proposals_v1 t
   WHERE t.status='pending' ORDER BY t.created_at,t.id OFFSET page_offset LIMIT page_limit) q;
  RETURN jsonb_build_object('items',items,'offset',page_offset,'limit',page_limit);
 END IF;
 IF action IS DISTINCT FROM 'moderator_decide' OR jsonb_typeof(input) IS DISTINCT FROM 'object'
  OR (input-ARRAY['proposalId','approve','reason'])<>'{}'
  OR jsonb_typeof(input->'approve') IS DISTINCT FROM 'boolean' OR jsonb_typeof(input->'reason') IS DISTINCT FROM 'string'
  OR NOT COALESCE((input->>'proposalId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)
 THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
 proposal:=(input->>'proposalId')::uuid; approve:=(input->>'approve')::boolean; message:=btrim(input->>'reason');
 IF length(message) NOT BETWEEN (CASE WHEN approve THEN 20 ELSE 1 END) AND 500
  THEN RAISE EXCEPTION 'Invalid decision reason' USING ERRCODE='22023'; END IF;
 decision:=CASE WHEN approve THEN 'approved' ELSE 'rejected' END;
 SELECT t.guide_id INTO gid FROM rmg_private.guide_offerings_proposals_v1 t WHERE t.id=proposal;
 IF gid IS NULL THEN RAISE EXCEPTION 'Proposal unavailable' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.guides g WHERE g.id=gid FOR UPDATE;
 SELECT * INTO STRICT p FROM rmg_private.guide_offerings_proposals_v1 t WHERE t.id=proposal FOR UPDATE;
 SELECT c.claimant_id INTO STRICT claimant FROM public.guide_claims c WHERE c.id=p.claim_id;
 IF claimant=actor THEN RAISE EXCEPTION 'Conflicting moderator' USING ERRCODE='42501'; END IF;
 IF p.status<>'pending' THEN
  IF p.status<>decision OR p.reason<>message THEN RAISE EXCEPTION 'Proposal already decided' USING ERRCODE='P0001'; END IF;
  RETURN jsonb_build_object('proposalId',p.id,'status',p.status,'publishedVersion',p.published_version);
 END IF;
 IF approve THEN
  IF NOT EXISTS (SELECT 1 FROM rmg_private.guide_identity_map m JOIN public.guides g ON g.id=m.guide_id
   WHERE m.jurisdiction='OR' AND m.source_id=p.source_id AND m.guide_id=gid AND g.listing_status='published')
   OR NOT EXISTS (SELECT 1 FROM public.guide_claims c WHERE c.id=p.claim_id AND c.guide_id=gid AND c.status='approved')
   OR (SELECT count(*) FROM public.guide_claims c WHERE c.guide_id=gid AND c.status='approved')<>1
   OR NOT rmg_private.valid_guide_offerings_v1(p.payload,true)
  THEN RAISE EXCEPTION 'Current approval and mapping required' USING ERRCODE='P0001'; END IF;
  INSERT INTO rmg_private.guide_offerings_publications_v1 AS a(guide_id,source_id,proposal_id,version)
   VALUES(gid,p.source_id,p.id,1)
   ON CONFLICT(guide_id) DO UPDATE SET source_id=excluded.source_id,proposal_id=excluded.proposal_id,version=a.version+1
   RETURNING version INTO next_version;
 END IF;
 UPDATE rmg_private.guide_offerings_proposals_v1
  SET status=decision,decided_at=now(),decided_by=actor,reason=message,published_version=next_version WHERE id=p.id;
 RETURN jsonb_build_object('proposalId',p.id,'status',decision,'publishedVersion',next_version);
END $$;

CREATE FUNCTION rmg_private.guide_offerings_authorized_v1(p_operation text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=rmg_private.require_claim_actor_v1();
BEGIN
 PERFORM rmg_private.lock_guide_offerings_v1();
 CASE WHEN p_operation IN ('owner_get','owner_save','owner_submit') THEN
  RETURN rmg_private.edit_guide_offerings_v1(p_operation,p_input);
 WHEN p_operation IN ('moderator_list','moderator_decide') THEN
  RETURN rmg_private.moderate_guide_offerings_v1(p_operation,p_input,actor);
 ELSE RAISE EXCEPTION 'Invalid private operation' USING ERRCODE='22023';
 END CASE;
END $$;

CREATE FUNCTION rmg_private.guide_offerings_projection_v1(p_source text,p_after text,p_limit integer)
RETURNS TABLE(source_id text,profile jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.source_id,jsonb_build_object('jurisdiction','OR','sourceId',a.source_id,
  'publishedVersion',a.version,'attribution','captain_declared')||p.payload
 FROM rmg_private.guide_offerings_publications_v1 a
 JOIN rmg_private.guide_offerings_proposals_v1 p ON p.id=a.proposal_id AND p.guide_id=a.guide_id
  AND p.source_id=a.source_id AND p.status='approved' AND p.published_version=a.version
 JOIN rmg_private.guide_identity_map m ON m.jurisdiction='OR' AND m.source_id=a.source_id AND m.guide_id=a.guide_id
 JOIN public.guides g ON g.id=a.guide_id AND g.listing_status='published'
 WHERE (p_source IS NULL OR a.source_id=p_source) AND (p_after IS NULL OR a.source_id>p_after)
 ORDER BY a.source_id LIMIT p_limit
$$;

CREATE FUNCTION rmg_private.guide_offerings_public_v1(p_operation text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE requested_source text; cursor_source text; page_limit integer; response jsonb;
 active boolean:=COALESCE((SELECT enabled FROM rmg_private.guide_offerings_control_v1 WHERE singleton),false);
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'Invalid public operation' USING ERRCODE='22023'; END IF;
 IF p_operation='public_profile' THEN
  requested_source:=p_input->>'sourceId';
  IF (p_input-ARRAY['jurisdiction','sourceId'])<>'{}'
   OR COALESCE(p_input->>'jurisdiction','') NOT IN ('OR','WA')
   OR NOT COALESCE(CASE WHEN p_input->>'jurisdiction'='OR' THEN requested_source ~ '^OG\.[0-9]{7}(\.[A-Z0-9&]+)?$'
    ELSE requested_source ~ '^wa-[0-9]{3,9}$' END,false)
   THEN RAISE EXCEPTION 'Invalid profile source' USING ERRCODE='22023'; END IF;
  IF active AND p_input->>'jurisdiction'='OR' THEN
   SELECT p.profile INTO response FROM rmg_private.guide_offerings_projection_v1(requested_source,NULL,1) p;
  END IF;
  RETURN jsonb_build_object('profile',response);
 ELSIF p_operation='public_batch' THEN
  cursor_source:=p_input->>'afterSourceId';
  IF NOT (p_input ?& ARRAY['limit','afterSourceId']) OR (p_input-ARRAY['limit','afterSourceId'])<>'{}'
   OR (p_input->'afterSourceId'<>'null' AND NOT COALESCE(cursor_source ~ '^OG\.[0-9]{7}(\.[A-Z0-9&]+)?$',false))
   OR jsonb_typeof(p_input->'limit') IS DISTINCT FROM 'number'
   OR NOT COALESCE((p_input->>'limit') ~ '^([1-9][0-9]?|100)$',false)
   THEN RAISE EXCEPTION 'Invalid public pagination' USING ERRCODE='22023'; END IF;
  IF NOT active THEN RETURN '{"items":[],"nextCursor":null}'::jsonb; END IF;
  page_limit:=(p_input->>'limit')::integer;
  WITH page AS (
   SELECT p.*,row_number() OVER(ORDER BY p.source_id) n
   FROM rmg_private.guide_offerings_projection_v1(NULL,cursor_source,page_limit+1) p
  )
  SELECT jsonb_build_object('items',COALESCE(jsonb_agg(profile ORDER BY source_id) FILTER(WHERE n<=page_limit),'[]'),
   'nextCursor',CASE WHEN count(*)>page_limit THEN max(source_id) FILTER(WHERE n=page_limit) ELSE NULL END)
  INTO response FROM page;
  RETURN response;
 END IF;
 RAISE EXCEPTION 'Invalid public operation' USING ERRCODE='22023';
END $$;

CREATE FUNCTION public.rmg_guide_offerings_authorized_v1(p_operation text,p_input jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT rmg_private.guide_offerings_authorized_v1($1,$2)
$$;
CREATE FUNCTION public.rmg_guide_offerings_public_v1(p_operation text,p_input jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT rmg_private.guide_offerings_public_v1($1,$2)
$$;
REVOKE ALL ON FUNCTION rmg_private.offering_text_v1(jsonb,integer),
 rmg_private.offering_choices_v1(jsonb,text[],integer,integer),
 rmg_private.valid_guide_offerings_v1(jsonb,boolean),rmg_private.lock_guide_offerings_v1(),
 rmg_private.guide_offerings_owner_state_v1(uuid,uuid,text),
 rmg_private.edit_guide_offerings_v1(text,jsonb),rmg_private.moderate_guide_offerings_v1(text,jsonb,uuid),
 rmg_private.guide_offerings_projection_v1(text,text,integer),
 rmg_private.guide_offerings_authorized_v1(text,jsonb),rmg_private.guide_offerings_public_v1(text,jsonb),
 public.rmg_guide_offerings_authorized_v1(text,jsonb),public.rmg_guide_offerings_public_v1(text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION rmg_private.guide_offerings_authorized_v1(text,jsonb),
 public.rmg_guide_offerings_authorized_v1(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION rmg_private.guide_offerings_public_v1(text,jsonb),
 public.rmg_guide_offerings_public_v1(text,jsonb) TO anon,authenticated;
