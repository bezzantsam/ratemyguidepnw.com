#!/usr/bin/env python3
"""Print an aggregate-only read query, never backend identities or user rows."""
import json
import pathlib
import re

root = pathlib.Path(__file__).resolve().parents[2]
oregon = [r['registration'] for r in json.loads((root/'lib/oregon-guides.json').read_text())]
washington = list(json.loads((root/'lib/washington-stable-ids.json').read_text()).values())
for values, pattern in ((oregon, r'OG\.[A-Z0-9.&]+'), (washington, r'wa-\d+')):
    if len(values) != len(set(values)) or not all(isinstance(v,str) and re.fullmatch(pattern,v) for v in values):
        raise SystemExit('Invalid or duplicate directory identifiers; no SQL generated')
def array(values):
    return ','.join("'" + v + "'" for v in values)
print(f'''WITH source(state,directory_id) AS (
 SELECT 'OR',unnest(ARRAY[{array(oregon)}]::text[])
 UNION ALL SELECT 'WA',unnest(ARRAY[{array(washington)}]::text[])
), matches AS (
 SELECT s.state,s.directory_id,count(g.id) AS n,
 count(g.id) FILTER (WHERE s.state='OR' AND g.license_number=s.directory_id) AS exact_registration,
 count(g.id) FILTER (WHERE g.jurisdiction_id IS NULL) AS missing_jurisdiction,
 count(g.id) FILTER (WHERE (s.state='OR' AND g.license_number IS DISTINCT FROM s.directory_id) OR (s.state='WA' AND g.license_number LIKE 'OG.%')) AS conflicting
 FROM source s LEFT JOIN public.guides g ON g.slug=CASE WHEN s.state='OR' THEN lower(regexp_replace(s.directory_id,'[^a-zA-Z0-9]+','-','g')) ELSE s.directory_id END
 GROUP BY 1,2
)
SELECT state,count(*) AS source_ids,count(*) FILTER (WHERE n=0) AS missing,
 count(*) FILTER (WHERE n>1) AS ambiguous,count(*) FILTER (WHERE n=1) AS slug_match,
 count(*) FILTER (WHERE exact_registration=1) AS registration_match,
 count(*) FILTER (WHERE missing_jurisdiction>0) AS jurisdiction_unverified,
 count(*) FILTER (WHERE conflicting>0) AS conflicting
FROM matches GROUP BY state ORDER BY state;''')
