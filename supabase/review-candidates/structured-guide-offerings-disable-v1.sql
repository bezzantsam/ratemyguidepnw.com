-- Waits for admitted owner and moderator operations. Preserves all versioned rows.
BEGIN;
UPDATE rmg_private.guide_offerings_control_v1 SET enabled=false WHERE singleton AND enabled;
COMMIT;
