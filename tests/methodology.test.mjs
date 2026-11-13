import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reviewed = JSON.parse(readFileSync('data/chinook-2026-reviewed.json', 'utf8'));
const publicContract = JSON.parse(readFileSync('lib/chinook-public-release.json', 'utf8'));
const page = readFileSync('app/intel/methodology/page.tsx', 'utf8');
const about = readFileSync('app/about/page.tsx', 'utf8');

test('methodology derives its sample numbers from reviewed 2026 records', () => {
  const observed = reviewed.seasons;
  assert.equal(observed.length, 1);
  assert.equal(observed[0].year, 2026);
  assert.equal(observed[0].rows.length, 31);
  assert.equal(observed[0].rows.reduce((sum, row) => sum + row.chinook_kept, 0), 1373);
  assert.equal(observed[0].rows.reduce((sum, row) => sum + row.anglers, 0), 5087);
  assert.equal(reviewed.review.decision, 'approved_for_descriptive_2026_history_only');
  assert.match(page, /const pooledRatio = totalKept \/ totalSampled/);
  assert.match(page, /row\.chinook_kept/);
  assert.match(page, /row\.anglers/);
});

test('page keeps the difference between fish per angler and catch probability explicit', () => {
  assert.match(page, /not an individual angler/);
  assert.match(page, /does <strong>not<\/strong> mean/);
  assert.match(page, /not the harvest total for the whole fishery/);
  assert.match(page, /Days without valid sampling/);
  assert.match(page, /zero-catch days/);
});

test('all official sources originate from independently reviewed release contracts', () => {
  assert.equal(new URL(publicContract.source_links.wdfw_creel).hostname, 'wdfw.wa.gov');
  assert.equal(new URL(publicContract.source_links.noaa_astoria_tides).hostname, 'tidesandcurrents.noaa.gov');
  assert.equal(new URL(reviewed.review.emergency_regulation_url).hostname, 'lawfilesext.leg.wa.gov');
  assert.match(page, /release\.source_links\.wdfw_creel/);
  assert.match(page, /release\.source_links\.noaa_astoria_tides/);
  assert.match(page, /reviewedHistory\.review\.emergency_regulation_url/);
});

test('2027 forecast accuracy is never presented as validated', () => {
  assert.equal(publicContract.prospective_evaluation.status, 'awaiting_official_2027_results');
  assert.equal(publicContract.prospective_evaluation.verified_outcome_days, 0);
  assert.equal(publicContract.prospective_evaluation.verified_model_mae, null);
  assert.equal(publicContract.release_approval.approved_for_public_skill_claims, false);
  assert.match(page, /not yet validated/);
  assert.match(page, /predictions made/);
  assert.doesNotMatch(page, /CHROME_AI_FORECAST_DATABASE_URL|service_role|createClient\(/);
});

test('methodology is reachable from about page and returns to Chinook Intel', () => {
  assert.match(about, /href="\/intel\/methodology"/);
  assert.match(page, /href="\/intel\/buoy-10-chinook"/);
  assert.match(page, /export const metadata/);
  assert.match(page, /aria-label="Breadcrumb"/);
});
