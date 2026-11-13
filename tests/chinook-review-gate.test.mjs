import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const publicContract = JSON.parse(readFileSync('lib/chinook-public-release.json', 'utf8'));
const audited = JSON.parse(readFileSync('data/chinook-2026-reviewed.json', 'utf8'));
const source = readFileSync('lib/chinook-reviewed-history.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runGate(data=audited, {environment='production', branch='main'}={}) {
  let reads = 0;
  const exports = {};
  const sandbox = {
    exports,
    module: {exports},
    process: {
      cwd: () => '/tmp/ratemyguidepnw',
      env: {VERCEL_ENV: environment, VERCEL_GIT_COMMIT_REF: branch},
    },
    require: name => {
      if (name === 'server-only') return {};
      if (name === './chinook-intel') return {chinookRelease: publicContract};
      if (name === 'node:path') return path;
      if (name === 'node:crypto') return crypto;
      if (name === 'node:fs') return {
        readFileSync: file => {
          reads++;
          assert.equal(file.endsWith('data/chinook-2026-reviewed.json'), true);
          if (data === undefined) {
            const error = new Error('ENOENT');
            error.code = 'ENOENT';
            throw error;
          }
          return JSON.stringify(data);
        },
      };
      throw new Error('Unexpected imported module: ' + name);
    },
  };
  vm.runInNewContext(compiled, sandbox, {timeout:2000});
  return {result:sandbox.module.exports.reviewed2026ChinookHistory(), reads};
}

test('previews, local builds and unreviewed bot branch do not read approved history', () => {
  for (const config of [
    {environment:'preview', branch:'bot/wdfw-chinook-review'},
    {environment:'production', branch:'bot/wdfw-chinook-review'},
    {environment:'development', branch:'main'},
  ]) {
    const {result, reads} = runGate(audited, config);
    assert.equal(result, null);
    assert.equal(reads, 0);
  }
});

test('separate approved 2026 file reproduces all 31 original agency observations', () => {
  const {result, reads} = runGate();
  assert.equal(reads, 1);
  assert.equal(result.rows.length, 31);
  assert.equal(result.excluded_days, 0);
  assert.equal(result.rows.reduce((sum, row) => sum + row.anglers, 0), 5087);
  assert.equal(result.rows.reduce((sum, row) => sum + row.chinook_kept, 0), 1373);
  assert.equal(result.source_sha256, 'ef43d5b525a57af1efda3e856d7a77fea08c83ac1e452b208c9daf1cf4199562');
  assert.equal(result.rows.some(row=>row.date.startsWith('2027')), false);
});

test('review bot candidate is not consumed by production page', () => {
  assert.equal(source.includes("data', 'chinook-wdfw-candidate.json'"), false);
  assert.equal(source.includes("data', 'chinook-2026-reviewed.json'"), true);
});

test('future 2027 season is rejected, not displayed or imported', () => {
  const changed = clone(audited);
  changed.seasons.push({
    year:2027,observed_days:1,rows:[{
      date:'2027-08-01',anglers:100,boats:30,chinook_kept:11,
      sample_status:'observed_unverified_regulations',
      source_retention_note:'Chinook and hatchery coho'
    }]
  });
  assert.throws(() => runGate(changed), /future seasons/);
});

test('a revised agency count cannot silently replace the approved release', () => {
  const changed = clone(audited);
  changed.seasons[0].rows[21].chinook_kept++;
  assert.throws(() => runGate(changed), /altered after source audit/);
});

test('a changed retention label fails publication until the release is reaudited', () => {
  const changed = clone(audited);
  changed.seasons[0].rows[25].source_retention_note = 'Chinook and hatchery coho';
  assert.throws(() => runGate(changed), /altered after source audit/);
});

test('source checksum, review status and ML approval are fail-closed', () => {
  const wrongSource = clone(audited);
  wrongSource.source_html_sha256 = 'f'.repeat(64);
  assert.throws(() => runGate(wrongSource), /source HTML does not match/);
  const notReviewed = clone(audited);
  notReviewed.publication_status = 'candidate_review_only';
  assert.throws(() => runGate(notReviewed), /unexpected source status/);
  const contaminated = clone(audited);
  contaminated.approved_for_model_training = true;
  assert.throws(() => runGate(contaminated), /private research approval/);
});

test('no approved release leaves initial 5-day historical panel unaffected', () => {
  const {result} = runGate(undefined);
  assert.equal(result, null);
});
