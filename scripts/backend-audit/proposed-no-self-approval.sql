-- REVIEW PROPOSAL ONLY. Not a migration; do not apply to live databases.
-- Keep EXECUTE grants unchanged and require a different administrator for approval.

CREATE OR REPLACE FUNCTION public.admin_decide_review(p_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_state text;begin
if not public.is_site_admin() then raise exception 'Not authorized';end if;
select status into old_state from public.reviews where id=p_id for update;
if old_state is null then raise exception 'Not found';end if;
if old_state<>'pending' then raise exception 'Only pending reviews can be decided';end if;
if p_approve and exists(select 1 from public.reviews where id=p_id and author_id=auth.uid()) then raise exception 'Cannot approve your own submission';end if;
update public.reviews set status=case when p_approve then 'published' else 'rejected' end,published_at=case when p_approve then now() else null end where id=p_id;
insert into public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason) values(auth.uid(),'review',p_id,old_state,case when p_approve then 'published' else 'rejected' end,left(p_reason,500));end$function$;

CREATE OR REPLACE FUNCTION public.admin_decide_claim(p_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_state text;gid uuid;begin
if not public.is_site_admin() then raise exception 'Not authorized';end if;
select status,guide_id into old_state,gid from public.guide_claims where id=p_id for update;
if old_state is null then raise exception 'Not found';end if;
if old_state<>'pending' then raise exception 'Only pending claims can be decided';end if;
if p_approve and exists(select 1 from public.guide_claims where id=p_id and claimant_id=auth.uid()) then raise exception 'Cannot approve your own submission';end if;
if p_approve and exists(select 1 from public.guide_claims where guide_id=gid and status='approved') then raise exception 'A captain is already approved for this listing';end if;
update public.guide_claims set status=case when p_approve then 'approved' else 'denied' end where id=p_id;
insert into public.moderation_audit(actor_id,target_type,target_id,old_status,new_status,reason) values(auth.uid(),'claim',p_id,old_state,case when p_approve then 'approved' else 'denied' end,left(p_reason,500));end$function$;
