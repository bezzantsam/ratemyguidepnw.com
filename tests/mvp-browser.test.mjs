import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const origin='http://127.0.0.1:3157';
const fakeApi='http://127.0.0.1:59999';
const executablePath=process.env.BROWSER_EXECUTABLE;
if(!executablePath) throw new Error('Set BROWSER_EXECUTABLE to a local Chromium/Chrome executable. Serve the isolated build on 127.0.0.1:3157.');

test('public MVP discovery and fail-closed identity flow in a browser', {timeout:90000}, async()=>{
 const browser=await chromium.launch({executablePath,headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 const requests=[];const blocked=[];const errors=[];
 await context.route('**/*',async route=>{
  const request=route.request();const url=new URL(request.url());
  if(url.origin===fakeApi){
   requests.push({method:request.method(),path:url.pathname,query:url.search});
   if(request.method()!=='GET')return route.fulfill({status:403,body:'Writes forbidden in browser tests'});
   if(url.pathname==='/rest/v1/guides')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'fixture-john',full_name:'John Hanson',outfit_name:"Jack's Guide Service"}])});
   if(url.pathname==='/rest/v1/public_angler_reviews')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'fixture-review',body:'Local fixture review for navigation test',quality:4,published_at:'2024-01-01T00:00:00Z',would_book_again:true}])});
   return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  }
  if(url.origin===origin||url.protocol==='data:'||url.protocol==='blob:')return route.continue();
  blocked.push(url.origin);return route.abort();
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Find a captain'}).waitFor();
  await page.goto(`${origin}/guides`,{waitUntil:'domcontentloaded'});
  const q=page.getByRole('searchbox',{name:'Captain, business, operating name, or registration'});
  await q.fill('John Hanson');await page.getByRole('link',{name:/John Hanson/}).first().waitFor();
  await q.fill('Billy Davis');await page.getByRole('link',{name:/William Davis/}).first().waitFor();
  await q.fill('John Hansno');await page.getByRole('link',{name:/John Hanson/}).first().waitFor();
  await q.fill('zzzxqv nonexistent');await page.getByText('No matching guides.',{exact:false}).waitFor();
  await q.fill('');await page.getByRole('button',{name:'Oregon',exact:true}).click();
  await page.getByLabel('Imported source area / notes (unverified)').selectOption({label:'Coos-Coquille'});
  await q.fill('John Hanson');await page.getByRole('link',{name:/John Hanson/}).first().waitFor();
  await page.getByLabel('Imported source area / notes (unverified)').selectOption({label:'All areas'});
  await q.fill('');await page.getByLabel('Advertised fishing water (pilot)').selectOption({label:'Wilson River'});
  assert.ok(await page.locator('.guide-result').count()>0);
  await page.getByRole('button',{name:'Washington',exact:true}).click();
  await q.fill('Aaron O’Leary');
  const wa=page.getByRole('link',{name:/Aaron O’Leary/}).first();await wa.waitFor();
  const waHref=await wa.getAttribute('href');assert.match(waHref,/^\/washington\/wa-/);
  await page.getByRole('button',{name:'Oregon',exact:true}).click();await q.fill('John Hanson');
  await page.getByRole('link',{name:/John Hanson/}).first().click();
  await page.getByRole('heading',{name:'John Hanson',exact:true}).waitFor();
  await page.getByText('Local fixture review for navigation test').waitFor();
  assert.ok(requests.some(r=>r.path==='/rest/v1/guides'&&r.query.includes('og-0000047')),'mocked Oregon guide request was exercised');
  assert.ok(requests.some(r=>r.path==='/rest/v1/public_angler_reviews'),'mocked review request was exercised');
  const priorReviews=requests.filter(r=>r.path==='/rest/v1/public_angler_reviews').length;
  await Promise.all([
   page.waitForResponse(response=>response.url().startsWith(`${fakeApi}/rest/v1/guides?`) && response.url().includes('og-0000050')),
   page.goto(`${origin}/guides/og-0000050`,{waitUntil:'domcontentloaded'}),
  ]);
  await page.getByRole('heading',{name:'Shea Fisher',exact:true}).waitFor();
  await page.getByText('Review data is unavailable.').waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.getByText('Local fixture review for navigation test').count(),0);
  assert.equal(requests.filter(r=>r.path==='/rest/v1/public_angler_reviews').length,priorReviews,'mismatched guide must not trigger a review lookup');
  await page.getByRole('link',{name:'← Search guides'}).click();
  await page.getByRole('button',{name:'Washington',exact:true}).click();await q.fill('Aaron O’Leary');
  const before=requests.length;await page.getByRole('link',{name:/Aaron O’Leary/}).first().click();
  await page.getByRole('heading',{name:'Aaron O’Leary',exact:true}).waitFor();
  await page.getByText('Review data is unavailable.').waitFor();
  assert.equal(await page.getByText('Local fixture review for navigation test').count(),0);
  await page.getByText('Review submissions are not currently available.').waitFor();
  await page.getByRole('link',{name:'Claim this profile →'}).click();
  await page.getByText('Profile claim submissions are not currently available.').waitFor();
  await page.waitForTimeout(300);
  assert.deepEqual(requests.slice(before).filter(r=>r.path.startsWith('/rest/v1/')),[],'Washington profile and claim must not query guide data');
  assert.deepEqual(requests.filter(r=>r.method!=='GET'),[],'browser must not issue database writes');
  assert.deepEqual(blocked,[],'no external network requests');assert.deepEqual(errors,[],'no uncaught page errors');
  await page.setViewportSize({width:375,height:812});await page.goto(`${origin}/guides`,{waitUntil:'domcontentloaded'});
  await q.waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'mobile page does not overflow horizontally');
  await q.focus();await page.keyboard.type('John Hanson');
  await page.getByRole('link',{name:/John Hanson/}).first().waitFor();
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(()=>document.activeElement?.tagName==='SELECT'),'keyboard moves from search to area filter');
 }finally{await context.close();await browser.close()}
});
