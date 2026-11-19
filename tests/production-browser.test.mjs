import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdirSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const origin=process.env.TEST_BASE_URL,api=process.env.TEST_API_URL,browserPath=process.env.BROWSER_EXECUTABLE;
for(const value of [origin,api])if(!value||!/^http:\/\/127\.0\.0\.1:\d+$/.test(value))throw new Error('Isolated loopback server URLs are required');
if(origin===api||!browserPath)throw new Error('Distinct owned ports and a browser executable are required');
test('ordinary production data contains no synthetic discovery or unapproved controls',{timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath:browserPath,headless:true});const context=await browser.newContext();
 const blocked=[],writes=[],errors=[],backendRequests=[];
 const pendingMarkers=['Silas Stardance / Riverhawk Guide Service entry only; adjacent pro-staff entries excluded.','Guided Trips: named rivers and general targets; separate lower Middle Fork Willamette paragraph explicitly describes spey fishing for summer steelhead.','About Us paragraphs, reached through the WSGA member link','Synthetic test reason'];
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===api){backendRequests.push(req.url());if(req.method()!=='GET')writes.push(req.method());return route.fulfill({status:503,contentType:'application/json',body:'{"error":"backend unavailable"}'})}
  if(url.origin===origin||['data:','blob:'].includes(url.protocol))return route.continue();
  blocked.push(url.origin);return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Rate your guide.'}).waitFor();
  const ratingLinks=page.getByRole('link',{name:'Rate your guide',exact:true});
  assert.equal(await ratingLinks.count(),2);
  for(const link of await ratingLinks.all())assert.equal(await link.getAttribute('href'),'/write-review');
  await page.locator('main > p').getByRole('link',{name:'Rate your guide',exact:true}).click();
  await page.waitForURL(`${origin}/write-review`);
  await page.getByText('Review submissions are currently unavailable.',{exact:false}).waitFor();
  await page.getByRole('link',{name:'About',exact:true}).click();
  await page.getByText('Rate Your Guide helps anglers find fishing guides, read reviews, and share their experiences. Our goal is to make choosing a fishing guide easier and more transparent.').waitFor();
  await page.setViewportSize({width:375,height:812});await page.goto(origin,{waitUntil:'domcontentloaded'});
  assert.equal(await page.getByRole('link',{name:'Write a Review',exact:true}).count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'home does not overflow');
  await page.setViewportSize({width:1280,height:800});
  await page.goto(`${origin}/guides`,{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Find a captain'}).waitFor();
  const introduction=await page.locator('main > p.lead').innerText();
  assert.match(introduction,/Browse [\d,]+ Oregon and Washington guide listings\./);
  assert.doesNotMatch(introduction,/shared captains appear once/i);
  const species=page.getByLabel('Species');
  await species.selectOption({label:'Halibut'});
  assert.equal(await page.getByRole('link',{name:/Walter Rowe/}).count(),1);
  assert.equal(await page.getByRole('link',{name:/Toby Wyatt/}).count(),0);
  await species.selectOption({label:'All species'});
  const method=page.getByLabel('Source-listed fishing method');
  await method.selectOption({label:'Bottom fishing'});
  assert.equal(await page.getByRole('link',{name:/Russell Pearson/}).count(),1);
  assert.equal(await page.getByRole('link',{name:/Walter Rowe/}).count(),0);
  await method.selectOption({label:'All methods'});
  assert.doesNotMatch(await page.content(),/Pending Secret Species|Rejected Secret Method|Synthetic test fixture|Fixture Source Outfit|Synthetic Captain Alias|Unapproved editorial preview|__editorial_visual__/);
  for(const marker of pendingMarkers)assert.ok(!(await page.content()).includes(marker),'pending research leaked into directory HTML');
  await page.goto(`${origin}/write-review`,{waitUntil:'domcontentloaded'});
  await page.getByText('Review submissions are currently unavailable.',{exact:false}).waitFor();
  await page.getByRole('searchbox',{name:'Captain, business, operating name, or registration'}).fill('OG.0002254');
  assert.doesNotMatch(await page.locator('.guide-result').first().getAttribute('href'),/intent=review/);
  await page.goto(`${origin}/guides`,{waitUntil:'domcontentloaded'});
  function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)])}
  for(const file of [...files('.next/static'),...files('.next/server')])if(/\.(js|json|html|rsc|body)$/.test(file)){
   const body=readFileSync(file,'utf8');assert.doesNotMatch(body,/Pending Secret Species|Rejected Secret Method|Fixture Source Outfit|Synthetic Captain Alias|Unapproved editorial preview|__editorial_visual__|rc-secret-canary-27f7bf9015|BATCH13_CONSOLIDATED_POPULATION/);
   if(file.startsWith('.next/static/'))assert.doesNotMatch(body,/admin_decide_review|admin_decide_claim/);
   for(const marker of pendingMarkers)assert.ok(!body.includes(marker),'pending research leaked into '+file);
  }
  const absent=await page.goto(`${origin}/editorial-changes`,{waitUntil:'domcontentloaded'});assert.equal(absent.status(),404);
  for(const path of ['/intel/buoy-10-chinook','/intel/methodology']){
   const response=await page.goto(`${origin}${path}`,{waitUntil:'domcontentloaded'});assert.equal(response.status(),404,path);
   assert.doesNotMatch(await page.locator('body').innerText(),/Chrome-AI|Chinook Intel|official WDFW creel/i);
  }
  await page.goto(`${origin}/guides/og-0001599`,{waitUntil:'domcontentloaded'});
  for(const marker of pendingMarkers)assert.ok(!(await page.content()).includes(marker),'pending research leaked into profile HTML');
  // The seven research associations have no approved identity decisions.
  for(const id of ['0003043','0004087','0000053','0003060','0004017','0003982','0000609']){
   await page.goto(`${origin}/guides/og-${id}`,{waitUntil:'domcontentloaded'});
   assert.equal(await page.getByRole('heading',{name:'Also listed in Washington'}).count(),0,id);
   assert.doesNotMatch(await page.locator('main').innerText(),/This captain has a matching listing|We maintain a single captain profile/,id);
  }
  // Exercise a reviewed operator-site link without contacting the third party.
  await page.goto(`${origin}/guides/og-0002254`,{waitUntil:'domcontentloaded'});
  const operator=page.getByRole('link',{name:'Visit listed operator page ↗'});
  assert.equal(await operator.getAttribute('href'),'https://fishingwithbeck.com/salmon-fishing/');
  assert.equal(await operator.getAttribute('target'),'_blank');
  assert.match(await operator.getAttribute('rel'),/noopener/);
  await context.route('https://fishingwithbeck.com/salmon-fishing/',route=>route.fulfill({status:200,contentType:'text/html',body:'<title>Intercepted operator link</title>'}));
  const [operatorTab]=await Promise.all([context.waitForEvent('page'),operator.click()]);
  await operatorTab.waitForLoadState('domcontentloaded');
  assert.equal(await operatorTab.title(),'Intercepted operator link');
  await operatorTab.close();
  await page.goto(`${origin}/washington`,{waitUntil:'domcontentloaded'});
  assert.equal(await page.getByRole('heading',{name:'Reviewed cross-state links'}).count(),0);
  assert.doesNotMatch(await page.locator('main').innerText(),/linked Oregon–Washington captain profiles|Shared profiles prevent reviews/);
  await page.goto(`${origin}/guides?state=Washington&q=Daniel+Richman-Benowitz`,{waitUntil:'domcontentloaded'});
  await page.getByText('No matching guides.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('link',{name:/Daniel Richman-Benowitz/}).count(),0);
  await page.goto(`${origin}/guides?q=Daniel+Richman-Benowitz`,{waitUntil:'domcontentloaded'});
  const result=page.getByRole('link',{name:/Daniel Richman-Benowitz/}).first();await result.waitFor();
  assert.equal(await result.locator('.listing-chip').innerText(),'Oregon');
  const missing=await page.goto(`${origin}/guides/og-9999999`,{waitUntil:'domcontentloaded'});assert.equal(missing.status(),404);
  await page.goto(`${origin}/admin`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Moderation unavailable'}).waitFor();assert.equal(await page.locator('form, input, button').count(),0);
  await page.goto(`${origin}/reviews`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Reviews are currently unavailable'}).waitFor();
  for(const [width,height,label] of [[1280,800,'desktop'],[375,812,'mobile']]){
   await page.setViewportSize({width,height});await page.goto(`${origin}/guides?state=Oregon&area=Coos-Coquille&q=John+Hanson`,{waitUntil:'domcontentloaded'});
   await page.getByRole('link',{name:/John Hanson/}).first().waitFor();const saved=page.url();await page.reload({waitUntil:'domcontentloaded'});
   await page.getByRole('link',{name:/John Hanson/}).first().waitFor();assert.equal(page.url(),saved);
   if(process.env.BROWSER_SCREENSHOT_DIR){mkdirSync(process.env.BROWSER_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.BROWSER_SCREENSHOT_DIR,`ordinary-${label}.png`),fullPage:true})}
   await page.getByRole('link',{name:/John Hanson/}).first().click();await page.getByRole('heading',{name:'John Hanson',exact:true}).waitFor();await page.getByText('Review submissions are closed.').waitFor();
   const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');
   assert.match(canonical,/^https:\/\/ratemyguidepnw\.vercel\.app\/guides\/og-[a-z0-9-]+$/);
   assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'),canonical);
   await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__sharedProfileCopy=value}}});
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__sharedProfileUrl=data.url}});
   });
   const rate=page.getByRole('button',{name:'Rate John Hanson'}),share=page.getByRole('button',{name:'Share profile'});
   assert.equal(await rate.isDisabled(),true);
   for(const control of [rate,share]){
    const box=await control.boundingBox();
    assert.ok(box && box.height>=44 && box.y>=0 && box.y+box.height<=height, 'profile action fits first screen');
   }
   await page.getByText('Sharing options',{exact:true}).click();
   await page.getByRole('button',{name:'Copy profile link'}).click();
   assert.equal(await page.evaluate(()=>window.__sharedProfileCopy),canonical);
   await page.getByRole('button',{name:'Share profile'}).click();
   assert.equal(await page.evaluate(()=>window.__sharedProfileUrl),canonical);
   await page.getByText('Sharing dialog closed.').waitFor();
   assert.equal(await page.getByRole('button',{name:'Copy review request link'}).count(),0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'profile does not overflow');
   await page.getByRole('link',{name:'← Search guides'}).click();await page.waitForURL(saved);await page.goBack();await page.getByRole('heading',{name:'John Hanson',exact:true}).waitFor();await page.goForward();await page.waitForURL(saved);
   await page.getByRole('searchbox',{name:'Captain, business, operating name, or registration'}).fill('zzzxqv nonexistent');await page.getByText('No matching guides.',{exact:false}).waitFor();await page.getByRole('list',{name:'Ways to adjust your search'}).getByRole('button',{name:/Clear search text/}).click();assert.ok(await page.locator('.guide-result').count()>0);
  }
  assert.deepEqual(backendRequests,[]);assert.deepEqual(blocked,[]);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close()}
});
