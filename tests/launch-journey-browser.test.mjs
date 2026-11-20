import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright-core';

const origin=process.env.TEST_BASE_URL,authOrigin=process.env.TEST_API_URL,browserPath=process.env.BROWSER_EXECUTABLE;
for(const value of [origin,authOrigin])if(!value||!/^http:\/\/127\.0\.0\.1:\d+$/.test(value))throw Error('Distinct isolated loopback servers are required');
if(origin===authOrigin||!browserPath)throw Error('Isolated browser configuration is required');
const reviewer='10000000-0000-4000-8000-000000000001',operator='20000000-0000-4000-8000-000000000002',reporter='50000000-0000-4000-8000-000000000005',reviewId='30000000-0000-4000-8000-000000000003',claimId='40000000-0000-4000-8000-000000000004',reportId='60000000-0000-4000-8000-000000000006';
const jwt=id=>`${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fixture`;
const tokens={[reviewer]:jwt(reviewer),[operator]:jwt(operator),[reporter]:jwt(reporter)};

test('synthetic browser connects mapped review, claim, moderation and published rating', {timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 const state={review:null,revision:null,claim:null,report:null,requests:[],blocked:[],errors:[]};
 async function contextFor(actor,viewport){
  const context=await browser.newContext({viewport});
  const session={access_token:tokens[actor],refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actor,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}}};
  await context.addInitScript(({session})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify(session));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__fixtureCopied=text}}})},{session});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===authOrigin){
    if(url.pathname==='/auth/v1/user'&&req.method()==='OPTIONS')return route.fulfill({status:204,headers:{
     'access-control-allow-origin':origin,'access-control-allow-methods':'GET','access-control-allow-headers':'*'
    }});
    if(url.pathname==='/auth/v1/user'&&req.method()==='GET')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify(session.user)});
    state.blocked.push(`auth:${url.pathname}`);return route.abort();
   }
   if(url.origin===origin&&url.pathname==='/api/launch'){
    const input=req.postDataJSON(),headers=req.headers();state.requests.push({actor,operation:input.operation,input});
    if(!['public_reviews','profile_details','review_detail','review_write_availability','claim_availability'].includes(input.operation)&&headers.authorization!==`Bearer ${tokens[actor]}`)return route.fulfill({status:401,contentType:'application/json',body:'{"error":"sign_in_required"}'});
    let data;
    switch(input.operation){
     case 'public_reviews':data={summary:{count:state.review?.status==='published'?1:0,averageQuality:state.review?.status==='published'?state.review.quality:null},reviews:state.review?.status==='published'?[{id:reviewId,quality:state.review.quality,would_book_again:state.review.wouldBookAgain,communication:state.review.ratings?.communication,value_rating:state.review.ratings?.value,body:state.review.body,published_at:'2026-11-17T00:00:00Z',trip_month:state.review.tripMonth?`${state.review.tripMonth}-01`:null,trip_responses:state.review.tripResponses??null}]:[],limit:100};break;
     case 'review_write_availability':data={available:true};break;
     case 'own_review_for_guide':data={review:actor===reviewer&&state.review?{id:reviewId,status:state.review.status}:null};break;
     case 'profile_details':data={details:null,attribution:'captain_declared'};break;
     case 'review_detail':if(state.review?.status!=='published'||input.id!==reviewId)return route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'});data={review:{id:reviewId,quality:state.review.quality,intensity:null,would_book_again:state.review.wouldBookAgain,communication:4,value_rating:3,body:state.review.body,relationship_disclosure:'none',published_at:'2026-11-17T00:00:00Z',trip_month:state.review.tripMonth?`${state.review.tripMonth}-01`:null,trip_responses:{version:1,answers:{effort:{state:'answered',value:2},organization:{state:'answered',value:3},fish_landed:{state:'answered',value:0}}}}};break;
     case 'session':data={authenticated:true,operator:actor===operator};break;
     case 'my_submissions':data={items:actor===reviewer?[...(state.review?[{id:reviewId,kind:'review',status:state.review.status,created_at:'2026-11-17T00:00:00Z',jurisdiction:'OR',source_id:'OG.0002254',review_id:null}]:[]),...(state.revision?[{id:state.revision.id,kind:'revision',status:'pending',created_at:'2026-11-17T00:00:00Z',jurisdiction:'OR',source_id:'OG.0002254',review_id:reviewId}]:[]),...(state.claim?[{id:claimId,kind:'claim',status:'pending',created_at:'2026-11-17T00:00:00Z',jurisdiction:'OR',source_id:'OG.0002254',review_id:null}]:[])]:[],offset:input.offset,limit:input.limit};break;
     case 'submit_review':state.review={...input,status:'pending'};data={id:reviewId,status:'pending'};break;
     case 'submit_revision':if(actor!==reviewer||input.reviewId!==reviewId||state.review?.status!=='published')throw Error('Unexpected synthetic revision');state.revision={...input,id:'70000000-0000-4000-8000-000000000007'};data={id:state.revision.id,status:'pending'};break;
     case 'claim_availability':data={available:true};break;
     case 'claim_status':data={status:state.claim?'pending':'none'};break;
     case 'submit_claim':state.claim=input;data={id:claimId,status:'pending',existing:false};break;
     case 'report_review':if(actor!==reporter||state.review?.status!=='published'||input.reviewId!==reviewId)throw Error('Unexpected synthetic report');data={id:reportId,status:'submitted',existing:!!state.report};state.report={reason:input.reason,status:'submitted'};break;
     case 'operator_queue':data={items:input.kind==='review'&&state.review?.status==='pending'?[{id:reviewId,guide_name:'Fixture Guide',body:state.review.body,quality:state.review.quality,intensity:state.review.intensity,would_book_again:state.review.wouldBookAgain,trip_month:state.review.tripMonth?`${state.review.tripMonth}-01`:null,firsthand_attested:true,relationship_disclosure:'none',trip_responses:null,created_at:'2026-11-17T00:00:00Z'}]:input.kind==='report'&&state.report?.status==='submitted'?[{id:reportId,review_id:reviewId,guide_name:'Fixture Guide',reason:state.report.reason,review_status:state.review.status,public_review_body:state.review.body,created_at:'2026-11-17T00:00:00Z'}]:[],offset:input.offset,limit:input.limit};break;
     case 'operator_decide':if(actor!==operator||input.id!==reviewId)throw Error('Unexpected synthetic moderation action');state.review.status=input.approve?'published':'rejected';data={id:reviewId,status:state.review.status};break;
     case 'resolve_report':if(actor!==operator||input.id!==reportId||!state.report)throw Error('Unexpected synthetic report resolution');state.report.status='resolved';data={id:reportId,status:'resolved'};break;
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
  await page.goto(`${origin}/write-review`,{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Rate your guide'}).waitFor();
  await page.getByRole('searchbox',{name:'Captain, business, operating name, or registration'}).fill('OG.0002254');
  await page.locator('.guide-result[href^="/guides/og-0002254?"][href*="q%3DOG.0002254"]').click();
  const ratingProfile=url=>url.pathname==='/guides/og-0002254'&&url.searchParams.get('intent')==='review'&&url.searchParams.get('returnTo')==='/write-review?q=OG.0002254'&&url.hash==='#write-review';
  await page.waitForURL(ratingProfile);
  await page.getByText('No published reviews yet.').waitFor();
  await page.getByText('Fished with this guide? Be the first to share your experience.').waitFor();
  await page.getByLabel('Overall quality').selectOption('5');
  await page.getByRole('radio',{name:'Yes',exact:true}).check();
  await page.getByText('More ratings (optional)',{exact:true}).click();
  await page.getByLabel('Communication',{exact:true}).selectOption('4');
  await page.getByLabel('Value',{exact:true}).selectOption('3');
  await page.getByLabel('Your relationship to this guide or business').selectOption('none');await page.getByLabel('Your experience').fill('A good firsthand trip.');await page.getByLabel('I personally took this trip.').check();
  await page.getByText('Tell us more',{exact:true}).click();await page.getByLabel('Trip month (optional)').fill('2026-07');
  await page.getByRole('button',{name:'Submit review'}).click();await page.getByText(/Your review is (pending|awaiting review)/).first().waitFor();
  const reviewStatus=page.getByRole('link',{name:'View your review status'});
  await reviewStatus.waitFor();
  assert.equal(await reviewStatus.getAttribute('href'),'#your-submissions');
  assert.equal(state.review.intensity,null);assert.equal(state.review.wouldBookAgain,true);
  assert.equal(state.review.ratingVersion,1);
  assert.deepEqual(state.review.ratings,{communication:4,value:3});
  assert.equal(state.review.sourceId,'OG.0002254');assert.equal(state.review.tripMonth,'2026-07');
  await page.getByRole('link',{name:'Claim this profile'}).click();const claimSection=page.locator('#claim-profile');await claimSection.getByLabel('Your name').fill('Fixture Captain');await claimSection.getByLabel('Your connection to this listing').fill('I operate the guide business shown on this listing.');await claimSection.getByRole('button',{name:'Submit claim request'}).click();await claimSection.getByText('Your claim request is pending review. Your evidence is private.').waitFor();await page.reload();await claimSection.getByText('Your claim request is pending review. Your evidence is private.').waitFor();
  await page.getByText('Sharing options',{exact:true}).click();await page.getByRole('button',{name:'Copy review request link'}).click();assert.equal(await page.evaluate(()=>window.__fixtureCopied),'https://ratemyguidepnw.vercel.app/guides/og-0002254?intent=review#write-review');
  const admin=await contextFor(operator,{width:1280,height:800}),queue=await admin.newPage();queue.on('pageerror',e=>state.errors.push(e.message));await queue.goto(`${origin}/admin`,{waitUntil:'domcontentloaded'});await queue.getByText('Fixture Guide',{exact:false}).waitFor();
  await queue.getByText(/Trip month: 2026-07/).waitFor();await queue.getByLabel('Decision note').fill('Independent synthetic review evidence checked.');await queue.getByRole('button',{name:'Approve'}).click();await queue.getByText('Decision confirmed: published.').waitFor();
  await page.reload({waitUntil:'domcontentloaded'});await page.getByText('A good firsthand trip.').waitFor();await page.getByText('5.0 / 5',{exact:false}).waitFor();await page.getByText('Trip month reported by the angler: 2026-07').waitFor();
  await page.getByRole('button',{name:'Edit your review'}).click();
  await page.getByRole('heading',{name:'Edit your review'}).waitFor();
  assert.equal(await page.getByLabel('Your experience').inputValue(),'A good firsthand trip.');
  await page.getByText('Your changes will be reviewed. Your current published review stays visible while the changes are pending.').waitFor();
  const reporting=await contextFor(reporter,{width:390,height:844}),reportPage=await reporting.newPage();reportPage.on('pageerror',e=>state.errors.push(e.message));await reportPage.goto(`${origin}/guides/og-0002254`,{waitUntil:'domcontentloaded'});
  const ratingSummary=reportPage.getByRole('link',{name:'5.0 / 5 · 1 review'});
  await ratingSummary.waitFor();
  const rate=reportPage.locator('.guide-rate'), share=reportPage.getByRole('button',{name:'Share profile'});
  for(const item of [ratingSummary,rate,share]) {
    const box=await item.boundingBox();
    assert.ok(box && box.y>=0 && box.y+box.height<=844,'rating and actions fit on the first mobile screen');
  }
  await ratingSummary.click();
  await reportPage.waitForURL(url=>url.hash==='#reviews');
  await reportPage.getByRole('button',{name:'Report review'}).click();await reportPage.getByLabel('What’s wrong with this review?').selectOption('other');await reportPage.getByRole('button',{name:'Send report'}).click();await reportPage.getByText('Report sent. We’ll review it.').waitFor();
  await queue.getByLabel('Submission type').selectOption('report');await queue.getByText('Review report · Fixture Guide').waitFor();await queue.getByRole('button',{name:'Resolve report'}).click();await queue.getByText('Report confirmed: resolved. The review was not changed.').waitFor();assert.equal(state.review.status,'published');assert.equal(state.report.status,'resolved');
  await reportPage.waitForLoadState('networkidle');await reporting.close();
  await page.getByRole('button',{name:'Copy review link'}).click();assert.equal(await page.evaluate(()=>window.__fixtureCopied),`https://ratemyguidepnw.vercel.app/guides/og-0002254#review-${reviewId}`);
  await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'domcontentloaded'});await page.getByText('A good firsthand trip.').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Edit your review'}).click();
  const editor=page.locator('form').filter({has:page.getByRole('heading',{name:'Edit your review'})});
  await editor.getByText('More ratings (optional)',{exact:true}).click();
  assert.equal(await editor.getByLabel('Communication',{exact:true}).inputValue(),'4');
  assert.equal(await editor.getByRole('radio',{name:'Yes',exact:true}).isChecked(),true);
  assert.equal(await editor.getByLabel('Organization',{exact:true}).inputValue(),'value:3');
  assert.equal(await editor.getByLabel('How many fish did your group land?',{exact:false}).inputValue(),'0');
  await editor.getByLabel('Value',{exact:true}).selectOption('');
  await page.getByLabel('Your experience').fill('A good firsthand trip with a corrected detail.');
  await page.getByLabel('I personally took this trip.').check();
  await page.getByRole('button',{name:'Submit changes for review'}).click();
  await page.getByText('Your changes are pending review. Your current published review is still visible.').waitFor();
  assert.equal(state.revision.body,'A good firsthand trip with a corrected detail.');
  assert.deepEqual(state.revision.ratings,{value:null});
  assert.equal(Object.hasOwn(state.revision,'wouldBookAgain'),false);
  assert.equal(state.revision.tripResponses.answers.effort.value,2);
  assert.equal(state.revision.tripResponses.answers.organization.value,3);
  assert.equal(state.revision.tripResponses.answers.fish_landed.value,0);
  assert.equal(state.review.body,'A good firsthand trip.');
  if(process.env.BROWSER_SCREENSHOT_DIR){mkdirSync(process.env.BROWSER_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.BROWSER_SCREENSHOT_DIR,'synthetic-launch-mobile.png'),fullPage:true})}
  await page.goto(`${origin}/write-review`,{waitUntil:'networkidle'});await page.getByRole('searchbox',{name:'Captain, business, operating name, or registration'}).fill('OG.0002254');await page.locator('.guide-result[href^="/guides/og-0002254?"][href*="q%3DOG.0002254"]').click();await page.waitForURL(ratingProfile);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await Promise.all([page.waitForLoadState('networkidle'),queue.waitForLoadState('networkidle')]);
  assert.deepEqual(state.blocked,[]);assert.deepEqual(state.errors,[]);await admin.close();await context.close();
 }finally{await browser.close()}
});

