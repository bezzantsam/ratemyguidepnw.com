import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const release = JSON.parse(readFileSync(join(process.cwd(), 'lib/chinook-public-release.json'), 'utf8'));

test('only Buoy 10 Chinook is exposed on the public research route', () => {
  assert.equal(release.schema_version, 1);
  assert.equal(release.species, 'Chinook');
  assert.equal(release.publication_status, 'methodology_only');
  assert.equal(release.target, 'WDFW creel-sampled retained Chinook per sampled angler');
  assert.equal(release.prospective_evaluation.predeclared_horizon_days, 7);
  assert.equal(release.prospective_evaluation.season, 'August 2027');
});

test('no future forecast or invented prospective performance escapes private Chrome-AI', () => {
  assert.equal(release.prospective_evaluation.verified_model_mae, null);
  assert.equal(release.prospective_evaluation.verified_baseline_mae, null);
  assert.equal(release.prospective_evaluation.verified_outcome_days, 0);
  assert.equal(release.release_approval.approved_for_public_skill_claims, false);
  assert.equal(release.release_approval.independent_outcome_review, false);
  assert.equal(release.release_approval.regulations_verified, false);
  assert.deepEqual(release.observations, []);
  const content = JSON.stringify(release);
  assert.equal(/(?:postgresql:\/\/|password|service_role|CHROME_AI_FORECAST_DATABASE_URL)/i.test(content), false);
});

test('historical sample is complete, reproducible and explicitly preliminary', () => {
  const sample = release.historical_sample;
  assert.equal(sample.year, 2026);
  assert.equal(sample.source_updated, '2026-10-01');
  assert.equal(sample.dataset_status, 'agency_preliminary');
  assert.deepEqual(sample.rows, [
    {date:'2026-08-01',boats:53,anglers:166,chinook_kept:38},
    {date:'2026-08-02',boats:59,anglers:174,chinook_kept:25},
    {date:'2026-08-03',boats:37,anglers:109,chinook_kept:19},
    {date:'2026-08-04',boats:92,anglers:253,chinook_kept:90},
    {date:'2026-08-05',boats:35,anglers:104,chinook_kept:45},
  ]);
  assert.equal(sample.rows.reduce((sum, row) => sum + row.anglers, 0), 806);
  assert.equal(sample.rows.reduce((sum, row) => sum + row.chinook_kept, 0), 217);
  assert.ok(sample.scope.includes('not the full fishery'));
});

test('source URLs stay on the original WDFW and NOAA government domains', () => {
  assert.equal(new URL(release.source_links.wdfw_creel).hostname, 'wdfw.wa.gov');
  assert.equal(new URL(release.source_links.noaa_astoria_tides).hostname, 'tidesandcurrents.noaa.gov');
});

test('public site does not embed the private Chrome-AI credential or server-side database URL', () => {
  const page = readFileSync('app/intel/buoy-10-chinook/page.tsx', 'utf8');
  const publicData = readFileSync('lib/chinook-intel.ts', 'utf8');
  const chart = readFileSync('components/ChinookSampleChart.tsx', 'utf8');
  for (const content of [page, publicData, chart]) {
    assert.equal(content.includes('CHROME_AI_FORECAST_DATABASE_URL'), false);
    assert.equal(content.includes('createClient('), false);
    assert.equal(content.includes('service_role'), false);
  }
  assert.match(page, /lowerColumbiaGuides/);
  assert.match(page, /getDirectoryEntry|directoryEntries/);
  assert.match(page, /ChinookSampleChart/);
});


test('review-queue candidates only render after deliberate production-main merge', () => {
  const guard = readFileSync('lib/chinook-reviewed-history.ts', 'utf8');
  const component = readFileSync('components/Reviewed2026History.tsx', 'utf8');
  const page = readFileSync('app/intel/buoy-10-chinook/page.tsx', 'utf8');
  assert.match(guard, /VERCEL_ENV === 'production'/);
  assert.match(guard, /VERCEL_GIT_COMMIT_REF === 'main'/);
  assert.match(guard, /if \(!isProductionMain\(\)\) return null/);
  assert.match(guard, /const history = seasons\[0\]/);
  assert.match(guard, /hashObservations\(seasons\)/);
  assert.match(guard, /source_html_sha256/);
  assert.match(guard, /source_retention_note/);
  assert.match(guard, /row\.chinook_kept === null/);
  assert.match(guard, /pinned WDFW August 2026 historical anchor changed/);
  assert.match(page, /Reviewed2026History/);
  assert.match(component, /reviewed2026ChinookHistory/);
  assert.equal(guard.includes('CHROME_AI_FORECAST_DATABASE_URL'), false);
  assert.equal(component.includes('2027-08-'), false);
});
