-- Pause the isolated identity proof while keeping all bindings and historical records.
BEGIN;
UPDATE rmg_private.wa_listed_review_identity_v1 SET enabled=false WHERE enabled;
COMMIT;