test('phone review retry preserves a private draft and checks for a receipt before resubmitting', {timeout:90000},async()=>{
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 const pageErrors=[],blocked=[],attempts=[];
 const stored=new Map();
 let failStatus=false;
 const options={viewport:{width:390,height:844}};
 const context=await browser.newContext(options);
 const sessions=Object.fromEntries([reviewer,reporter].map(id=>[id,{
  access_token:tokens[id],refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,
  expires_at:Math.floor(Date.now()/1000)+3600,
  user:{id,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}},
 }]));
 await context.addInitScript(({sessions,reviewer})=>{
  const id=sessionStorage.getItem('review-fixture-account')??reviewer;
  localStorage.setItem('sb-127-auth-token',JSON.stringify(sessions[id]));
 },{sessions,reviewer});
 const first='OG.0002254',second='OG.0002193';
 const guidePath=id=>'/guides/'+id.toLowerCase().replace('.','-')+'?intent=review#write-review';
 const expectedText='A firsthand review that must stay in this form.';
 const error={error:'service_unavailable'};
 const json=(route,data,status=200)=>route.fulfill({status,json:data,headers:{'access-control-allow-origin':origin}});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  const actor=Object.keys(sessions).find(id=>request.headers().authorization===`Bearer ${tokens[id]}`);
  if(url.origin===authOrigin && url.pathname==='/auth/v1/user'){
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{
    'access-control-allow-origin':origin,'access-control-allow-methods':'GET','access-control-allow-headers':'*',
   }});
   return actor?json(route,sessions[actor].user):json(route,{message:'Unauthorized'},401);
  }
  if(url.origin===origin && url.pathname==='/api/launch'){
   const input=request.postDataJSON();
   const key=`${actor}:${input.sourceId}`;
   switch(input.operation){
    case 'public_reviews': return json(route,{summary:{count:0,averageQuality:null},reviews:[],limit:100});
    case 'profile_details': return json(route,{details:null,attribution:'captain_declared'});
    case 'review_write_availability': return json(route,{available:true});
    case 'claim_availability': return json(route,{available:false});
    case 'claim_status': return json(route,{status:'none'});
    case 'session': return actor?json(route,{authenticated:true,operator:false}):json(route,error,401);
    case 'my_submissions': return json(route,{items:[],offset:0,limit:50});
    case 'own_review_for_guide': {
     if(failStatus){failStatus=false;return json(route,error,503);}
     return json(route,{review:stored.get(key)??null});
    }
    case 'submit_review': {
     attempts.push({actor,source:input.sourceId,body:input.body});
     if(input.sourceId===first&&attempts.length===1)return json(route,error,503);
     if(stored.has(key))return json(route,{error:'duplicate_review'},409);
     const receipt={id:reviewId,status:'pending'};
     stored.set(key,receipt);
     return input.sourceId===second?json(route,error,503):json(route,receipt);
    }
    default: throw Error(`Unexpected review fixture call: ${input.operation}`);
   }
  }
  if(url.origin===origin||['data:','blob:'].includes(url.protocol))return route.continue();
  blocked.push(url.origin);return route.abort();
 });
 try{
  const page=await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror',error=>pageErrors.push(error.message));
  const text=page.getByLabel('Your experience');
  const submit=page.getByRole('button',{name:'Submit review',exact:true});
  const check=page.getByRole('button',{name:'Check before retrying',exact:true});
  const responseFor=operation=>page.waitForResponse(response=>{
   const request=response.request();
   return new URL(response.url()).pathname==='/api/launch'&&request.method()==='POST'&&request.postDataJSON().operation===operation;
  });
  async function fill(id,body){
   await page.goto(origin+guidePath(id),{waitUntil:'domcontentloaded'});
   await text.fill(body);
   await page.getByLabel('Overall quality').selectOption('5');await page.getByRole('radio',{name:'No',exact:true}).check();
   await page.getByLabel('Your relationship to this guide or business').selectOption('none');
   await page.getByLabel('I personally took this trip.').check();
  }
  await fill(first,expectedText);
  await submit.click();
  await check.waitFor();
  assert.equal(await text.inputValue(),expectedText);
  assert.equal(await submit.isDisabled(),true);
  assert.equal(attempts.length,1);
  failStatus=true;
  await Promise.all([responseFor('own_review_for_guide'),check.click()]);
  await page.getByText('We couldn’t check your review. Your draft is still here.').waitFor();
  assert.equal(await submit.isDisabled(),true);
  assert.equal(await text.inputValue(),expectedText);
  await check.click();
  await page.getByText('No review was found. You can submit your draft again.').waitFor();
  assert.equal(attempts.length,1);
  await submit.click();
  await page.locator('#your-submissions').getByText('Your review is awaiting review and is not public.').waitFor();
  assert.deepEqual(attempts.slice(0,2),[0,1].map(()=>({actor:reviewer,source:first,body:expectedText})));

  await fill(second,'A review saved before its response arrived.');
  await submit.click();
  await check.click();
  await page.locator('#your-submissions').getByText('Your review is awaiting review and is not public.').waitFor();
  assert.equal(attempts.length,3);
  assert.equal(await submit.count(),0);

  const other='/guides/og-0000544?intent=review#write-review';
  await page.goto(origin+other,{waitUntil:'domcontentloaded'});
  await text.fill('Private unsent text for this account and guide.');
  await page.goto(origin+'/guides/og-0003225?intent=review#write-review',{waitUntil:'domcontentloaded'});
  await text.waitFor();
  assert.equal(await text.inputValue(),'');
  await page.goto(origin+other,{waitUntil:'domcontentloaded'});
  await text.fill('Private unsent text for the original account.');
  assert.equal(await page.evaluate(()=>JSON.stringify([localStorage,sessionStorage]).includes('Private unsent text')),false);
  await page.evaluate(id=>sessionStorage.setItem('review-fixture-account',id),reporter);
  await page.reload({waitUntil:'domcontentloaded'});
  await text.waitFor();
  assert.equal(await text.inputValue(),'');
  assert.equal(attempts.length,3);
  assert.deepEqual(blocked,[]);
  assert.deepEqual(pageErrors,[]);
 }finally{
  await browser.close();
 }
});
