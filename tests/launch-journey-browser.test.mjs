import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright-core';

const origin=process.env.TEST_BASE_URL,authOrigin=process.env.TEST_API_URL,browserPath=process.env.BROWSER_EXECUTABLE;
for(const value of [origin,authOrigin])if(!value||!/^http:\/\/127\.0\.0\.1:\d+$/.test(value))throw Error('Distinct isolated loopback servers are required');
if(origin===authOrigin||!browserPath)throw Error('Isolated browser configuration is required');
const reviewer='10000000-0000-4000-8000-000000000001',operator='20000000-0000-4000-8000-000000000002',reviewId='30000000-0000-4000-8000-000000000003',claimId='40000000-0000-4000-8000-000000000004';
const jwt=id=>`${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fixture`;
const tokens={[reviewer]:jwt(reviewer),[operator]:jwt(operator)};

test('synthetic browser connects mapped review, claim, moderation and published rating', {timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 const state={review:null,claim:null,requests:[],blocked:[],errors:[]};
 async function contextFor(actor,viewport){
  const context=await browser.newContext({viewport});
  const session={access_token:tokens[actor],refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actor,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}}};
  await context.addInitScript(({session})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify(session));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__fixtureCopied=text}}})},{session});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===authOrigin){if(url.pathname==='/auth/v1/user')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(session.user)});state.blocked.push(`auth:${url.pathname}`);return route.abort()}
   if(url.origin===origin&&url.pathname==='/api/launch'){
    const input=req.postDataJSON(),headers=req.headers();state.requests.push({actor,operation:input.operation,input});
    if(!['public_reviews','profile_details','review_detail'].includes(input.operation)&&headers.authorization!==`Bearer ${tokens[actor]}`)return route.fulfill({status:401,contentType:'application/json',body:'{"error":"sign_in_required"}'});
    let data;
    switch(input.operation){
     case 'public_reviews':data={summary:{count:state.review?.status==='published'?1:0,averageQuality:state.review?.status==='published'?state.review.quality:null},reviews:state.review?.status==='published'?[{id:reviewId,quality:state.review.quality,body:state.review.body,published_at:'2026-11-17T00:00:00Z',trip_responses:state.review.tripResponses??null}]:[],limit:100};break;
     case 'profile_details':data={details:null,attribution:'captain_declared'};break;
     case 'review_detail':if(state.review?.status!=='published'||input.id!==reviewId)return route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'});data={review:{id:reviewId,quality:state.review.quality,intensity:null,would_book_again:null,body:state.review.body,relationship_disclosure:'none',published_at:'2026-11-17T00:00:00Z',trip_responses:null}};break;
     case 'session':data={authenticated:true,operator:actor===operator};break;
     case 'my_submissions':data={items:actor===reviewer?[...(state.review?[{id:reviewId,kind:'review',status:state.review.status,created_at:'2026-11-17T00:00:00Z',jurisdiction:'OR',source_id:'OG.0002254',review_id:null}]:[]),...(state.claim?[{id:claimId,kind:'claim',status:'pending',created_at:'2026-11-17T00:00:00Z',jurisdiction:'OR',source_id:'OG.0002254',review_id:null}]:[])]:[],offset:input.offset,limit:input.limit};break;
     case 'submit_review':state.review={...input,status:'pending'};data={id:reviewId,status:'pending'};break;
     case 'submit_claim':state.claim=input;data={id:claimId,status:'pending',existing:false};break;
     case 'operator_queue':data={items:input.kind==='review'&&state.review?.status==='pending'?[{id:reviewId,guide_name:'Fixture Guide',body:state.review.body,quality:state.review.quality,firsthand_attested:true,relationship_disclosure:'none',trip_responses:null,created_at:'2026-11-17T00:00:00Z'}]:[],offset:input.offset,limit:input.limit};break;
     case 'operator_decide':if(actor!==operator||input.id!==reviewId)throw Error('Unexpected synthetic moderation action');state.review.status=input.approve?'published':'rejected';data={id:reviewId,status:state.review.status};break;
     default:throw Error(`Unexpected synthetic operation: ${input.operation}`);
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   }
   if(url.origin===origin||['data:','blob:'].includes(url.protocol))return route.continue();state.blocked.push(url.origin);return route.abort();
  });
  return context;
 }
 try{
  const context=await contextFor(reviewer,{width:1280,height:800}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>state.errors.push(e.message));
  await page.goto(`${origin}/guides/og-0002254?intent=review#write-review`,{waitUntil:'domcontentloaded'});
  await page.getByText('No published reviews yet.').waitFor();
  await page.getByLabel('Overall quality').selectOption('5');await page.getByLabel('Your relationship to this guide or business').selectOption('none');await page.getByLabel('Your experience').fill('A good firsthand trip.');await page.getByLabel('I personally took this trip.').check();
  await page.getByRole('button',{name:'Submit review'}).click();await page.getByText('Your review is pending. It is not on the public page.').waitFor();
  assert.equal(state.review.intensity,null);assert.equal(state.review.wouldBookAgain,null);assert.equal(state.review.sourceId,'OG.0002254');
  await page.getByLabel('Your name').fill('Fixture Captain');await page.getByLabel('Your connection to this listing').fill('I operate the guide business shown on this listing.');await page.getByRole('button',{name:'Submit claim request'}).click();await page.getByText('Your claim request is pending review.').waitFor();
  await page.getByRole('button',{name:'Copy review request link'}).click();assert.equal(await page.evaluate(()=>window.__fixtureCopied),'https://ratemyguidepnw.com/guides/og-0002254?intent=review#write-review');
  const admin=await contextFor(operator,{width:1280,height:800}),queue=await admin.newPage();queue.on('pageerror',e=>state.errors.push(e.message));await queue.goto(`${origin}/admin`,{waitUntil:'domcontentloaded'});await queue.getByText('Fixture Guide',{exact:false}).waitFor();
  await queue.getByLabel('Decision note').fill('Independent synthetic review evidence checked.');await queue.getByRole('button',{name:'Approve'}).click();await queue.getByText('Decision confirmed: published.').waitFor();
  await page.reload({waitUntil:'domcontentloaded'});await page.getByText('A good firsthand trip.').waitFor();await page.getByText('5.0 / 5',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Copy review link'}).click();assert.equal(await page.evaluate(()=>window.__fixtureCopied),`https://ratemyguidepnw.com/guides/og-0002254#review-${reviewId}`);
  await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'domcontentloaded'});await page.getByText('A good firsthand trip.').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.BROWSER_SCREENSHOT_DIR){mkdirSync(process.env.BROWSER_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.BROWSER_SCREENSHOT_DIR,'synthetic-launch-mobile.png'),fullPage:true})}
  assert.deepEqual(state.blocked,[]);assert.deepEqual(state.errors,[]);await admin.close();await context.close();
 }finally{await browser.close()}
});
