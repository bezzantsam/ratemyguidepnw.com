-- Runner-managed emergency disable; preserve review flags and audit rows.
REVOKE EXECUTE ON FUNCTION public.rmg_report_review(text,text,uuid,text),public.rmg_report_queue(integer,integer),public.rmg_resolve_report(uuid),rmg_private.report_review(text,text,uuid,text),rmg_private.report_queue(integer,integer),rmg_private.resolve_report(uuid) FROM PUBLIC,anon,authenticated;
