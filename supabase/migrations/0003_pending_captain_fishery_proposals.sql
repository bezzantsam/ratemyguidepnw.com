-- PROPOSED UNAPPLIED SCHEMA. Never run without hosted-schema diff and JWT/RLS tests.
-- Captain self-reported boats and seasonal trip packages require human review.
-- They cannot edit historical registration data, guide ratings, or public pages.

-- Only reveal approved claims to their own claimant for submit eligibility.
grant select on table public.guide_claims to authenticated;
create policy captain_read_own_approved_claim on public.guide_claims
for select to authenticated
using (claimant_id = (select auth.uid()) and status = 'approved');

-- CHECK validator: all embedded JSON fields are allowlisted server-side.
-- SECURITY INVOKER by default; no privileged public owner-check helper.
create or replace function public.valid_captain_fleet_proposal(
  p_offerings jsonb, p_vessels jsonb
) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  boat jsonb;
  trip jsonb;
  choice jsonb;
  boat_id text;
  pkg_id text;
  boat_label text;
  trip_title text;
  water text;
  launch text;
  signature text;
  specie text;
  service text;
  capacity text;
  month_num integer;
  vessel_ids text[] := array[]::text[];
  package_ids text[] := array[]::text[];
  package_signatures text[] := array[]::text[];
  seen_species text[];
  seen_months integer[];
  seen_services text[];
begin
  if p_vessels is null or jsonb_typeof(p_vessels)<>'array' then return false; end if;
  if jsonb_array_length(p_vessels) not between 1 and 4 then return false; end if;
  if p_offerings is null or jsonb_typeof(p_offerings)<>'array' then return false; end if;
  if jsonb_array_length(p_offerings) not between 1 and 8 then return false; end if;

  -- Fleet first: every package's vessel_id must refer to one of these vessels.
  for boat in select elem from jsonb_array_elements(p_vessels) as x(elem) loop
    if jsonb_typeof(boat)<>'object' then return false; end if;
    if not (boat ?& array['id','label','type','covered','heated','max_anglers','fish_care'])
      or (boat - array['id','label','type','covered','heated','max_anglers','fish_care'])<>'{}'::jsonb
      then return false; end if;
    if jsonb_typeof(boat->'id')<>'string' or
       jsonb_typeof(boat->'label')<>'string' or
       jsonb_typeof(boat->'type')<>'string' or
       jsonb_typeof(boat->'covered')<>'boolean' or
       jsonb_typeof(boat->'heated')<>'boolean' or
       jsonb_typeof(boat->'max_anglers') not in ('number','null') or
       jsonb_typeof(boat->'fish_care')<>'array' then return false; end if;
    boat_id := boat->>'id';
    boat_label := btrim(boat->>'label');
    if boat_id !~ '^v[1-9][0-9]{0,3}$' or boat_id=any(vessel_ids) then return false; end if;
    vessel_ids:=array_append(vessel_ids,boat_id);
    if char_length(boat_label) not between 3 and 80 or
       boat_label ~ '[<>]' or
       boat_label ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}' or
       boat_label ~ '([0-9]{3}[-. ]?){2}[0-9]{4}' then return false; end if;
    if boat->>'type' not in (
      'Sled / jet boat','Ocean charter boat','Drift boat','Raft',
      'Surf-launched dory','Catamaran','Other / varies'
    ) then return false; end if;
    if jsonb_typeof(boat->'max_anglers')='number' then
      capacity:=boat->>'max_anglers';
      if capacity !~ '^([1-9]|[12][0-9]|30)$' then return false; end if;
    end if;
    if jsonb_array_length(boat->'fish_care')>4 then return false; end if;
    seen_services:=array[]::text[];
    for choice in select elem from jsonb_array_elements(boat->'fish_care') as x(elem) loop
      if jsonb_typeof(choice)<>'string' then return false; end if;
      service:=choice #>> '{}';
      if service not in ('Bleeding','Icing','Filleting','Bagging')
        or service=any(seen_services) then return false; end if;
      seen_services:=array_append(seen_services,service);
    end loop;
  end loop;

  for trip in select elem from jsonb_array_elements(p_offerings) as x(elem) loop
    if jsonb_typeof(trip)<>'object' then return false; end if;
    if not (trip ?& array['id','title','waterway','launch_area','species',
                             'months','vessel_id','booking_style','duration'])
       or (trip - array['id','title','waterway','launch_area','species',
                             'months','vessel_id','booking_style','duration'])<>'{}'::jsonb
       then return false; end if;
    if jsonb_typeof(trip->'id')<>'string' or
       jsonb_typeof(trip->'title')<>'string' or
       jsonb_typeof(trip->'waterway')<>'string' or
       jsonb_typeof(trip->'launch_area')<>'string' or
       jsonb_typeof(trip->'species')<>'array' or
       jsonb_typeof(trip->'months')<>'array' or
       jsonb_typeof(trip->'vessel_id')<>'string' or
       jsonb_typeof(trip->'booking_style')<>'string' or
       jsonb_typeof(trip->'duration')<>'string' then return false; end if;
    pkg_id:=trip->>'id';
    if pkg_id !~ '^p[1-9][0-9]{0,3}$' or pkg_id=any(package_ids) then return false; end if;
    package_ids:=array_append(package_ids,pkg_id);
    if not ((trip->>'vessel_id')=any(vessel_ids)) then return false; end if;

    trip_title:=btrim(trip->>'title');
    water:=btrim(trip->>'waterway');
    launch:=btrim(trip->>'launch_area');
    if char_length(trip_title) not between 3 and 80 or
       char_length(water) not between 3 and 80 or
       char_length(launch)>80 or
       (char_length(launch)>0 and char_length(launch)<3)
       then return false; end if;
    if trip_title ~ '[<>]' or water ~ '[<>]' or launch ~ '[<>]' or
       trip_title ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}' or
       water ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}' or
       launch ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}' or
       trip_title ~ '([0-9]{3}[-. ]?){2}[0-9]{4}' or
       water ~ '([0-9]{3}[-. ]?){2}[0-9]{4}' or
       launch ~ '([0-9]{3}[-. ]?){2}[0-9]{4}' then return false; end if;
    signature:=lower(trip_title)||'|'||lower(water);
    if signature=any(package_signatures) then return false; end if;
    package_signatures:=array_append(package_signatures,signature);

    if trip->>'booking_style' not in ('call_to_confirm','per_seat','private_boat','both')
       or trip->>'duration' not in ('unspecified','half_day','full_day','multi_day')
      then return false; end if;
    if jsonb_array_length(trip->'species') not between 1 and 8 then return false; end if;
    seen_species:=array[]::text[];
    for choice in select elem from jsonb_array_elements(trip->'species') as x(elem) loop
      if jsonb_typeof(choice)<>'string' then return false; end if;
      specie:=choice #>> '{}';
      if specie not in ('Chinook','Coho','Steelhead','Sturgeon','Albacore',
                        'Bottomfish','Halibut','Walleye','Shad','Crab','Bass','Other')
         or specie=any(seen_species) then return false; end if;
      seen_species:=array_append(seen_species,specie);
    end loop;
    if jsonb_array_length(trip->'months') not between 1 and 12 then return false; end if;
    seen_months:=array[]::integer[];
    for choice in select elem from jsonb_array_elements(trip->'months') as x(elem) loop
      if jsonb_typeof(choice)<>'number' or choice::text !~ '^(1[0-2]|[1-9])$'
        then return false; end if;
      month_num:=(choice::text)::integer;
      if month_num=any(seen_months) then return false; end if;
      seen_months:=array_append(seen_months,month_num);
    end loop;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;
