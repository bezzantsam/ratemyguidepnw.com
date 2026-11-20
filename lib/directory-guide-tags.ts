import publishedTags from './directory-guide-tags.json';

type GuideTag = {
  guide_id: string;
  expected_name: string;
  expected_business: string | null;
  kind: 'species' | 'method' | 'search_alias' | 'business_search_keyword';
  value: string;
  search_variants?: string[];
  status: 'approved';
};

const publicFields = new Set(['guide_id','expected_name','expected_business','kind','value','search_variants','status']);
const tagKinds = new Set(['species','method','search_alias','business_search_keyword']);
function validLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Only approved, public labels for the exact registry listing. */
export function guideTagsFor(guide: {id:string; name:string; business:string|null}, input: unknown = publishedTags): GuideTag[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is GuideTag => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    if (!Object.keys(row).every(key => publicFields.has(key)) ||
        row.guide_id !== guide.id || row.expected_name !== guide.name || row.expected_business !== guide.business ||
        row.status !== 'approved' || typeof row.kind !== 'string' || !tagKinds.has(row.kind) || !validLabel(row.value)) return false;
    if (row.kind !== 'business_search_keyword') return row.search_variants === undefined;
    return validLabel(row.expected_business) && (row.search_variants === undefined ||
      (Array.isArray(row.search_variants) && row.search_variants.every(validLabel)));
  });
}
