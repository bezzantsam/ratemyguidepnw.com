#!/usr/bin/env python3
"""Prepare a review-only seed from an exact source snapshot; never connects to a DB."""
import hashlib,json,pathlib,re,sys
source=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'lib/oregon-guides.json')
raw=source.read_bytes()
data=json.loads(raw)
ids=[r['registration'] for r in data]
if not ids or len(ids)!=len(set(ids)) or not all(isinstance(x,str) and re.fullmatch(r'OG\.[A-Z0-9.&]+',x) for x in ids):
 raise SystemExit('Invalid or duplicate source registrations')
ids.sort()
hash=hashlib.sha256(raw).hexdigest()
print(f'''-- REVIEW ONLY: exact registration + derived-slug reconciliation; not ownership verification.
-- Source snapshot SHA-256 {hash}, {len(ids)} unique source IDs.
-- Revalidate source tree and hosted catalog; no hardcoded database UUIDs.
BEGIN;
CREATE TEMP TABLE rmg_oregon_seed_source(source_id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO rmg_oregon_seed_source(source_id) VALUES''')
print(',\n'.join(" ('"+x+"')" for x in ids)+';')
print(f'''DO $$BEGIN
 IF (SELECT count(*) FROM rmg_oregon_seed_source) <> {len(ids)} THEN RAISE EXCEPTION 'Source count changed'; END IF;
 IF EXISTS (
  SELECT s.source_id FROM rmg_oregon_seed_source s LEFT JOIN public.guides g ON g.license_number=s.source_id
  GROUP BY s.source_id HAVING count(g.id)<>1 OR count(g.id) FILTER (WHERE g.slug=lower(regexp_replace(s.source_id,'[^a-zA-Z0-9]+','-','g')) AND g.listing_status='published')<>1
 ) THEN RAISE EXCEPTION 'Missing or ambiguous Oregon mapping'; END IF;
 IF EXISTS (
  SELECT 1 FROM rmg_oregon_seed_source s JOIN public.guides g ON g.license_number=s.source_id AND g.slug=lower(regexp_replace(s.source_id,'[^a-zA-Z0-9]+','-','g')) AND g.listing_status='published'
  JOIN rmg_private.guide_identity_map m ON m.jurisdiction='OR' AND (m.source_id=s.source_id OR m.guide_id=g.id)
  WHERE m.source_id<>s.source_id OR m.guide_id<>g.id
 ) THEN RAISE EXCEPTION 'Conflicting Oregon mapping'; END IF;
END $$;
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference)
SELECT 'OR',s.source_id,g.id,now(),'source-sha256:{hash}; exact-registration+derived-slug'
FROM rmg_oregon_seed_source s JOIN public.guides g ON g.license_number=s.source_id AND g.slug=lower(regexp_replace(s.source_id,'[^a-zA-Z0-9]+','-','g')) AND g.listing_status='published'
ON CONFLICT (jurisdiction,source_id) DO NOTHING;
COMMIT;''')
