BEGIN;
-- A SECURITY DEFINER review wrapper can call this function as its owner.
-- Close the legacy claim decision at the callee, without affecting its review branch.
CREATE OR REPLACE FUNCTION public.admin_decide_claim(p_id uuid,p_approve boolean,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Use the verified Oregon claim workflow' USING ERRCODE='42501';
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_decide_claim(uuid,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
