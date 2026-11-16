import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {preparePreview} from '../scripts/editorial-visual.mjs';
test('preview adapter modifies only its disposable snapshot and uses product renderers',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'visual-adapter-'));const files=['lib/guide-attributes-server.ts','lib/guide-enrichment.ts','app/layout.tsx'];
 try{for(const file of files){await mkdir(join(dir,file.split('/')[0]),{recursive:true});await copyFile(file,join(dir,file))}await writeFile(join(dir,'lib/__editorial_visual__.json'),'{}');
  await preparePreview(dir,'http://127.0.0.1:12345');const src=await readFile(join(dir,'lib/guide-attributes-server.ts'),'utf8');assert.match(src,/safe\.filter/);assert.match(src,/previewData\.attributes/);assert.match(await readFile(join(dir,'app/layout.tsx'),'utf8'),/Unapproved editorial preview/);
  assert.doesNotMatch(await readFile('lib/guide-attributes-server.ts','utf8'),/__editorial_visual__/);assert.doesNotMatch(await readFile('app/layout.tsx','utf8'),/Unapproved editorial preview/);
  await assert.rejects(preparePreview(dir,'http://127.0.0.1:12345'),/no longer matches/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
