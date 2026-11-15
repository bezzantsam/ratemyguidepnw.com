import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const origin=process.env.TEST_BASE_URL,api=process.env.TEST_API_URL,browserPath=process.env.BROWSER_EXECUTABLE;
for(const value of [origin,api])if(!value||!/^http:\/\/127\.0\.0\.1:\d+$/.test(value))throw new Error('Isolated loopback server URLs are required');
if(origin===api||!browserPath)throw new Error('Distinct owned ports and a browser executable are required');
test('ordinary production data contains no synthetic discovery or unapproved controls',{timeout:60000},async()=>{
 const browser=await chromium.launch({executablePath:browserPath,headless:true});const context=await browser.newContext();
 const blocked=[],writes=[],errors=[];
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===api){if(req.method()!=='GET')writes.push(req.method());return route.fulfill({status:req.method()==='GET'?200:403,contentType:'application/json',body:'[]'})}
  if(url.origin===origin||['data:','blob:'].includes(url.protocol))return route.continue();
  blocked.push(url.origin);return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(`${origin}/guides`,{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Find a captain'}).waitFor();
  assert.equal(await page.getByLabel('Source-listed species').count(),0);
  assert.equal(await page.getByLabel('Source-listed fishing method').count(),0);
  assert.doesNotMatch(await page.content(),/Pending Secret Species|Rejected Secret Method|Synthetic test fixture|Fixture Source Outfit/);
  function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)])}
  for(const file of files('.next/static'))if(/\.(js|json)$/.test(file))assert.doesNotMatch(readFileSync(file,'utf8'),/Pending Secret Species|Rejected Secret Method|Fixture Source Outfit/);
  assert.deepEqual(blocked,[]);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close()}
});
