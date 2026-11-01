-- Pre-launch schema scaffold. Review security before production.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create table public.regions (id uuid primary key default gen_random_uuid(),slug text not null unique,name text not null,is_active boolean not null default true);
create table public.jurisdictions (id uuid primary key default gen_random_uuid(),region_id uuid not null references public.regions(id),code text not null,name text not null,unique(region_id,code));
create table public.waterways (id uuid primary key default gen_random_uuid(),region_id uuid not null references public.regions(id),slug text not null unique,name text not null,description text,is_published boolean not null default false);
create table public.species (id uuid primary key default gen_random_uuid(),slug text not null unique,common_name text not null);
create table public.guides (
 id uuid primary key default gen_random_uuid(),slug text not null unique,full_name text not null,outfit_name text,
 jurisdiction_id uuid references public.jurisdictions(id),license_number text,
 verification_status text not null default 'listed' check(verification_status in ('listed','pending','verified')),
 listing_status text not null default 'draft' check(listing_status in ('draft','published','suspended')),
 website_url text,average_quality numeric(3,2),would_book_again_pct numeric(5,2),
 review_count integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index guides_name_trgm on public.guides using gin(full_name gin_trgm_ops);
create index guides_outfit_trgm on public.guides using gin(outfit_name gin_trgm_ops);
create table public.guide_waterways (guide_id uuid not null references public.guides(id) on delete cascade,waterway_id uuid not null references public.waterways(id),primary key(guide_id,waterway_id));
create table public.guide_species (guide_id uuid not null references public.guides(id) on delete cascade,species_id uuid not null references public.species(id),primary key(guide_id,species_id));
create table public.guide_claims (
 id uuid primary key default gen_random_uuid(),guide_id uuid not null references public.guides(id),
 claimant_id uuid not null references auth.users(id),status text not null default 'pending' check(status in ('pending','approved','denied')),
 created_at timestamptz not null default now(),unique(guide_id,claimant_id)
);
create table public.reviews (
 id uuid primary key default gen_random_uuid(),guide_id uuid not null references public.guides(id),
 author_id uuid not null references auth.users(id),waterway_id uuid references public.waterways(id),species_id uuid references public.species(id),
 quality smallint not null check(quality between 1 and 5),intensity smallint not null check(intensity between 1 and 5),
 would_book_again boolean not null,catch_outcome text check(catch_outcome in ('limited','caught','slow','not_disclosed')),
 body text not null check(char_length(body) between 20 and 500),
 status text not null default 'pending' check(status in ('pending','published','rejected','removed')),
 trip_month date,created_at timestamptz not null default now(),published_at timestamptz,
 constraint published_requires_date check(status <> 'published' or published_at is not null)
);
create index published_reviews_by_guide on public.reviews(guide_id,published_at desc) where status='published';
create table public.review_flags (
 id uuid primary key default gen_random_uuid(),review_id uuid not null references public.reviews(id),
 reporter_id uuid not null references auth.users(id),reason text not null,created_at timestamptz not null default now(),
 unique(review_id,reporter_id)
);
create table public.guide_replies (
 id uuid primary key default gen_random_uuid(),review_id uuid not null unique references public.reviews(id),
 guide_id uuid not null references public.guides(id),author_id uuid not null references auth.users(id),
 body text not null check(char_length(body) between 10 and 1000),
 status text not null default 'pending' check(status in ('pending','published','removed')),
 created_at timestamptz not null default now()
);
create table public.moderation_events (
 id uuid primary key default gen_random_uuid(),review_id uuid references public.reviews(id),
 actor_id uuid references auth.users(id),action text not null,notes text,created_at timestamptz not null default now()
);
-- Public read-only policies: no client-side write permissions.
alter table public.regions enable row level security;
alter table public.jurisdictions enable row level security;
alter table public.waterways enable row level security;
alter table public.species enable row level security;
alter table public.guides enable row level security;
alter table public.guide_waterways enable row level security;
alter table public.guide_species enable row level security;
alter table public.guide_claims enable row level security;
alter table public.reviews enable row level security;
alter table public.review_flags enable row level security;
alter table public.guide_replies enable row level security;
alter table public.moderation_events enable row level security;
create policy public_regions on public.regions for select using(is_active);
create policy public_waterways on public.waterways for select using(is_published);
create policy public_species on public.species for select using(true);
create policy public_guides on public.guides for select using(listing_status='published');
create policy public_guide_waterways on public.guide_waterways for select using(exists(select 1 from public.guides g where g.id=guide_id and g.listing_status='published'));
create policy public_guide_species on public.guide_species for select using(exists(select 1 from public.guides g where g.id=guide_id and g.listing_status='published'));
create policy public_reviews on public.reviews for select using(status='published');
create policy public_guide_replies on public.guide_replies for select using(status='published');
-- The identities, flags, claims and moderation events remain private.
create or replace function public.refresh_guide_rating(p_guide_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.guides g set
 average_quality=(select round(avg(r.quality)::numeric,2) from public.reviews r where r.guide_id=p_guide_id and r.status='published'),
 would_book_again_pct=(select round(100.0*avg((r.would_book_again)::int),2) from public.reviews r where r.guide_id=p_guide_id and r.status='published'),
 review_count=(select count(*) from public.reviews r where r.guide_id=p_guide_id and r.status='published'),
 updated_at=now()
 where g.id=p_guide_id;
end $$;
revoke all on function public.refresh_guide_rating(uuid) from public,anon,authenticated;
create or replace function public.reviews_rating_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  perform public.refresh_guide_rating(old.guide_id);return old;
 end if;
 if tg_op='UPDATE' and old.guide_id is distinct from new.guide_id then
  perform public.refresh_guide_rating(old.guide_id);
 end if;
 perform public.refresh_guide_rating(new.guide_id);return new;
end $$;
create trigger trg_reviews_rating after insert or update of quality,would_book_again,status,guide_id or delete on public.reviews
for each row execute function public.reviews_rating_trigger();
