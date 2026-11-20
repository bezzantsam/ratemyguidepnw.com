-- Pause only the current Washington catalog review lane. Preserves all rows.
BEGIN;
UPDATE rmg_private.wa_catalog_review_control_v1 SET enabled=false WHERE singleton AND enabled;
COMMIT;
