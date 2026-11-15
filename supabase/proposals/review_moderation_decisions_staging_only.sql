-- NON-EXECUTABLE PRODUCTION ARTIFACT: staging-only proposal, not migration.
-- Depends on the separately reviewed /supabase/proposals/
-- claim_review_pending_staging_only.sql from #67.
-- No SQL was executed, no account activated, and no one is a moderator by default.
--
-- WARNING: Service-role access must exist ONLY in a secret SERVER environment,
-- not any Next.js client component, NEXT_PUBLIC variable or app bundle.
-- At runtime the server MUST use Supabase Auth getUser(access_token) to derive
-- actor identity, then call this RPC using its own service-role client. Never
-- use an unverified client actor_id or user_metadata as authorization.
--
-- IMPORTANT: This is a reviewable contract, not deployment-ready SQL. Confirm
-- actual policies, grants, function ownership, Postgres version, and migration
-- history in a disposable staging database before ANY execution.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- Moderators can only be enrolled by controlled owner/admin SQL. No public
-- account can insert itself here; user_metadata and ordinary guide claims
-- do not grant moderation. Every moderator starts inactive until approved.
create table private.review_moderators (
  user_id uuid primary key references auth.users(id) on delete restrict,
  active boolean not null default false,
  role text not null default 'review_moderator'
    check(role = 'review_moderator'),
  appointed_at timestamptz not null default now()
);
alter table private.review_moderators enable row level security;
alter table private.review_moderators force row level security;
revoke all on table private.review_moderators
  from public, anon, authenticated, service_role;
grant select on table private.review_moderators to service_role;

-- Private append-only decision ledger. Source author account, review body,
-- evidence and captain contact remain out of the public audit record.
create table private.review_decision_events (
  event_id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete restrict,
  moderator_id uuid not null references auth.users(id) on delete restrict,
  from_status text not null check(from_status = 'pending'),
  to_status text not null check(to_status in ('published','rejected')),
  reason text not null check(char_length(btrim(reason)) between 12 and 500),
  decided_at timestamptz not null default now(),
  unique(review_id)
);
alter table private.review_decision_events enable row level security;
alter table private.review_decision_events force row level security;
revoke all on table private.review_decision_events
  from public, anon, authenticated, service_role;
grant select, insert on table private.review_decision_events to service_role;
-- No UPDATE, DELETE, TRUNCATE, or client-facing SELECT privileges.

-- The only authorized application path for one pending angler review to
-- become published/rejected. The service role itself is privileged, hence
-- live deployment also requires a server-only JWT validation boundary.
-- SECURITY INVOKER limits this function to service_role privileges;
-- nothing is granted to signed-in browser clients.
create or replace function public.decide_angler_review(
  p_review_id uuid,
  p_moderator_id uuid,
  p_decision text,
  p_internal_reason text
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_review public.reviews%rowtype;
  v_decision text;
  v_reason text;
  v_decision_id uuid;
begin
  if p_review_id is null or p_moderator_id is null
     or p_decision is null or p_decision not in ('publish','reject') then
    raise exception 'Invalid moderation decision'
      using errcode='22023';
  end if;
  v_reason:=btrim(coalesce(p_internal_reason,''));
  if char_length(v_reason) not between 12 and 500 then
    raise exception 'A neutral internal reason of 12-500 characters is required'
      using errcode='22023';
  end if;
  if not exists (
    select 1 from private.review_moderators m
     where m.user_id = p_moderator_id
       and m.active is true and m.role='review_moderator'
  ) then
    raise exception 'Moderator authorization denied'
      using errcode='42501';
  end if;

  select * into v_review
    from public.reviews r where r.id=p_review_id
    for update;
  if not found then
    raise exception 'Unknown review' using errcode='P0002';
  end if;
  if v_review.status <> 'pending' then
    raise exception 'Review already decided; refresh the queue'
      using errcode='23505';
  end if;
  if v_review.author_id = p_moderator_id then
    raise exception 'Self-review is prohibited' using errcode='42501';
  end if;
  -- An approved guide owner cannot moderate their own business's reviews.
  -- Paid products and reviewer sentiment NEVER bypass the same rules.
  if exists (
    select 1 from public.guide_claims c
      where c.guide_id = v_review.guide_id
        and c.claimant_id = p_moderator_id
        and c.status='approved'
  ) then
    raise exception 'Conflict of interest: guide owner'
      using errcode='42501';
  end if;

  if p_decision='publish' then
    if v_review.firsthand_attested is not true or
       char_length(btrim(v_review.body)) not between 40 and 500 or
       not exists (
         select 1 from public.guides g
           where g.id=v_review.guide_id
             and g.listing_status='published'
       ) then
      raise exception 'Review not eligible for publication'
        using errcode='22023';
    end if;
  end if;

  update public.reviews
     set status=case when p_decision='publish'
       then 'published' else 'rejected' end,
         published_at=case when p_decision='publish'
       then now() else null end
   where id=p_review_id and status='pending';
  if not found then
    raise exception 'Stale review decision' using errcode='23505';
  end if;

  insert into private.review_decision_events
    (review_id,moderator_id,from_status,to_status,reason)
  values (
    p_review_id,p_moderator_id,'pending',
    case when p_decision='publish' then 'published' else 'rejected' end,
    v_reason
  ) returning event_id into v_decision_id;
  return v_decision_id;
end;
$$;

-- Postgres defaults PUBLIC EXECUTE on new functions. Lock it down
-- explicitly and expose ONLY to the server service role.
revoke all on function public.decide_angler_review(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.decide_angler_review(uuid,uuid,text,text)
  to service_role;

-- Some Supabase projects do not auto-grant service_role privileges.
-- Only the columns needed by this function are needed for UPDATE.
grant select on public.reviews to service_role;
grant update(status,published_at) on public.reviews to service_role;
grant select on public.guide_claims to service_role;
grant select on public.guides to service_role;
-- Existing public.refresh_guide_rating trigger should recalculate the
-- published-only mean after review status changes. Verify in real staging.

commit;
