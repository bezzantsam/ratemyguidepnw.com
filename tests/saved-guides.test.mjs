import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/saved-guides.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText;

function harness({initial = null, failReads = false, failWrites = false} = {}) {
  const events = [];
  const window = {
    localStorage: {
      getItem() {
        if (failReads) throw new Error('blocked');
        return initial;
      },
      setItem(_key, value) {
        if (failWrites) throw new Error('quota');
        initial = value;
      },
    },
    dispatchEvent: event => events.push(event.type),
  };
  const exports = {};
  vm.runInNewContext(compiled, {exports, window, Event});
  return {api: exports, events};
}

test('drops external and non-profile URLs and deduplicates capped lists', () => {
  const {api} = harness();
  const items = ['/guides/og-12', 'https://example.invalid', '/washington/wa-002',
    '/guides/og-12', '/guides/../a', '/guides/x?tracking=yes', '/guides/x#share'];
  assert.deepEqual(Array.from(api.normalizeSavedGuides(items)), ['/guides/og-12', '/washington/wa-002']);
  assert.equal(api.normalizeSavedGuides(Array.from({length: 100}, (_, i) => '/guides/g' + i)).length, 50);
  assert.deepEqual(Array.from(api.normalizeSavedGuides('bad')), []);
});

test('toggles canonical profile paths and raises same-tab change events', () => {
  const {api, events} = harness();
  assert.equal(api.toggleSavedGuide('/guides/og-12'), 'saved');
  assert.deepEqual(Array.from(api.readSavedGuides()), ['/guides/og-12']);
  assert.equal(api.toggleSavedGuide('/guides/og-12'), 'removed');
  assert.deepEqual(Array.from(api.readSavedGuides()), []);
  assert.deepEqual(events, ['rmgpnw:saved-guides-changed', 'rmgpnw:saved-guides-changed']);
});

test('blocked reads and failed writes never claim success or erase retained entries', () => {
  const broken = harness({initial: 'not json'});
  assert.deepEqual(Array.from(broken.api.readSavedGuides()), []);
  const blocked = harness({failReads: true});
  assert.equal(blocked.api.readSavedGuides(), null);
  assert.equal(blocked.api.toggleSavedGuide('/washington/wa-002'), 'unavailable');
  assert.equal(blocked.events.length, 0);
  const readOnly = harness({initial: '["/washington/wa-002"]', failWrites: true});
  assert.equal(readOnly.api.toggleSavedGuide('/washington/wa-002'), 'unavailable');
  assert.deepEqual(Array.from(readOnly.api.readSavedGuides()), ['/washington/wa-002']);
  assert.equal(readOnly.events.length, 0);
});

test('full lists can remove an entry and then save a different guide', () => {
  const {api} = harness({initial: JSON.stringify(Array.from({length: 50}, (_, i) => '/guides/g' + i))});
  assert.equal(api.toggleSavedGuide('/washington/wa-002'), 'full');
  assert.equal(api.toggleSavedGuide('/guides/g0'), 'removed');
  assert.equal(api.toggleSavedGuide('/washington/wa-002'), 'saved');
});
