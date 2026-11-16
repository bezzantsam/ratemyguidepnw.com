import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const executablePath=process.env.BROWSER_EXECUTABLE;
if(!executablePath)throw Error('Set BROWSER_EXECUTABLE to a local browser');
test('offline review exports, merges and rejects stale or malformed decisions',{timeout:90000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'editorial-review-'));const html=join(dir,'review.html');
 const before=readFileSync('lib/approved-guide-attributes.json');
 execFileSync('python3',['scripts/editorial_review.py','generate','--output',html],{stdio:'pipe'});
 let browser,one,two;const blocked=[];const errors=[];
 async function context(){const ctx=await browser.newContext({acceptDownloads:true});await ctx.route('**/*',route=>{const url=new URL(route.request().url());if(['file:','data:','blob:'].includes(url.protocol))return route.continue();blocked.push(url.origin);return route.abort()});return ctx}
 try{
  browser=await chromium.launch({executablePath,headless:true});one=await context();two=await context();
  const page=await one.newPage();page.on('pageerror',err=>errors.push(err.message));await page.goto(pathToFileURL(html).href);
  await page.getByLabel('Editor label').fill('Synthetic reviewer');
  await page.getByLabel('Search name, business, or registration').fill("Bob Rees' Fishing Guide Service");
  await page.locator('details.guide summary').getByText('OG.0000741',{exact:false}).waitFor();
  await page.getByLabel('Search name, business, or registration').fill('OG.0003060');
  await page.getByLabel('Show',{exact:true}).selectOption('hold');
  const guide=page.locator('details.guide').first();await guide.locator('summary').click();
  await guide.getByText('Additive evidence:',{exact:false}).waitFor();
  await guide.getByLabel('Decision for hold OG.0003060').selectOption('hold');
  await guide.getByLabel('Reason for hold OG.0003060').fill('Synthetic review: retain the hold');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export decisions'}).click();const download=await downloadPromise;
  const bytes=readFileSync(await download.path());const doc=JSON.parse(bytes);assert.equal(doc.schema_version,1);assert.equal(doc.decisions.length,1);assert.equal(doc.decisions[0].action,'hold');
  const other=await two.newPage();other.on('pageerror',err=>errors.push(err.message));await other.goto(pathToFileURL(html).href);
  await other.locator('#import').setInputFiles({name:'decisions.json',mimeType:'application/json',buffer:bytes});
  await other.getByText('Imported and merged 1 decisions.').waitFor();
  await other.getByLabel('Search name, business, or registration').fill('OG.0003060');await other.getByLabel('Show',{exact:true}).selectOption('hold');
  const restored=other.locator('details.guide').first();await restored.locator('summary').click();assert.equal(await restored.getByLabel('Reason for hold OG.0003060').inputValue(),'Synthetic review: retain the hold');
  const stale={...doc,candidate_sha256:'stale'};await other.locator('#import').setInputFiles({name:'stale.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(stale))});
  await other.getByText('Import rejected: Stale or mismatched candidate_sha256').waitFor();
  assert.equal(await restored.getByLabel('Reason for hold OG.0003060').inputValue(),'Synthetic review: retain the hold');
  await other.locator('#import').setInputFiles({name:'duplicate.json',mimeType:'application/json',buffer:Buffer.from('{"schema_version":1,"schema_version":1}')});
  await other.getByText('Import rejected: Duplicate JSON key: schema_version').waitFor();
  await other.evaluate(()=>localStorage.setItem('ratemyguide-editorial-v1-old-version',JSON.stringify({editor:'Old',decisions:{}})));
  await other.reload();await other.getByText('Saved work for a different review version exists.',{exact:false}).waitFor();
  assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);assert.deepEqual(readFileSync('lib/approved-guide-attributes.json'),before);
 }finally{if(one)await one.close();if(two)await two.close();if(browser)await browser.close();rmSync(dir,{recursive:true,force:true})}
});