revoke all on function public.valid_captain_fleet_proposal(jsonb,jsonb) from public,anon;
grant execute on function public.valid_captain_fleet_proposal(jsonb,jsonb) to authenticated;
-- Protected moderator tooling also needs to validate checked rows.
grant execute on function public.valid_captain_fleet_proposal(jsonb,jsonb) to service_role;

create table public.guide_fishery_proposals (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  vessels jsonb not null,
  offerings jsonb not null,
  review_state text not null default 'pending'
    check(review_state in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint valid_structured_captain_fleet
    check(public.valid_captain_fleet_proposal(offerings,vessels)),
  constraint pending_has_no_review_time
    check(review_state<>'pending' or reviewed_at is null)
);
create unique index one_pending_fishery_proposal_per_owner_and_guide
  on public.guide_fishery_proposals(guide_id,submitted_by)
  where review_state='pending';

alter table public.guide_fishery_proposals enable row level security;
alter table public.guide_fishery_proposals force row level security;
revoke all on table public.guide_fishery_proposals from public,anon,authenticated;
grant select on table public.guide_fishery_proposals to authenticated;
-- INSERT cannot set review_state, created_at or reviewed_at: database owns them.
grant insert (guide_id,submitted_by,vessels,offerings)
  on table public.guide_fishery_proposals to authenticated;

create policy captain_read_own_fishery_proposals on public.guide_fishery_proposals
for select to authenticated
using (submitted_by=(select auth.uid()));

create policy verified_owner_can_propose_fisheries on public.guide_fishery_proposals
for insert to authenticated
with check (
  submitted_by=(select auth.uid()) and review_state='pending'
  and reviewed_at is null
  and exists (
    select 1 from public.guide_claims c
    where c.guide_id=guide_fishery_proposals.guide_id
      and c.claimant_id=(select auth.uid())
      and c.status='approved'
  )
);

-- No UPDATE/DELETE grants or policies. No public SELECT, no publishing trigger.
-- No auto-publication: even a future 'approved' review_state cannot appear in
-- the directory without a separate, authenticated human moderation workflow.
-- Human reviewer permissions and a read-only public publication layer NOT included.
