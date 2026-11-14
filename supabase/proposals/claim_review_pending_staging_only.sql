-- ============================================================================
-- STAGING DESIGN DRAFT, NEVER AUTOMATICALLY APPLY OR REPLAY ON PRODUCTION.
-- Current Supabase RateMyGuidePNW project is INACTIVE; actual schema unknown.
-- This file deliberately lives under supabase/proposals, NOT migrations/.
--
-- Designed ONLY as a review candidate for an isolated Postgres 15+ Supabase
-- STAGING DB created from a reviewed 0001-compatible schema. Reconcile live
-- columns/grants/policies and actual migration history before any execution.
-- Requires auth.uid() supplied by a real authenticated JWT at release time.
--
-- NO moderation-approval function, public edit endpoint, media publication
-- policy, booking verification or paid ranking is created by this script.
-- ============================================================================
begin;

-- Claim evidence is privately attached to one atomic request. It must NEVER
-- appear on the public directory, through a review view, or to another captain.
create table public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references public.guide_claims(id) on delete cascade,
  claimant_name text not null check (char_length(btrim(claimant_name)) between 2 and 100),
  business_name text not null default '' check (char_length(btrim(business_name)) <= 120),
  public_evidence text not null check (char_length(btrim(public_evidence)) between 8 and 600),
  created_at timestamptz not null default now()
);

alter table public.guide_claims enable row level security;
alter table public.guide_claims force row level security;
alter table public.claim_evidence enable row level security;
alter table public.claim_evidence force row level security;

revoke all on table public.guide_claims from public, anon, authenticated;
revoke all on table public.claim_evidence from public, anon, authenticated;

-- A claimant can see the request status, but never approve or rewrite it.
grant select (id, guide_id, claimant_id, status, created_at)
  on table public.guide_claims to authenticated;
grant insert (guide_id, claimant_id)
  on table public.guide_claims to authenticated;

-- Only input columns can be written; id, created_at, approval state remain
-- database-owned. The evidence table has NO public or user SELECT permission.
grant insert (claim_id, claimant_name, business_name, public_evidence)
  on table public.claim_evidence to authenticated;

create policy claim_read_own_private_status
  on public.guide_claims for select to authenticated
  using (claimant_id = (select auth.uid()));

create policy claim_insert_pending_self
  on public.guide_claims for insert to authenticated
  with check (
    claimant_id = (select auth.uid()) and status = 'pending' and
    exists(
      select 1 from public.guides g
      where g.id = guide_id and g.listing_status = 'published'
    )
  );

create policy claim_evidence_insert_own_pending_only
  on public.claim_evidence for insert to authenticated
  with check (
    exists(
      select 1 from public.guide_claims c
      where c.id = claim_id
        and c.claimant_id = (select auth.uid())
        and c.status = 'pending'
    )
  );

-- Single transaction. SECURITY INVOKER intentionally keeps RLS/grants intact.
-- No moderator grant; anybody who can call this must be a signed-in user.
-- One claim plus its evidence succeeds together, or neither write commits.
-- Own-claim per-day rate limit is a supplemental guard, not a complete
-- bot-prevention system; API throttling is still a release prerequisite.
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

-- Review source columns in the 0001 scaffold are insufficient for the
-- actual client. A fully truthful first-hand review must not make up an
-- "intensity=3" response the person never provided. Preserve any historic
-- intensity values, but allow future reviewers to omit the old field.
alter table public.reviews alter column intensity drop not null;
alter table public.reviews add column communication smallint check (communication between 1 and 5);
alter table public.reviews add column safety smallint check (safety between 1 and 5);
alter table public.reviews add column effort smallint check (effort between 1 and 5);
alter table public.reviews add column equipment smallint check (equipment between 1 and 5);
alter table public.reviews add column professionalism smallint check (professionalism between 1 and 5);
alter table public.reviews add column knowledge smallint check (knowledge between 1 and 5);
alter table public.reviews add column value_rating smallint check (value_rating between 1 and 5);
alter table public.reviews add column trip_context text
  check (char_length(trip_context) <= 140);
alter table public.reviews add column firsthand_attested boolean not null default false;

-- Older legacy rows might have shorter text, so NOT VALID guards all NEW rows
-- without silently rewriting or deleting historical data. Review and validate
-- any old rows separately before full enforcement.
alter table public.reviews add constraint review_firsthand_story_length_v1
  check (char_length(btrim(body)) between 40 and 500) not valid;

alter table public.reviews enable row level security;
alter table public.reviews force row level security;

revoke all on table public.reviews from public, anon, authenticated;
-- Direct reader sees published-only RLS rows and only these public fields.
-- No SELECT grant for author_id, exact submitted trip_month or evidence.
grant select (
  id, guide_id, quality, would_book_again, body, status, published_at,
  communication, safety, effort, equipment, professionalism,
  knowledge, value_rating, trip_context
) on public.reviews to anon, authenticated;

-- Browser can submit a signed-in, first-hand PENDING review, nothing more.
-- No INSERT grant for status, published_at, created_at, id, or hidden attributes.
grant insert (
  guide_id, author_id, quality, would_book_again, catch_outcome,
  body, trip_month, trip_context, communication, safety, effort,
  equipment, professionalism, knowledge, value_rating, firsthand_attested
) on public.reviews to authenticated;

create policy authenticated_firsthand_review_pending
  on public.reviews for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and firsthand_attested is true
    and status = 'pending'
    and published_at is null
    and char_length(btrim(body)) between 40 and 500
    and (trip_month is null or trip_month <= current_date)
    and not exists (
      select 1 from public.guide_claims c
      where c.guide_id = reviews.guide_id and
        c.claimant_id = (select auth.uid()) and
        c.status = 'approved'
    )
    and exists(
      select 1 from public.guides g
      where g.id=reviews.guide_id and g.listing_status='published'
    )
  );

-- Revoke the older broad published-only policy and require that the GUIDE
-- itself remain published. Otherwise direct Data API reads could disclose
-- a review for a now-suspended guide even when the public view hides it.
drop policy if exists public_reviews on public.reviews;
create policy public_reviews_visible_only
  on public.reviews for select to anon, authenticated
  using (
    status = 'published'
    and published_at is not null
    and exists(
      select 1 from public.guides g
      where g.id = reviews.guide_id and g.listing_status = 'published'
    )
  );

-- Public published-only view; explicit column list excludes account IDs,
-- private claims/evidence, unmoderated body text, and moderator notes.
-- SECURITY INVOKER ensures underlying tables' RLS and grants apply.
create view public.public_angler_reviews
with (security_invoker = true)
as select
  r.id, r.guide_id, r.body, r.quality, r.published_at,
  r.would_book_again, r.communication, r.professionalism,
  r.safety, r.equipment, r.knowledge, r.effort,
  r.value_rating, r.trip_context
from public.reviews r
join public.guides g on g.id = r.guide_id
where r.status = 'published'
  and r.published_at is not null
  and g.listing_status = 'published';

revoke all on table public.public_angler_reviews from public, anon, authenticated;
grant select on public.public_angler_reviews to anon, authenticated;
-- Underlying guide columns are needed for invoker-view predicate checks.
grant select (id, listing_status) on public.guides to anon, authenticated;

-- No UPDATE or DELETE grants on claims, evidence or reviews, no moderator
-- approval API, no direct published-data mutation or public private evidence.
commit;
