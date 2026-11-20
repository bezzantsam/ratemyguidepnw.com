/** Generate the review-only Washington catalog input. All reads are local. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = resolve(root, 'docs/research/identity-mapping/washington-unclaimed-review-catalog-v1.json');
const validId = /^wa-[0-9]{3,9}$/u;
const hash = value => createHash('sha256').update(value).digest('hex');

function assertCatalog(ok, message) {
  if (!ok) throw new Error(message);
}

// Use the same source-key function, active directory and version implementation as Next.
export function readCatalog() {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    if (path.endsWith('.json')) {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      cache.set(path, data);
      return data;
    }
    const exports = {};
    cache.set(path, exports);
    const {outputText} = ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
    }});
    vm.runInNewContext(outputText, {exports, URL, require(name) {
      if (name === 'node:crypto') return {createHash};
      assertCatalog(name.startsWith('./'), 'unexpected catalog module');
      return load(resolve(dirname(path), name.endsWith('.json') ? name : name + '.ts'));
    }}, {filename: path});
    return exports;
  }

  const lib = name => resolve(root, 'lib', name);
  const {washingtonSourceKey, washingtonGuides} = load(lib('washington.ts'));
  const {washingtonListedReviewVersion} = load(lib('wa-listed-review-version.ts'));
  const {unresolvedWashingtonSourceHolds} = load(lib('washington-reconciled.ts'));
  return {
    raw: load(lib('washington-raw.json')),
    allocations: load(lib('washington-stable-ids.json')),
    exclusions: Array.from(unresolvedWashingtonSourceHolds),
    visibleIds: new Set(washingtonGuides.map(guide => guide.id)),
    sourceKey: washingtonSourceKey,
    listingVersion: washingtonListedReviewVersion,
  };
}

const compact = text => (text ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const outfit = text => compact(text?.trim().replace(/\s+-\s+(?:or|wa)$/iu, '').replace(/\s+llc\.?$/iu, ''));

export function classifyCatalog({raw, allocations, exclusions, visibleIds, sourceKey, listingVersion}) {
  const catalog = new Map();
  const excluded = new Map(exclusions.map(row => [row.key, row.proposedId]));
  const allocatedIds = new Set(Object.values(allocations));
  assertCatalog(allocatedIds.size === Object.keys(allocations).length, 'duplicate stable source ID');
  assertCatalog(excluded.size === exclusions.length, 'duplicate existing exclusion key');
  for (const row of raw) {
    assertCatalog(typeof row.name === 'string' && typeof row.source === 'string', 'missing catalog identity field');
    const key = sourceKey(row);
    assertCatalog(!catalog.has(key), 'duplicate source key');
    catalog.set(key, row);
    assertCatalog(Object.hasOwn(allocations, key) !== excluded.has(key), 'unknown or doubly classified source row');
  }
  for (const [key, id] of excluded) {
    assertCatalog(catalog.has(key) && validId.test(id) && !allocatedIds.has(id), 'stale or allocated exclusion');
  }

  const peersByName = new Map();
  function addPeer(name, entry) {
    const key = compact(name);
    if (!key) return;
    const group = peersByName.get(key) ?? [];
    group.push(entry);
    peersByName.set(key, group);
  }
  for (const [key, sourceId] of Object.entries(allocations)) {
    const row = catalog.get(key);
    assertCatalog(row && validId.test(sourceId), 'missing row or invalid stable source ID');
    addPeer(row.name, {...row, id: sourceId});
  }

  const rows = Object.entries(allocations).map(([key, sourceId]) => {
    const listing = catalog.get(key);
    const listingSha256 = listingVersion(sourceId);
    assertCatalog(typeof listingSha256 === 'string' && /^[a-f0-9]{64}$/u.test(listingSha256), 'missing exact catalog version');
    const business = outfit(listing.business);
    const candidates = peersByName.get(compact(listing.name)) ?? [];
    const sameListing = candidates.filter(peer => peer.id && peer.id !== sourceId &&
      (!business || !outfit(peer.business) || business === outfit(peer.business)));
    let holdReason = null;
    if (!compact(listing.name) || !compact(listing.source)) holdReason = 'missing_current_source_identity';
    else if (!visibleIds.has(sourceId)) holdReason = 'current_listing_not_distinct_in_directory';
    else if (sameListing.length) holdReason = 'ambiguous_current_wa_listing';
    return {sourceId, sourceKeySha256: hash(key), listingSha256, holdReason};
  }).sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0);

  return rows;
}

export const serialize = rows => JSON.stringify(rows, null, 2) + '\n';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const rows = classifyCatalog(readCatalog());
  const text = serialize(rows);
  if (process.argv[2] === '--check') {
    assertCatalog(readFileSync(manifestPath, 'utf8') === text, 'review-only manifest differs from the current catalog');
  } else if (process.argv.length === 2) {
    process.stdout.write(text);
  } else {
    throw new Error('usage: node scripts/washington-unclaimed-review-catalog.mjs [--check]');
  }
}
