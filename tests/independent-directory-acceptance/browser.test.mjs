import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdirSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const origin=process.env.TEST_BASE_URL,api=process.env.TEST_API_URL,executablePath=process.env.BROWSER_EXECUTABLE;
for(const x of [origin,api])assert.match(x||'',/^http:\/\/127\.0\.0\.1:\d+$/);
assert.notEqual(origin,api);assert.ok(executablePath);
const pending=['Washington spelling Daniel Benowitz; business match requires review before using as verified','Operator notice says no bookings for 2024 and beyond.','Pending Secret Species','Rejected Secret Method','Unapproved editorial preview','release-private-marker-7e813f65'];
function scan(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?scan(join(dir,e.name)):[join(dir,e.name)])}
test('independent production output and direct HTTP boundary', {timeout:120000},async()=>{
 let scanned=0;for(const file of [...scan('.next/static').filter(f=>/\.(js|json|html)$/.test(f)),...scan('.next/server').filter(f=>/\.(html|rsc|body)$/.test(f))]){const text=readFileSync(file,'utf8');for(const marker of pending)assert.ok(!text.includes(marker),`pending marker in public output ${file}`);scanned++}
 assert.ok(scanned>20);console.log('targeted public assets and rendered files scanned:',scanned);
 // Server-only implementation bundles can contain held research: verify a
 // representative bundle is not served by the public Next.js route handler.
 for(const f of scan('.next/server').filter(f=>/\.(js|json|html|rsc|body)$/.test(f)))assert.ok(!readFileSync(f,'utf8').includes('release-private-marker-7e813f65'),'synthetic secret appears in server output');
 const held=scan('.next/server').filter(f=>f.endsWith('.js')&&readFileSync(f,'utf8').includes(pending[0]));assert.ok(held.length>0,'expected held marker in server-only implementation');for(const f of held){const r=await fetch(origin+'/_next/'+f.slice('.next/'.length));assert.equal(r.status,404,'server implementation must not be public')};console.log('server-only held-marker bundles checked:',held.length);
 const cases=['/api/reviews','/api/claims','/api/upload','/api/admin','/api/moderation','/api/owner','/scripts/editorial/review.html','/docs/research/BATCH13_SOURCE_REVIEW_20261115.json','/docs/qa/backend-independent-review.md','/editorial-changes'];
 for(const path of cases){const r=await fetch(origin+path);assert.equal(r.status,404,path)}
 for(const path of ['/api/reviews','/api/claims','/api/upload','/api/admin','/api/owner','/admin','/reviews'])for(const method of ['POST','PUT','PATCH','DELETE']){const r=await fetch(origin+path,{method,headers:{'content-type':'application/json'},body:'{"status":"approved","body":"synthetic"}'});assert.ok([404,405].includes(r.status),`${method} ${path}: ${r.status}`)}
 // Next serves HTML for these dynamic pages even on write methods. Assert the
 // body is the unavailable/read-only page, not that a 200 is authorization proof.
 for(const [path,marker] of [['/claim/OG.0000047','Profile claim submissions are not currently available.'],['/guides/og-0000047','Review data is unavailable.']])for(const method of ['POST','PUT','PATCH','DELETE']){const r=await fetch(origin+path,{method,headers:{'content-type':'application/json'},body:'{"status":"approved","body":"synthetic"}'});assert.equal(r.status,200,`${method} ${path}`);assert.match(r.headers.get('content-type')||'',/text\/html/);assert.ok((await r.text()).includes(marker),`${method} ${path} returned unexpected content`)}
});
test('independent desktop and mobile public journeys stay isolated', {timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath,headless:true}); const context=await browser.newContext();const unexpected=[],backend=[],writes=[],errors=[];
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(req.method()!=='GET'&&req.method()!=='HEAD')writes.push(`${req.method()} ${u.pathname}`);if(u.origin===api){backend.push(req.method());return route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'})}if(u.origin===origin||['data:','blob:'].includes(u.protocol))return route.continue();unexpected.push(u.origin);return route.abort()});
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const screenshot=async name=>{if(process.env.REVIEW_SCREENSHOT_DIR){mkdirSync(process.env.REVIEW_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.REVIEW_SCREENSHOT_DIR,name),fullPage:true})}};
 try{
  for(const [width,height,label] of [[1280,800,'desktop'],[375,812,'mobile']]){
   await page.setViewportSize({width,height});await page.goto(origin+'/guides?state=Oregon&area=Coos-Coquille&q=John+Hanson',{waitUntil:'networkidle'});
   const input=page.getByRole('searchbox',{name:'Captain, business, operating name, or registration'});assert.equal(await input.inputValue(),'John Hanson');assert.equal(await page.getByLabel('Imported source area / notes (unverified)').inputValue(),'Coos-Coquille');
   const row=page.getByRole('link',{name:/John Hanson/}).first();await row.waitFor();assert.match(await row.innerText(),/Reviews unavailable/);assert.doesNotMatch(await row.innerText(),/\b0(?:\.0)?\s*(?:stars?|reviews?)\b/i);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');const saved=page.url();await screenshot(label+'-directory.png');
   await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true}));await page.getByRole('button',{name:'Copy search link'}).click();const copied=await page.getByLabel('Search link',{exact:true}).inputValue();assert.equal(copied,saved);const copiedPage=await context.newPage();await copiedPage.goto(copied);await copiedPage.waitForFunction(()=>document.querySelector('input[type=search]')?.value==='John Hanson');assert.equal(await copiedPage.getByRole('searchbox',{name:'Captain, business, operating name, or registration'}).inputValue(),'John Hanson');await copiedPage.close();
   await input.focus();await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('type')),'search');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'SELECT');
   await page.reload();assert.equal(page.url(),saved);await row.click();await page.waitForURL(/\/guides\/og-0000047/);await page.getByRole('heading',{name:'John Hanson',exact:true}).waitFor();assert.match(await page.locator('main').innerText(),/Oregon registration:\s*OG\.0000047/);await page.getByText('Review data is unavailable.').waitFor();await screenshot(label+'-profile.png');
   await page.getByRole('link',{name:'← Search guides'}).click();await page.waitForURL(saved);await page.goBack();await page.getByRole('heading',{name:'John Hanson',exact:true}).waitFor();await page.goForward();await page.waitForURL(saved);
   await input.fill('zzzxqv nonexistent');await page.getByText('No matching guides.',{exact:false}).waitFor();await page.getByRole('list',{name:'Ways to adjust your search'}).getByRole('button',{name:/Clear search text/}).click();assert.ok(await page.locator('.guide-result').count()>0);
  }
  await page.goto(origin+'/guides?state=Washington&q=Aaron+O%E2%80%99Leary');const wa=page.getByRole('link',{name:/Aaron O’Leary/}).first();await wa.waitFor();assert.match(await wa.getAttribute('href'),/^\/washington\/wa-000/);assert.equal(await wa.locator('.listing-chip').innerText(),'Washington');await wa.click();await page.waitForURL(/\/washington\/wa-000/);await page.getByRole('heading',{name:'Aaron O’Leary',exact:true}).waitFor();assert.match(await page.locator('main').innerText(),/WASHINGTON DIRECTORY LISTING · UNVERIFIED/);await page.getByText('Review data is unavailable.').waitFor();await page.getByRole('link',{name:'Claiming currently unavailable →'}).click();await page.getByText('Profile claim submissions are not currently available.').waitFor();assert.equal(await page.locator('form,input,textarea').count(),0);
  for(const id of ['wa-158','wa-159','wa-160','wa-161','wa-162','wa-999999']){const r=await page.goto(origin+'/washington/'+id);assert.equal(r.status(),404,id)}
  for(const id of ['0003043','0004087','0000053','0003060','0004017','0003982','0000609']){await page.goto(origin+'/guides/og-'+id);assert.equal(await page.getByRole('heading',{name:'Also listed in Washington'}).count(),0,id)}
  await page.goto(origin+'/guides/og-0001116');assert.doesNotMatch(await page.locator('main').innerText(),/Grindstone Lakes/i);
  await page.goto(origin+'/admin');await page.getByRole('heading',{name:'Moderation unavailable'}).waitFor();assert.equal(await page.locator('form,input,button').count(),0);
  for(const marker of pending)assert.ok(!(await page.content()).includes(marker));assert.deepEqual(backend,[]);assert.deepEqual(writes,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close()}
});

// Characterize the fixed target rather than hiding an expected failure behind
// a successful exit code: this assertion passes only while the blocker exists.
test('characterization: unverified deduplication guarantee remains a release blocker', async()=>{
 const body=await (await fetch(origin+'/guides')).text();
 assert.equal(body.includes('Shared captains appear once.'),true,'fixed target no longer matches the reviewed defect');
 console.log('RELEASE BLOCKER: cross-state deduplication guarantee is unsupported');
});
