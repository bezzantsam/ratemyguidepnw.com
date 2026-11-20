import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {classifyCatalog, readCatalog, serialize} from '../scripts/washington-unclaimed-review-catalog.mjs';

const published = readCatalog();
const manifestPath = new URL('../docs/research/identity-mapping/washington-unclaimed-review-catalog-v1.json', import.meta.url);
const digest = text => createHash('sha256').update(text).digest('hex');

test('all 158 rows reproduce exact current stable keys and versions in 06 wire format', () => {
  const rows = classifyCatalog(published);
  assert.equal(serialize(rows), readFileSync(manifestPath, 'utf8'));
  assert.equal(rows.length, 158);
  assert.equal(rows.filter(row => row.holdReason === null).length, 158);
  assert.equal(published.raw.length, 163);
  const excluded = new Set(published.exclusions.map(row => row.key));
  assert.equal(excluded.size, 5);
  const byKey = new Map(published.raw.map(row => [published.sourceKey(row), row]));
  const byId = new Map(rows.map(row => [row.sourceId, row]));
  assert.equal(byId.size, 158);
  assert.deepEqual([...byId.keys()], [...byId.keys()].sort());
  for (const [key,id] of Object.entries(published.allocations)) {
    const row = byId.get(id);
    assert.deepEqual(Object.keys(row), ['sourceId','sourceKeySha256','listingSha256','holdReason']);
    assert.ok(byKey.has(key));
    assert.ok(!excluded.has(key));
    assert.equal(row.sourceKeySha256, digest(key), id);
    assert.equal(row.listingSha256, published.listingVersion(id), id);
  }
  for (const {proposedId} of published.exclusions) assert.ok(!byId.has(proposedId));
  assert.deepEqual(rows.filter(row => row.holdReason), []);
});

test('Shelby, Charles, named peers at shared outfits and rows without optional fields stay eligible', () => {
  const lookup = new Map(classifyCatalog(published).map(row => [row.sourceId,row]));
  const indexed = new Map(published.raw.map(row => [published.allocations[published.sourceKey(row)],row]));
  assert.match(indexed.get('wa-021').name, /^Charles Stahley$/u);
  assert.match(indexed.get('wa-144').name, /^Shelby Ross$/u);
  for (const id of ['wa-021','wa-144','wa-005','wa-062','wa-031','wa-082','wa-050',
    'wa-059','wa-087','wa-094','wa-096','wa-125']) assert.equal(lookup.get(id).holdReason, null, id);
  const missingBusiness = [...lookup.keys()].filter(id => !indexed.get(id).business);
  assert.equal(missingBusiness.length, 6);
  for (const id of missingBusiness) assert.equal(lookup.get(id).holdReason, null, id);
});

test('reordering the catalog or allocation keys cannot reassign identity', () => {
  const reversed = {...published, raw: [...published.raw].reverse(),
    allocations: Object.fromEntries(Object.entries(published.allocations).reverse())};
  assert.equal(serialize(classifyCatalog(reversed)), serialize(classifyCatalog(published)));
});

function fixture(raw, visibleIds) {
  const sourceKey = published.sourceKey;
  const allocationEntries = raw.map((row,index) => [sourceKey(row),'wa-90' + (index + 1)]);
  return {raw, allocations: Object.fromEntries(allocationEntries), exclusions: [],
    visibleIds: new Set(visibleIds ?? allocationEntries.map(([,id]) => id)), sourceKey,
    listingVersion(id) {
      const [key] = allocationEntries.find(([,value]) => value === id);
      const row = raw.find(record => sourceKey(record) === key);
      const record = Object.fromEntries(Object.entries(row).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0));
      return digest(JSON.stringify({record,source_id:id,source_key:key}));
    },
  };
}
const record = (name,business,source='Fixture one') => ({name,business,source,notes:null});

test('catalog disagreements, repeated exact source rows and duplicate stable IDs fail closed', () => {
  const a = record('Captain One','Example');
  const b = record('Captain Two','Example');
  assert.throws(() => classifyCatalog(fixture([a,{...a,name:'CAPTAIN ONE'}])), /duplicate source key/);
  assert.throws(() => classifyCatalog({...fixture([a,b]),allocations:{[published.sourceKey(a)]:'wa-901',[published.sourceKey(b)]:'wa-901'}}), /duplicate stable source ID/);
  assert.throws(() => classifyCatalog({...fixture([a,b]),raw:[a]}), /missing row/);
  assert.throws(() => classifyCatalog({...fixture([a,b]),raw:[a,{...b,source:undefined}]}), /missing catalog identity field/);
});

test('same WA name and outfit across sources holds both rows, but a shared outfit alone does not', () => {
  const rows = classifyCatalog(fixture([
    record('Captain One','Example','Fixture one'),
    record('Captain One','Example LLC','Fixture two'),
    record('Captain Two','Example','Fixture two'),
    record('Captain One','Distinct water','Fixture three'),
  ]));
  assert.deepEqual(rows.map(row => row.holdReason),
    ['ambiguous_current_wa_listing','ambiguous_current_wa_listing',null,null]);
});

test('Oregon matches and aliases do not change the eligibility of separate WA profiles', () => {
  const wa = record('Captain One','Example Fishing');
  const input = fixture([wa]);
  const oregon = [
    {registration:'OG.0000001',name:'Other Captain',business:'Example Fishing',searchAliases:['Captain One']},
    {registration:'OG.0000002',name:'Captain One',business:'Example Fishing',website:'www.examplefishing.com'},
  ];
  assert.equal(classifyCatalog({...input, oregon})[0].holdReason,null);
  assert.equal(classifyCatalog(fixture([wa],[]))[0].holdReason,'current_listing_not_distinct_in_directory');
});

test('missing optional details are eligible; missing actual source identity is held', () => {
  const rows = classifyCatalog(fixture([
    record('Captain Zero',null), record('', 'Example'), record('Captain Two','Example',''),
  ]));
  assert.deepEqual(rows.map(row => row.holdReason),
    [null,'missing_current_source_identity','missing_current_source_identity']);
});
