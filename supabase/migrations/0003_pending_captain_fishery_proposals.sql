-- Proposed SQL ONLY. Do NOT apply before deployed schema and RLS review.
-- Captain-submitted offerings are private and unapproved. No auto-publication.
-- Avoid SECURITY DEFINER: safely expose only the signed-in claimant's own
-- approved guide claim through a narrow SELECT policy on the existing table.
grant select on table public.guide_claims to authenticated;
create policy captain_read_own_approved_claim on public.guide_claims
for select to authenticated
using (claimant_id = (select auth.uid()) and status = 'approved');

-- Defense in depth: PostgREST clients can bypass browser validation, so validate
-- every nested field on the database side too.
create or replace function public.valid_captain_fishery_proposal(
  p_offerings jsonb, p_vessel jsonb, p_booking_style text
) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  offer jsonb;
  value jsonb;
  water text;
  launch text;
  specie text;
  service text;
  seen text[] := array[]::text[];
  observed_species text[];
  observed_months integer[];
  observed_care text[];
  m integer;
  n integer;
begin
  if p_offerings is null or jsonb_typeof(p_offerings) <> 'array' then return false; end if;
  if jsonb_array_length(p_offerings) not between 1 and 8 then return false; end if;
  if p_booking_style not in ('call_to_confirm','per_seat','private_boat','both') then return false; end if;

  for offer in select elem from jsonb_array_elements(p_offerings) as x(elem) loop
    if jsonb_typeof(offer) <> 'object' then return false; end if;
    if not (offer ?& array['waterway','launch_area','species','months']) then return false; end if;
    if (offer - array['waterway','launch_area','species','months']) <> '{}'::jsonb then return false; end if;
    if jsonb_typeof(offer->'waterway') <> 'string' or
       jsonb_typeof(offer->'launch_area') <> 'string' or
       jsonb_typeof(offer->'species') <> 'array' or
       jsonb_typeof(offer->'months') <> 'array' then return false; end if;
    water := btrim(offer->>'waterway');
    launch := btrim(offer->>'launch_area');
    if char_length(water) not between 3 and 80 or
       char_length(launch) > 80 or (char_length(launch)>0 and char_length(launch)<3)
       or water ~ '[<>]' or launch ~ '[<>]' or
       water ~ '([0-9]{3}[-. ]?){2}[0-9]{4}' or launch ~ '([0-9]{3}[-. ]?){2}[0-9]{4}' or
       water ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}' or
       launch ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}' then return false; end if;
    if lower(water) = any(seen) then return false; end if;
    seen := array_append(seen,lower(water));

    if jsonb_array_length(offer->'species') not between 1 and 8 then return false; end if;
    observed_species := array[]::text[];
    for value in select elem from jsonb_array_elements(offer->'species') as x(elem) loop
      if jsonb_typeof(value) <> 'string' then return false; end if;
      specie := value #>> '{}';
      if specie not in ('Chinook','Coho','Steelhead','Sturgeon','Albacore',
                        'Bottomfish','Halibut','Walleye','Shad','Crab','Bass','Other')
         or specie = any(observed_species) then return false; end if;
      observed_species := array_append(observed_species,specie);
    end loop;

    if jsonb_array_length(offer->'months') not between 1 and 12 then return false; end if;
    observed_months := array[]::integer[];
    for value in select elem from jsonb_array_elements(offer->'months') as x(elem) loop
      if jsonb_typeof(value) <> 'number' or value::text !~ '^(1[0-2]|[1-9])$' then return false; end if;
      m := (value::text)::integer;
      if m = any(observed_months) then return false; end if;
      observed_months := array_append(observed_months,m);
    end loop;
  end loop;

  if p_vessel is null or jsonb_typeof(p_vessel) <> 'object' then return false; end if;
  if not (p_vessel ?& array['type','covered','heated','max_anglers','fish_care']) then return false; end if;
  if (p_vessel - array['type','covered','heated','max_anglers','fish_care']) <> '{}'::jsonb then return false; end if;
  if p_vessel->>'type' not in ('Sled / jet boat','Ocean charter boat','Drift boat','Raft',
       'Surf-launched dory','Catamaran','Other / varies') then return false; end if;
  if jsonb_typeof(p_vessel->'covered') <> 'boolean' or
     jsonb_typeof(p_vessel->'heated') <> 'boolean' then return false; end if;
  if jsonb_typeof(p_vessel->'max_anglers') not in ('null','number') then return false; end if;
  if jsonb_typeof(p_vessel->'max_anglers') = 'number' then
    if (p_vessel->>'max_anglers') !~ '^([1-9]|[12][0-9]|30)$' then return false; end if;
  end if;
  if jsonb_typeof(p_vessel->'fish_care') <> 'array' then return false; end if;
  if jsonb_array_length(p_vessel->'fish_care') > 4 then return false; end if;
  observed_care := array[]::text[];
  for value in select elem from jsonb_array_elements(p_vessel->'fish_care') as x(elem) loop
    if jsonb_typeof(value) <> 'string' then return false; end if;
    service := value #>> '{}';
    if service not in ('Bleeding','Icing','Filleting','Bagging') or service = any(observed_care)
      then return false; end if;
    observed_care := array_append(observed_care,service);
  end loop;
  return true;
exception when others then
  return false;
end;
$$;
revoke all on function public.valid_captain_fishery_proposal(jsonb,jsonb,text) from public;
grant execute on function public.valid_captain_fishery_proposal(jsonb,jsonb,text) to authenticated;

create table public.guide_fishery_proposals (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  offerings jsonb not null,
  vessel jsonb not null,
  booking_style text not null,
  review_state text not null default 'pending' check(review_state in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint valid_structured_fishery_details
    check(public.valid_captain_fishery_proposal(offerings,vessel,booking_style)),
  constraint pending_has_no_review_time
    check(review_state <> 'pending' or reviewed_at is null)
);
create unique index one_pending_fishery_proposal_per_owner_and_guide
  on public.guide_fishery_proposals(guide_id,submitted_by)
  where review_state='pending';

alter table public.guide_fishery_proposals enable row level security;
revoke all on table public.guide_fishery_proposals from public,anon,authenticated;
grant select,insert on table public.guide_fishery_proposals to authenticated;

-- An authenticated account can inspect only its own submissions.
create policy captain_read_own_fishery_proposals on public.guide_fishery_proposals
for select to authenticated
using (submitted_by = (select auth.uid()));

-- Identity *and* captain ownership approval must precede any insert.
-- Database clients cannot mark themselves reviewed, approved, or published.
create policy verified_owner_can_propose_fisheries on public.guide_fishery_proposals
for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and review_state = 'pending'
  and reviewed_at is null
  and exists (
    select 1 from public.guide_claims c
    where c.guide_id = guide_fishery_proposals.guide_id
      and c.claimant_id = (select auth.uid())
      and c.status = 'approved'
  )
);

-- No UPDATE/DELETE policies or grants for authenticated clients.
-- An independent administrative workflow using a protected service role must
-- review and explicitly copy APPROVED public fields into a separate publication
-- layer. Approval by itself does NOT automatically publish these proposals.
-- Do not use this table in public guide pages or directory filtering.
