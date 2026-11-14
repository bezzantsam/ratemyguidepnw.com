-- Stage against the restored schema before enabling the pilot in production.
-- Public slugs follow lib/registry.ts. These are directory records with no ownership verification.
begin;

insert into public.regions (slug, name)
values ('pnw', 'Pacific Northwest')
on conflict (slug) do nothing;

insert into public.jurisdictions (region_id, code, name)
select id, 'US-OR', 'Oregon' from public.regions where slug = 'pnw'
on conflict (region_id, code) do nothing;

insert into public.guides (
  slug, full_name, outfit_name, jurisdiction_id, license_number,
  verification_status, listing_status
)
select pilot.slug, pilot.full_name, pilot.outfit_name, jurisdiction.id,
       pilot.registration, 'listed', 'published'
from (values
  ('og-0000050', 'Shea Fisher', 'The FisherE LLC', 'OG.0000050'),
  ('og-0000316', 'Charles Foster', 'Charlie Foster''s NW Sturgeon Adventures LLC', 'OG.0000316'),
  ('og-0000357', 'Patrick Abel', 'Pat Abel Guide Service', 'OG.0000357'),
  ('og-0000989', 'Lance Fisher', 'Lance Fisher Fishing', 'OG.0000989')
) as pilot(slug, full_name, outfit_name, registration)
cross join public.jurisdictions jurisdiction
join public.regions region on region.id = jurisdiction.region_id
where region.slug = 'pnw' and jurisdiction.code = 'US-OR'
on conflict (slug) do nothing;

commit;
