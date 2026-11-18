-- REVIEW-ONLY additive emergency disable. Does not delete names or audit rows.
-- Run in an atomic, reviewed transaction after the v1 extension exists.
DO $disable$
BEGIN
 REVOKE EXECUTE ON FUNCTION public.rmg_set_profile_name_v1(text,text,text),public.rmg_admin_set_profile_name_v1(text,text,text,text),public.rmg_profile_names_v1(text,text[]),public.rmg_profile_name_review_v1(text,text),rmg_private.profile_name_review_v1(text,text),public.rmg_own_profile_name_v1(text,text),rmg_private.own_profile_name_v1(text,text),rmg_private.set_profile_name_v1(text,text,text),rmg_private.admin_set_profile_name_v1(text,text,text,text),rmg_private.profile_names_v1(text,text[]) FROM PUBLIC,anon,authenticated;
END
$disable$;
