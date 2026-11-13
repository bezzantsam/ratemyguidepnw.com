import rawRelease from './chinook-public-release.json';

/**
 * PUBLIC-SAFE RELEASE CONTRACT.
 *
 * The private Chrome-AI repo and Supabase archive must never be queried by a
 * public website. This is a reviewed, checked-in methodology release only.
 * When independently verified 2027 outcomes exist, a separate code review
 * must explicitly enable publication; nobody can turn on private metrics by
 * accidentally editing a JSON field.
 */
export type ChinookPublicRelease = {
  schema_version: number;
  fishery: string;
  species: string;
  project: string;
  publication_status: 'methodology_only';
  released_on: string;
  target: string;
  target_unit: string;
  training_period: string;
  prospective_evaluation: {
    season: string;
    predeclared_horizon_days: number;
    status: 'awaiting_official_2027_results';
    verified_outcome_days: number;
    verified_model_mae: null;
    verified_baseline_mae: null;
  };
  release_approval: {
    independent_outcome_review: false;
    regulations_verified: false;
    approved_for_public_skill_claims: false;
  };
  source_links: {
    wdfw_creel: string;
    noaa_astoria_tides: string;
  };
  observations: [];
};

export function assertSafeChinookRelease(value: unknown): asserts value is ChinookPublicRelease {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Unrecognized public Chinook release');
  }
  const r = value as Record<string, unknown>;
  const e = r.prospective_evaluation as Record<string, unknown> | undefined;
  const a = r.release_approval as Record<string, unknown> | undefined;
  const links = r.source_links as Record<string, unknown> | undefined;
  const permitted = [
    'schema_version', 'fishery', 'species', 'project', 'publication_status',
    'released_on', 'target', 'target_unit', 'training_period',
    'prospective_evaluation', 'release_approval', 'source_links', 'observations'
  ];
  if (
    Object.keys(r).some(key => !permitted.includes(key)) ||
    r.schema_version !== 1 ||
    r.species !== 'Chinook' ||
    r.project !== 'Chrome-AI' ||
    r.publication_status !== 'methodology_only' ||
    r.target !== 'WDFW creel-sampled retained Chinook per sampled angler' ||
    !e || e.predeclared_horizon_days !== 7 ||
    e.season !== 'August 2027' ||
    e.status !== 'awaiting_official_2027_results' ||
    e.verified_outcome_days !== 0 ||
    e.verified_model_mae !== null ||
    e.verified_baseline_mae !== null ||
    !a || a.independent_outcome_review !== false ||
    a.regulations_verified !== false ||
    a.approved_for_public_skill_claims !== false ||
    !links || links.wdfw_creel !== 'https://wdfw.wa.gov/fishing/reports/creel/buoy10' ||
    links.noaa_astoria_tides !== 'https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=9439040' ||
    !Array.isArray(r.observations) || r.observations.length !== 0
  ) {
    throw new Error('Public Chinook release not reviewed for publication');
  }
}

assertSafeChinookRelease(rawRelease);

/** No secrets, raw files, identifiable customer data, or unapproved model predictions. */
export const chinookRelease: ChinookPublicRelease = rawRelease;
