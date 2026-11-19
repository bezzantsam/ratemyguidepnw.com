// IDs are stored privately on captain drafts and may be reused by public filters.
const option = (kind, id, label, ...aliases) =>
  Object.freeze({kind, id, label, aliases: Object.freeze(aliases)});

export const fishingOptions = Object.freeze([
  option('method', 'trolling', 'Trolling', 'on the troll', 'troll fishing'),
  option('method', 'backtrolling', 'Backtrolling', 'back trolling', 'back-trolling', 'hot-shotting', 'pulling plugs'),
  option('method', 'jigging', 'Jigging', 'jig fishing', 'jigging lures'),
  option('method', 'vertical-jigging', 'Vertical jigging', 'vertical jigs', 'dropping iron'),
  option('method', 'squid-jigging', 'Squid jigging', 'squidding', 'squid jig fishing'),
  option('method', 'deep-dropping', 'Deep dropping', 'deep-drop fishing', 'deep dropping'),
  option('method', 'bottom-fishing', 'Bottom fishing', 'bottomfishing', 'bottom-fishing', 'fishing the bottom'),
  option('method', 'mooching', 'Mooching', 'salmon mooching', 'mooch fishing'),
  option('method', 'casting-lures', 'Casting lures', 'cast and retrieve', 'lure casting'),
  option('method', 'live-bait-fishing', 'Live-bait fishing', 'live bait', 'livebait fishing'),
  option('method', 'float-fishing', 'Float fishing', 'bobber fishing', 'fishing under a float'),
  option('method', 'drift-fishing', 'Drift fishing', 'drifting bait', 'river drift fishing'),
  option('method', 'side-drifting', 'Side drifting', 'side-drifting', 'sidedrifting'),
  option('method', 'back-bouncing', 'Back bouncing', 'backbouncing', 'back-bouncing'),
  option('method', 'plunking', 'Plunking', 'river plunking'),
  option('method', 'fly-fishing', 'Fly fishing', 'fly-fishing', 'flyfishing'),
  option('method', 'dry-fly-fishing', 'Dry-fly fishing', 'dry fly', 'dry flies'),
  option('method', 'nymphing', 'Nymphing', 'nymph fishing'),
  option('method', 'swinging-flies', 'Swinging flies', 'swing fishing', 'fly swinging'),
  option('method', 'pot-fishing', 'Pot fishing', 'setting pots', 'trap fishing', 'potting'),
  option('method', 'crab-ring-fishing', 'Crab ring fishing', 'ring crabbing', 'crab rings'),
  option('method', 'clam-digging', 'Clam digging', 'digging clams', 'clamming'),
  option('gear', 'electric-fishing-reels', 'Electric fishing reels', 'electric reels', 'power-assist reels', 'electric assist reels', 'powered fishing reels'),
  option('gear', 'downriggers', 'Downriggers', 'downrigger', 'down rigger'),
  option('gear', 'manual-downriggers', 'Manual downriggers', 'hand-crank downriggers', 'manual downrigger'),
  option('gear', 'electric-downriggers', 'Electric downriggers', 'power downriggers', 'electric downrigger'),
  option('gear', 'pot-pullers', 'Pot pullers', 'trap hauler', 'trap puller', 'crab pot puller', 'shrimp pot puller', 'prawn pot puller'),
  option('gear', 'electric-pot-pullers', 'Electric pot pullers', 'electric trap hauler', 'electric crab pot puller', 'electric shrimp puller', 'electric prawn puller', 'electric pot puller', 'automatic pot puller', 'automatic pot pullers'),
  option('gear', 'manual-pot-pullers', 'Manual pot pullers', 'manual trap puller', 'manual line hauler'),
  option('gear', 'crab-pots', 'Crab pots', 'crab trap', 'crab pot'),
  option('gear', 'shrimp-pots', 'Shrimp pots', 'prawn pots', 'shrimp traps', 'prawn traps'),
  option('gear', 'crab-rings', 'Crab rings', 'crab ring', 'ring net', 'crabbing ring'),
  option('gear', 'clam-guns', 'Clam guns', 'clam tube', 'clam gun'),
  option('gear', 'clam-shovels', 'Clam shovels', 'clam shovel', 'razor clam shovel'),
  option('gear', 'clam-rakes', 'Clam rakes', 'clam rake', 'shellfish rake'),
  option('gear', 'fly-tackle', 'Fly tackle', 'fly rods', 'fly rods and reels'),
  option('gear', 'two-handed-fly-rods', 'Two-handed fly rods', 'Spey rods', 'double-handed fly rods', 'two hand fly rods'),
  option('gear', 'spinning-tackle', 'Spinning tackle', 'spinning rod and reel', 'spinning gear'),
  option('gear', 'baitcasting-tackle', 'Baitcasting tackle', 'baitcasting setup', 'baitcaster', 'baitcasting rod and reel'),
  option('gear', 'squid-jigs', 'Squid jigs', 'squid jig'),
  option('gear', 'fishfinders', 'Fishfinders', 'fish finder', 'sonar', 'fishfinder'),
  option('gear', 'gps-anchor', 'GPS anchor', 'GPS anchoring', 'Spot-Lock', 'spot lock'),
]);

const methodIds = new Set(fishingOptions.filter(item => item.kind === 'method').map(item => item.id));
const gearIds = new Set(fishingOptions.filter(item => item.kind === 'gear').map(item => item.id));

function validIds(ids, catalog) {
  return Array.isArray(ids) && ids.length <= catalog.size &&
    ids.every(id => typeof id === 'string' && catalog.has(id)) &&
    new Set(ids).size === ids.length;
}

export function validFishingSelection(methods, gear) {
  return validIds(methods, methodIds) && validIds(gear, gearIds);
}

export function validDraft(value) {
  return value !== null && typeof value === 'object' &&
    Object.keys(value).length === 3 && Number.isSafeInteger(value.revision) &&
    value.revision >= 0 && value.revision <= 2147483647 &&
    validFishingSelection(value.methodIds, value.gearIds);
}
