-- Serialize against admitted Washington writes, while preserving rows and Oregon.
BEGIN;
UPDATE rmg_private.wa_review_pilot_v1 SET enabled=false WHERE singleton AND enabled;
COMMIT;
