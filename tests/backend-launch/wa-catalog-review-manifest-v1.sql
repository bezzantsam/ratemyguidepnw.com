\set ON_ERROR_STOP on
-- Optional replay of a separately reviewed manifest's SQL-ready array.
-- Both default-off and validated real contents are checked in disposable PG.
BEGIN;
\i :catalog_rows
SELECT public.fixture_assert((SELECT count(*)=158 FROM rmg_private.wa_catalog_review_targets_v1)
 AND NOT (SELECT enabled FROM rmg_private.wa_catalog_review_control_v1)
 AND NOT EXISTS (SELECT 1 FROM rmg_private.wa_catalog_review_targets_v1 t
  JOIN public.guide_claims c ON c.guide_id=t.review_identity),
 'reviewed current catalog provisions 158 exact dispositions with no claims and no activation');
SELECT hold_reason,count(*) FROM rmg_private.wa_catalog_review_targets_v1 GROUP BY hold_reason ORDER BY hold_reason;
ROLLBACK;
