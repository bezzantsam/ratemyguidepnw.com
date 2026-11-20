BEGIN;
REVOKE EXECUTE ON FUNCTION public.rmg_account_saved_guides_v1(text,jsonb) FROM authenticated;
REVOKE SELECT(jurisdiction,source_id) ON rmg_private.account_saved_guides FROM authenticated;
COMMIT;
