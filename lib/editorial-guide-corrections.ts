import corrections from './editorial-guide-corrections.json';

/** User-supplied editorial corrections are search inputs, not operator claims or identity links. */
type EditorialCorrection = {
  guide_id: string;
  expected_name: string;
  expected_business: string;
  kind: 'species' | 'method' | 'search_alias';
  value: string;
  search_variants?: string[];
  status: 'approved';
  provenance: {type: 'user_editorial'; attributed_to: string; recorded_on: string; reference: string};
};
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);

/** Bind an approved correction to the exact original source record; fail closed on malformed provenance. */
export function editorialGuideCorrections(guide: {id:string; name:string; business:string|null}, input: unknown = corrections): EditorialCorrection[] {
  if (!Array.isArray(input)) return [];
  return input.filter((record): record is EditorialCorrection => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    const x = record as Record<string, unknown>;
    if (x.guide_id !== guide.id || x.expected_name !== guide.name || x.expected_business !== guide.business ||
        (x.kind !== 'species' && x.kind !== 'method' && x.kind !== 'search_alias') || !text(x.value) || x.status !== 'approved') return false;
    if (x.search_variants !== undefined && (x.kind !== 'search_alias' ||
        !Array.isArray(x.search_variants) || !x.search_variants.every(text))) return false;
    if (!x.provenance || typeof x.provenance !== 'object' || Array.isArray(x.provenance)) return false;
    const p = x.provenance as Record<string, unknown>;
    if (p.type !== 'user_editorial' || !text(p.attributed_to) || !text(p.reference) || !text(p.recorded_on) || !/^\d{4}-\d{2}-\d{2}$/.test(p.recorded_on)) return false;
    const date = new Date(p.recorded_on + 'T00:00:00Z');
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== p.recorded_on || p.recorded_on > new Date().toISOString().slice(0, 10)) return false;
    if (p.reference === '/sources/guide-fishery-editorial-20261119.html#' + guide.id.toLowerCase().replace('.', '-')) return true;
    try {
      const reference = new URL(p.reference);
      return reference.protocol === 'https:' && reference.hostname === 'github.com' && !reference.username && !reference.password;
    } catch { return false; }
  });
}
