import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));
function load(path, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(read(path), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true}}).outputText;
  vm.runInNewContext(code, {exports, URL, URLSearchParams, Date, Set, Map, require: name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw Error(`Unexpected dependency: ${name}`);
  }});
  return exports;
}
const attributes = load('lib/guide-attributes.ts', {'./guide-evidence-holds.json': json('lib/guide-evidence-holds.json')});
const query = load('lib/directory-query.ts');
const url = load('lib/directory-url.ts', {'./directory-query': query});
const fixture = json('tests/fixtures/discovery-attributes.json');
const clone = value => JSON.parse(JSON.stringify(value));
const known = new Set(['OG.0000047', 'OG.0000050', 'OG.0000782']);

test('missing and malformed publication fields and conflicting records fail closed', () => {
  for (const field of ['editorial_status', 'publication_approved', 'evidence_scope', 'source']) {
    const item = clone(fixture[0]); delete item[field];
    assert.equal(attributes.approvedAttributes([item], known).length, 0, field);
  }
  for (const value of ['true', 1, null, false]) {
    const item = clone(fixture[0]); item.publication_approved = value;
    assert.equal(attributes.approvedAttributes([item], known).length, 0, String(value));
  }
  for (const id of ['OG.9999999', 'OG.0000782']) {
    const item = clone(fixture[0]); item.guide_id = id;
    assert.equal(attributes.approvedAttributes([item], known).length, 0, id);
  }
  const conflicting = clone(fixture[0]); conflicting.value = '  sALMon  '; conflicting.editorial_status = 'pending';
  assert.equal(attributes.approvedAttributes([fixture[0], conflicting], known).length, 0);
});

test('duplicate and malformed URL fields do not select a different valid filter', () => {
  const rows = [{id:'OG.0000047',name:'One',business:null,states:['Oregon'],areas:['A'],advertisedWaters:['River'],advertisedSpecies:['Salmon'],advertisedMethods:['Fly'],searchAliases:[]}];
  const parsed = url.parseDirectoryState('?state=Oregon&state=Washington&area=A&water=River&species=Salmon&species=Trout&method=Fly&page=-1&q=a&q=b', rows);
  assert.equal(parsed.state, 'All'); assert.equal(parsed.species, 'All species');
  assert.equal(parsed.area, 'A'); assert.equal(parsed.waterway, 'River'); assert.equal(parsed.method, 'Fly');
  assert.equal(parsed.page, 1); assert.equal(parsed.query, '');
  assert.equal(url.safeDirectoryReturn('/guides?state=Oregon&state=Washington'), '/guides');
});

test('an unrelated same-name Washington record is not silently suppressed', () => {
  const api = load('lib/washington.ts', {'./washington-raw.json': [], './washington-stable-ids.json': {}, './washington-reconciled': load('lib/washington-reconciled.ts')});
  const row = {name:'Tony Fisher', business:'Unrelated hypothetical outfit', source:'Unreviewed source', notes:null};
  assert.throws(() => api.mapWashingtonGuides([row]), /needs a reviewed stable ID assignment/);
});

test('unresolved cross-state identity is not treated as an established match', () => {
  const api = load('lib/washington-reconciled.ts');
  const row = api.reconciledWashingtonCaptains.find(x => x.oregonRegistration === 'OG.0003982');
  assert.match(row.reviewStatus, /requires review/);
  assert.equal(api.washingtonRecordForOregon(row.oregonRegistration), undefined);
});
