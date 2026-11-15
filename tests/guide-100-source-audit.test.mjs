import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const directory=JSON.parse(readFileSync('lib/oregon-guides.json','utf8'));
const enriched=JSON.parse(readFileSync('lib/guide-enrichment.json','utf8'));
const registry=new Set(directory.map(r=>r.registration));
const BATCH_IDS=[
  "OG.0000186",
  "OG.0000281",
  "OG.0000290",
  "OG.0000305",
  "OG.0000329",
  "OG.0000332",
  "OG.0000334",
  "OG.0000653",
  "OG.0000655",
  "OG.0000657",
  "OG.0000659",
  "OG.0000662",
  "OG.0000664",
  "OG.0000672",
  "OG.0000674",
  "OG.0000678",
  "OG.0000689",
  "OG.0000695",
  "OG.0000711",
  "OG.0000726",
  "OG.0000352",
  "OG.0000361",
  "OG.0000365",
  "OG.0000376",
  "OG.0000381",
  "OG.0000417",
  "OG.0000740",
  "OG.0000758",
  "OG.0000761",
  "OG.0000785",
  "OG.0000827",
  "OG.0000828",
  "OG.0000860",
  "OG.0000865",
  "OG.0000590",
  "OG.0000594",
  "OG.0001070",
  "OG.0001084",
  "OG.0000874",
  "OG.0000880",
  "OG.0000886",
  "OG.0000889",
  "OG.0000895",
  "OG.0000916",
  "OG.0000933",
  "OG.0000949",
  "OG.0000951",
  "OG.0000958",
  "OG.0000978",
  "OG.0000983",
  "OG.0000988",
  "OG.0001962",
  "OG.0001988",
  "OG.0002015",
  "OG.0002078",
  "OG.0002174",
  "OG.0002194",
  "OG.0002472",
  "OG.0002476",
  "OG.0002484",
  "OG.0002544",
  "OG.0002616",
  "OG.0002624",
  "OG.0002637",
  "OG.0002643",
  "OG.0002644",
  "OG.0001151",
  "OG.0001243",
  "OG.0001159",
  "OG.0001174",
  "OG.0001179",
  "OG.0001261",
  "OG.0001185",
  "OG.0001263",
  "OG.0001200",
  "OG.0001205",
  "OG.0001214",
  "OG.0001225.F&F",
  "OG.0001330",
  "OG.0001336",
  "OG.0001346",
  "OG.0001390",
  "OG.0001629",
  "OG.0001670",
  "OG.0001788",
  "OG.0001789",
  "OG.0001849",
  "OG.0001916",
  "OG.0001922",
  "OG.0001925",
  "OG.0002277",
  "OG.0002297",
  "OG.0002351",
  "OG.0002356",
  "OG.0002385",
  "OG.0002442",
  "OG.0002448",
  "OG.0002655",
  "OG.0002751",
  "OG.0002783"
];
test('November 15 source audit adds exactly 100 existing distinct Oregon identities with dated operator links',()=>{
 assert.equal(BATCH_IDS.length,100);
 assert.equal(new Set(BATCH_IDS).size,100);
 for(const id of BATCH_IDS){
   assert.ok(registry.has(id),'not in state import: '+id);
   const row=enriched[id];
   assert.ok(row,'missing enrichment '+id);
   assert.deepEqual(row.searchAliases,[]);
   assert.equal(row.sourceLinks.length,1);
   assert.equal(row.sourceLinks[0].sourceType,'operator_site');
   assert.equal(row.sourceLinks[0].observedOn,'2026-11-15');
   assert.match(row.sourceLinks[0].url,/^https:\/\/[^\s/]+/);
   const names=new Set();
   for(const w of row.advertisedWaters){
     assert.ok(w.name.trim());
     assert.ok(!names.has(w.name),'duplicate waterway '+id+': '+w.name);
     names.add(w.name);
     assert.equal(w.sourceType,'operator_site');
     assert.equal(w.observedOn,'2026-11-15');
     assert.equal(w.sourceUrl,row.sourceLinks[0].url);
   }
 }
});
