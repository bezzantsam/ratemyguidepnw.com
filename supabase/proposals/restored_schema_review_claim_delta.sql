-- Delta for the restored RateMyGuidePNW schema (2026-11-13 inventory).
-- Apply to staging with production-equivalent grants and policies before rollout.
begin;

-- Preserve the deployed claim evidence table, moderation routines and views.
create or replace function public.request_guide_claim(
  p_guide_id uuid,
  p_claimant_name text,
  p_business_name text,
  p_public_evidence text
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claim_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sign-in required' using errcode = '28000';
  end if;
  if p_guide_id is null or
    char_length(btrim(coalesce(p_claimant_name, ''))) not between 2 and 100 or
    char_length(btrim(coalesce(p_business_name, ''))) > 120 or
    char_length(btrim(coalesce(p_public_evidence, ''))) not between 8 and 600 then
    raise exception 'Invalid claim request' using errcode = '22023';
  end if;
  if (select count(*) from public.guide_claims
      where claimant_id = v_user_id and created_at >= now() - interval '24 hours') >= 3 then
    raise exception 'Request limit reached' using errcode = '22023';
  end if;

  insert into public.guide_claims (guide_id, claimant_id)
  values (p_guide_id, v_user_id)
  returning id into v_claim_id;

  insert into public.claim_evidence
    (claim_id, claimant_name, business_name, public_evidence)
  values
    (v_claim_id, btrim(p_claimant_name), btrim(coalesce(p_business_name, '')),
     btrim(p_public_evidence));
  return v_claim_id;
end;
$$;
-- Newly defined PostgreSQL functions can inherit PUBLIC EXECUTE; always revoke.
revoke all on function public.request_guide_claim(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.request_guide_claim(uuid,text,text,text)
  to authenticated;

alter table public.reviews
  alter column intensity drop not null,
  add column firsthand_attested boolean not null default false,
  drop constraint reviews_body_check,
  add constraint reviews_body_check
    check (char_length(btrim(body)) between 40 and 500) not valid;

-- Replace the deployed permissive insert policy so it cannot bypass attestation.
drop policy submit_pending_review on public.reviews;
create policy submit_pending_review on public.reviews
for insert to authenticated
with check (
  author_id = (select auth.uid()) and status = 'pending'
  and published_at is null and firsthand_attested
  and (trip_month is null or trip_month <= current_date)
  and exists (
    select 1 from public.guides g
    where g.id = reviews.guide_id and g.listing_status = 'published'
  )
  and not exists (
    select 1 from public.guide_claims c
    where c.guide_id = reviews.guide_id and c.claimant_id = (select auth.uid())
      and c.status = 'approved'
  )
);

commit;
