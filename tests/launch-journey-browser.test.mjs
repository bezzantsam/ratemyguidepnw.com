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

async function closeFixtureContext(context){
 // Keep request interception installed until every application document has stopped.
 // Closing a live auth page can otherwise release a late RPC while routes are torn down.
 for(const page of context.pages())if(!page.isClosed())await page.goto('about:blank');
 await context.close();
}
async function closeFixtureBrowser(browser){
 for(const context of browser.contexts())await closeFixtureContext(context);
 await browser.close();
}

test('reviews and edits publish automatically, while flags wait for an authorized keep or remove decision', {timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 const state={review:null,revision:null,claim:null,report:null,requests:[],blocked:[],errors:[]};
 const publicReview=()=>({id:reviewId,quality:state.review.quality,intensity:state.review.intensity,
  would_book_again:state.review.wouldBookAgain,communication:state.review.ratings?.communication??null,
  value_rating:state.review.ratings?.value??null,body:state.review.body,relationship_disclosure:state.review.relationship,
  published_at:'2026-11-20T00:00:00Z',trip_month:state.review.tripMonth?`${state.review.tripMonth}-01`:null,
  trip_responses:state.review.tripResponses??null});
 async function contextFor(actor,viewport){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  const session={access_token:tokens[actor],refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actor,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}}};
  await context.addInitScript(({session,origin})=>{if(location.origin!==origin)return;localStorage.setItem('sb-127-auth-token',JSON.stringify(session));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__fixtureCopied=text}}})},{session,origin});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===authOrigin){
    const allowed=['/auth/v1/user','/rest/v1/rpc/rmg_account_saved_guides_v1'];
    const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'*'};
    if(allowed.includes(url.pathname)&&req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(url.pathname==='/auth/v1/user'&&req.method()==='GET')return route.fulfill({status:200,headers,json:session.user});
    if(url.pathname==='/rest/v1/rpc/rmg_account_saved_guides_v1'&&req.method()==='POST'){
     assert.equal(req.headers().authorization,`Bearer ${tokens[actor]}`);
     assert.deepEqual(req.postDataJSON(),{p_action:'list',p_guides:[]});
     return route.fulfill({status:200,headers,json:{status:'listed',items:[]}});
    }
    state.blocked.push(`auth:${url.pathname}`);return route.abort();
   }
   if(url.origin===origin&&url.pathname==='/api/launch'){
    const input=req.postDataJSON(),headers=req.headers();state.requests.push({actor,operation:input.operation,input});
    if(!['public_reviews','profile_details','review_detail','review_write_availability','claim_availability'].includes(input.operation)&&headers.authorization!==`Bearer ${tokens[actor]}`)return route.fulfill({status:401,json:{error:'sign_in_required'}});
    let data;
    switch(input.operation){
     case 'public_reviews':data={summary:{count:state.review?.status==='published'?1:0,averageQuality:state.review?.status==='published'?state.review.quality:null},reviews:state.review?.status==='published'?[publicReview()]:[],limit:100};break;
     case 'review_write_availability':data={available:true};break;
     case 'own_review_for_guide':data={review:actor===reviewer&&state.review?{id:reviewId,status:state.review.status}:null};break;
     case 'profile_details':data={details:null,attribution:'captain_declared'};break;
     case 'review_detail':if(state.review?.status!=='published'||input.id!==reviewId)return route.fulfill({status:404,json:{error:'not_found'}});data={review:publicReview()};break;
     case 'session':data={authenticated:true,operator:actor===operator};break;
     case 'my_submissions':data={items:actor===reviewer?[...(state.review?[{id:reviewId,kind:'review',status:state.review.status,created_at:'2026-11-20T00:00:00Z',jurisdiction:'OR',source_id:'OG.0002254',review_id:null}]:[]),...(state.revision?[{id:state.revision.id,kind:'revision',status:state.revision.status,created_at:'2026-11-20T00:00:00Z',jurisdiction:'OR',source_id:'OG.0002254',review_id:reviewId}]:[]),...(state.claim?[{id:claimId,kind:'claim',status:'pending',created_at:'2026-11-20T00:00:00Z',jurisdiction:'OR',source_id:'OG.0002254',review_id:null}]:[])]:[],offset:input.offset,limit:input.limit};break;
     case 'submit_review':assert.equal(actor,reviewer);state.review={...input,status:'published'};data={id:reviewId,status:'published'};break;
     case 'submit_revision':
      assert.equal(actor,reviewer);assert.equal(input.reviewId,reviewId);assert.equal(state.review?.status,'published');
      state.revision={...input,id:'70000000-0000-4000-8000-000000000007',status:'approved'};
      state.review={...state.review,...input,ratings:{...state.review.ratings,...input.ratings}};
      data={id:state.revision.id,status:'approved'};break;
     case 'claim_availability':data={available:true};break;
     case 'claim_status':data={status:state.claim?'pending':'none'};break;
     case 'submit_claim':state.claim=input;data={id:claimId,status:'pending',existing:false};break;
     case 'report_review':
      assert.equal(actor,reporter);assert.equal(state.review?.status,'published');assert.equal(input.reviewId,reviewId);
      data={id:reportId,status:'submitted',existing:!!state.report};state.report={id:reportId,reason:input.reason,status:'submitted'};break;
     case 'operator_queue':
      if(actor!==operator)return route.fulfill({status:403,json:{error:'forbidden'}});
      data={items:input.kind==='report'&&state.report?.status==='submitted'?[{id:state.report.id,review_id:reviewId,guide_name:'Fixture Guide',reason:state.report.reason,review_status:state.review.status,public_review_body:state.review.status==='published'?state.review.body:null,created_at:'2026-11-20T00:00:00Z'}]:[],offset:input.offset,limit:input.limit};break;
     case 'operator_decide':throw Error('Automatic publication must not require a manual approval');
     case 'resolve_report':
      if(actor!==operator)return route.fulfill({status:403,json:{error:'forbidden'}});
      assert.equal(input.id,state.report.id);assert.ok(['keep','remove'].includes(input.action));assert.ok(input.reason.trim());
      state.report.status='resolved';if(input.action==='remove')state.review.status='removed';
      data={id:state.report.id,status:'resolved',review_id:reviewId,review_status:state.review.status};break;
     default:throw Error(`Unexpected synthetic operation: ${input.operation}`);
    }
    return route.fulfill({status:200,json:data});
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
  await page.getByLabel('Organization',{exact:true}).selectOption('value:3');
  await page.getByLabel('How many fish did your group land?',{exact:false}).fill('0');
  await page.getByText('More ratings (optional)',{exact:true}).click();
  await page.getByLabel('Communication',{exact:true}).selectOption('4');await page.getByLabel('Value',{exact:true}).selectOption('3');
  await page.getByLabel('Your relationship to this guide or business').selectOption('none');await page.getByLabel('Your experience').fill('A good firsthand trip.');await page.getByLabel('I personally took this trip.').check();
  await page.getByText('Tell us more',{exact:true}).click();await page.getByLabel('Trip month (optional)').fill('2026-07');
  await page.getByRole('button',{name:'Submit review'}).click();
  // No reload, moderator, or queue action is needed to see the submitted review and aggregate.
  await page.locator('#reviews').getByText('A good firsthand trip.',{exact:true}).waitFor();
  await page.getByRole('link',{name:'5.0 / 5 · 1 review'}).waitFor();
  assert.equal(state.review.status,'published');assert.equal(state.requests.some(r=>r.operation==='operator_decide'),false);
  const reviewStatus=page.getByRole('link',{name:'View your review status'});await reviewStatus.waitFor();assert.equal(await reviewStatus.getAttribute('href'),'#your-submissions');
  assert.equal(state.review.intensity,null);assert.equal(state.review.wouldBookAgain,true);assert.equal(state.review.ratingVersion,1);assert.deepEqual(state.review.ratings,{communication:4,value:3});
  assert.equal(state.review.sourceId,'OG.0002254');assert.equal(state.review.tripMonth,'2026-07');
  await page.getByRole('link',{name:'Claim this profile'}).click();const claimSection=page.locator('#claim-profile');await claimSection.getByLabel('Your name').fill('Fixture Captain');await claimSection.getByLabel('Your connection to this listing').fill('I operate the guide business shown on this listing.');await claimSection.getByRole('button',{name:'Submit claim request'}).click();await claimSection.getByText('Your claim request is pending review. Your evidence is private.').waitFor();
  assert.equal(state.claim!==null,true,'claim requests retain their existing separate approval flow');
  await page.getByText('Sharing options',{exact:true}).click();await page.getByRole('button',{name:'Copy review request link'}).click();assert.equal(await page.evaluate(()=>window.__fixtureCopied),'https://ratemyguidepnw.vercel.app/guides/og-0002254?intent=review#write-review');

  const reporting=await contextFor(reporter,{width:390,height:844}),reportPage=await reporting.newPage();reportPage.on('pageerror',e=>state.errors.push(e.message));
  await reportPage.goto(`${origin}/admin`,{waitUntil:'domcontentloaded'});
  await reportPage.getByText('This account does not have operator access. Sign out, then use your authorized moderator email.').waitFor();
  assert.equal(await reportPage.getByRole('button',{name:'Remove review',exact:true}).count(),0);
  assert.equal(state.requests.some(r=>r.actor===reporter&&r.operation==='operator_queue'),false);
  await reportPage.goto(`${origin}/guides/og-0002254`,{waitUntil:'domcontentloaded'});
  const ratingSummary=reportPage.getByRole('link',{name:'5.0 / 5 · 1 review'});await ratingSummary.waitFor();
  for(const item of [ratingSummary,reportPage.locator('.guide-rate'),reportPage.getByRole('button',{name:'Share profile'})]){
    const box=await item.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=844,'rating and actions fit on the first mobile screen');
  }
  await ratingSummary.click();await reportPage.waitForURL(url=>url.hash==='#reviews');
  await reportPage.getByRole('button',{name:'Report review'}).click();await reportPage.getByLabel('What’s wrong with this review?').selectOption('other');await reportPage.getByRole('button',{name:'Send report'}).click();await reportPage.getByText('Report sent. We’ll review it.').waitFor();
  assert.equal(state.review.status,'published','a flag alone must not hide a review or change its score');
  await reportPage.locator('#reviews').getByText('A good firsthand trip.',{exact:true}).waitFor();
  const admin=await contextFor(operator,{width:1280,height:800}),queue=await admin.newPage();queue.on('pageerror',e=>state.errors.push(e.message));await queue.goto(`${origin}/admin`,{waitUntil:'domcontentloaded'});
  assert.equal(await queue.getByLabel('Submission type').inputValue(),'report','admin opens directly on flags');
  await queue.getByText('Review report · Fixture Guide').waitFor();
  await queue.getByLabel('Private decision note').fill('The flag does not identify a reason to remove this review.');
  await queue.getByRole('button',{name:'Keep review and dismiss flag',exact:true}).click();
  await queue.getByText('Flag dismissed. The review remains published.').waitFor();
  assert.equal(state.review.status,'published');assert.equal(state.report.status,'resolved');
  await reportPage.waitForLoadState('networkidle');await closeFixtureContext(reporting);

  await page.getByRole('button',{name:'Copy review link'}).click();assert.equal(await page.evaluate(()=>window.__fixtureCopied),`https://ratemyguidepnw.vercel.app/guides/og-0002254#review-${reviewId}`);
  await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'domcontentloaded'});await page.locator('#reviews').getByText('A good firsthand trip.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Edit your review'}).click();
  const editor=page.locator('form').filter({has:page.getByRole('heading',{name:'Edit your review'})});
  await editor.getByText('More ratings (optional)',{exact:true}).click();assert.equal(await editor.getByLabel('Communication',{exact:true}).inputValue(),'4');assert.equal(await editor.getByRole('radio',{name:'Yes',exact:true}).isChecked(),true);
  const organization=editor.getByLabel('Organization',{exact:true});assert.equal(await organization.inputValue(),'value:3');await organization.selectOption('');
  assert.equal(await editor.getByLabel('How many fish did your group land?',{exact:false}).inputValue(),'0');await editor.getByLabel('Value',{exact:true}).selectOption('');
  await editor.getByLabel('Overall quality').selectOption('4');await editor.getByLabel('Your experience').fill('A good firsthand trip with a corrected detail.');await editor.getByLabel('I personally took this trip.').check();
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Edit your review'}).click();await editor.getByLabel('Your experience').waitFor();
  assert.equal(await editor.getByLabel('Your experience').inputValue(),'A good firsthand trip with a corrected detail.');assert.equal(await editor.getByLabel('Overall quality').inputValue(),'4');
  await editor.getByText('More ratings (optional)',{exact:true}).click();assert.equal(await editor.getByLabel('Value',{exact:true}).inputValue(),'');assert.equal(await editor.getByLabel('Organization',{exact:true}).inputValue(),'');assert.equal(await editor.getByLabel('I personally took this trip.').isChecked(),true);
  await editor.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Review edit: approved'}).getByText('Your changes have been published.',{exact:true}).waitFor();
  await page.locator('#reviews').getByText('A good firsthand trip with a corrected detail.',{exact:true}).waitFor();await page.getByRole('link',{name:'4.0 / 5 · 1 review'}).waitFor();
  assert.equal(state.revision.status,'approved');assert.deepEqual(state.revision.ratings,{value:null});assert.equal(Object.hasOwn(state.revision,'wouldBookAgain'),false);assert.deepEqual(state.revision.tripResponses.answers.organization,{state:'not_applicable'});assert.equal(state.revision.tripResponses.answers.fish_landed.value,0);
  assert.equal(state.review.body,'A good firsthand trip with a corrected detail.');assert.equal(state.requests.some(r=>r.operation==='operator_decide'),false);
  assert.equal(await page.evaluate(()=>Object.entries(localStorage).some(([key,value])=>key.startsWith('rmg:review-draft:v1:')&&value.includes('A good firsthand trip with a corrected detail.'))),false);
  if(process.env.BROWSER_SCREENSHOT_DIR){mkdirSync(process.env.BROWSER_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.BROWSER_SCREENSHOT_DIR,'synthetic-launch-mobile.png'),fullPage:true})}

  // A later independent flag arrives in the synthetic queue. Only an explicit removal changes visibility.
  state.report={id:'80000000-0000-4000-8000-000000000008',reason:'harassment_or_private_info',status:'submitted'};
  await queue.getByRole('button',{name:'Refresh queue',exact:true}).click();await queue.getByText('Review report · Fixture Guide').waitFor();
  await queue.getByLabel('Private decision note').fill('The flagged review includes identifying details requiring removal.');
  await queue.getByRole('button',{name:'Remove review',exact:true}).click();await queue.getByText('Review removed from public view. Flag resolved.').waitFor();
  assert.equal(state.review.status,'removed');assert.equal(state.report.status,'resolved');
  await page.reload({waitUntil:'domcontentloaded'});await page.getByText('No published reviews yet.',{exact:true}).waitFor();
  assert.equal(await page.locator('#reviews').getByText('A good firsthand trip with a corrected detail.',{exact:true}).count(),0);
  assert.deepEqual(state.requests.filter(r=>r.operation==='resolve_report').map(r=>r.input.action),['keep','remove']);
  await Promise.all([page.waitForLoadState('networkidle'),queue.waitForLoadState('networkidle')]);
  assert.deepEqual(state.blocked,[]);assert.deepEqual(state.errors,[]);await closeFixtureContext(admin);await closeFixtureContext(context);
 }finally{await closeFixtureBrowser(browser)}
});

test('phone review drafts survive interruption, reload and auth refresh without crossing account or guide boundaries', {timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath:browserPath,headless:true});
 const pageErrors=[],blocked=[],attempts=[];
 const stored=new Map();
 let failStatus=false;
 const options={viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'};
 const context=await browser.newContext(options);
 const sessions=Object.fromEntries([reviewer,reporter].map(id=>[id,{
  access_token:tokens[id],refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,
  expires_at:Math.floor(Date.now()/1000)+3600,
  user:{id,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}},
 }]));
 await context.addInitScript(({sessions,reviewer,origin})=>{
  if(location.origin!==origin||localStorage.getItem('review-fixture-primed'))return;
  localStorage.setItem('review-fixture-primed','true');
  localStorage.setItem('sb-127-auth-token',JSON.stringify(sessions[reviewer]));
 },{sessions,reviewer,origin});
 const first='OG.0002254',second='OG.0002193';
 let rejectedLookupCount=0;
 const previousRejection={id:'70000000-0000-4000-8000-000000000007',status:'rejected'};
 stored.set(reviewer+':'+first,previousRejection);
 const guidePath=id=>'/guides/'+id.toLowerCase().replace('.','-')+'?intent=review#write-review';
 const expectedText='A firsthand review that must stay in this form.';
 const error={error:'service_unavailable'};
 const json=(route,data,status=200)=>route.fulfill({status,json:data,headers:{'access-control-allow-origin':origin}});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  const actor=Object.keys(sessions).find(id=>request.headers().authorization===`Bearer ${tokens[id]}`);
  if(url.origin===authOrigin){
   const allowed=['/auth/v1/user','/auth/v1/logout','/rest/v1/rpc/rmg_account_saved_guides_v1'];
   const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'*'};
   if(allowed.includes(url.pathname)&&request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(url.pathname==='/auth/v1/user'&&request.method()==='GET')return actor?json(route,sessions[actor].user):json(route,{message:'Unauthorized'},401);
   if(url.pathname==='/auth/v1/logout'&&request.method()==='POST')return route.fulfill({status:204,headers});
   if(url.pathname==='/rest/v1/rpc/rmg_account_saved_guides_v1'&&request.method()==='POST'){
    assert.ok(actor,'only known synthetic accounts may read a shortlist');
    assert.deepEqual(request.postDataJSON(),{p_action:'list',p_guides:[]});
    return route.fulfill({status:200,headers,json:{status:'listed',items:[]}});
   }
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
    case 'my_submissions': return json(route,{items:actor===reviewer?[{...previousRejection,kind:'review',created_at:'2026-11-19T00:00:00Z',jurisdiction:'OR',source_id:first,review_id:null}]:[],offset:0,limit:50});
    case 'own_review_for_guide': {
     if(failStatus){failStatus=false;return json(route,error,503);}
     const review=stored.get(key)??null;
     // Older servers return the rejected row. The current lookup returns only blocking reviews.
     if(review?.status==='rejected'&&++rejectedLookupCount>1)return json(route,{review:null});
     return json(route,{review});
    }
    case 'submit_review': {
     attempts.push({actor,source:input.sourceId,body:input.body});
     if(input.sourceId===first&&attempts.length===1)return json(route,error,503);
     if(stored.has(key)&&stored.get(key).status!=='rejected')return json(route,{error:'duplicate_review'},409);
     const receipt={id:reviewId,status:'published'};
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
  const draftPrefix='rmg:review-draft:v1:';
  const draftEntries=()=>page.evaluate(prefix=>Object.entries(localStorage).filter(([key])=>key.startsWith(prefix)),draftPrefix);
  const saved=page.getByText('Draft saved on this device.',{exact:true});
  const discard=page.getByRole('button',{name:'Discard draft',exact:true});
  async function authEvent(event,actor){
   await page.evaluate(({event,session})=>{
    const key='sb-127-auth-token';
    if(session)localStorage.setItem(key,JSON.stringify(session));else localStorage.removeItem(key);
    const channel=new BroadcastChannel(key);
    channel.postMessage({event,session});channel.close();
   },{event,session:actor?sessions[actor]:null});
  }
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
  // This is still an unfinished draft: no submit or explicit save has occurred.
  await fill(first,expectedText);
  await page.getByLabel('Safety',{exact:true}).selectOption('4');
  await page.getByLabel('Organization',{exact:true}).selectOption('value:3');
  await page.getByLabel('How many fish did your group land?',{exact:false}).fill('0');
  await page.getByText('More ratings (optional)',{exact:true}).click();
  await page.getByLabel('Communication',{exact:true}).selectOption('2');
  await page.getByText('Tell us more',{exact:true}).click();
  await page.getByLabel('Trip month (optional)').fill('2026-07');
  await page.getByLabel('Trip intensity (optional)').selectOption('3');
  await page.getByLabel('Was a dog present?',{exact:true}).selectOption('value:no');
  await page.getByLabel('What duration did you agree on, in minutes?',{exact:true}).selectOption('value');
  // Persist an incomplete optional answer as typed, without submission validation erasing it.
  await page.reload({waitUntil:'domcontentloaded'});
  await text.waitFor();
  assert.equal(await text.inputValue(),expectedText);
  assert.equal(await page.getByLabel('Overall quality').inputValue(),'5');
  assert.equal(await page.getByRole('radio',{name:'No',exact:true}).isChecked(),true);
  assert.equal(await page.getByLabel('Your relationship to this guide or business').inputValue(),'none');
  assert.equal(await page.getByLabel('I personally took this trip.').isChecked(),true);
  assert.equal(await page.getByLabel('Safety',{exact:true}).inputValue(),'4');
  assert.equal(await page.getByLabel('Organization',{exact:true}).inputValue(),'value:3');
  assert.equal(await page.getByLabel('How many fish did your group land?',{exact:false}).inputValue(),'0');
  await page.getByText('More ratings (optional)',{exact:true}).click();
  assert.equal(await page.getByLabel('Communication',{exact:true}).inputValue(),'2');
  await page.getByText('Tell us more',{exact:true}).click();
  assert.equal(await page.getByLabel('Trip month (optional)').inputValue(),'2026-07');
  assert.equal(await page.getByLabel('Trip intensity (optional)').inputValue(),'3');
  assert.equal(await page.getByLabel('Was a dog present?',{exact:true}).inputValue(),'value:no');
  assert.equal(await page.getByLabel('What duration did you agree on, in minutes?',{exact:true}).inputValue(),'value');
  assert.equal(await page.getByLabel('Minutes',{exact:true}).inputValue(),'');
  await page.getByLabel('What duration did you agree on, in minutes?',{exact:true}).selectOption('');
  await page.locator('#your-submissions').getByText('rejected',{exact:true}).waitFor();
  assert.equal(attempts.length,0,'a prior rejection must keep the fresh draft editable on reload');

  // Simulate browser lifecycle notifications and Supabase's same-account refocus notifications.
  // Real iOS process eviction is represented separately by a complete page reload above.
  await text.focus();
  await text.evaluate(element=>{
   window.__reviewDraftNode=element;element.setSelectionRange(4,10);
   window.__reviewDraftRemovals=0;
   new MutationObserver(()=>{if(!element.isConnected)window.__reviewDraftRemovals++}).observe(document.body,{childList:true,subtree:true});
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
   document.dispatchEvent(new Event('visibilitychange'));
   window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
   document.dispatchEvent(new Event('visibilitychange'));
   window.dispatchEvent(new Event('focus'));
  });
  await authEvent('SIGNED_IN',reviewer);
  await authEvent('TOKEN_REFRESHED',reviewer);
  await page.waitForTimeout(200);
  assert.equal(await text.inputValue(),expectedText);
  assert.deepEqual(await text.evaluate(element=>({sameNode:element===window.__reviewDraftNode,focused:element===document.activeElement,selection:[element.selectionStart,element.selectionEnd],removals:window.__reviewDraftRemovals})),{sameNode:true,focused:true,selection:[4,10],removals:0});
  await saved.waitFor();
  assert.equal((await draftEntries()).length,1);
  await submit.click();
  await check.waitFor();
  assert.equal(await text.inputValue(),expectedText);
  assert.equal(await submit.isDisabled(),true);
  assert.equal(attempts.length,1);
  await page.reload({waitUntil:'domcontentloaded'});
  await check.waitFor();
  assert.equal(await text.inputValue(),expectedText);
  assert.equal(await submit.isDisabled(),true,'reload must retain the uncertain-submission retry guard');
  assert.equal(attempts.length,1);
  failStatus=true;
  await Promise.all([responseFor('own_review_for_guide'),check.click()]);
  await page.getByText('We couldn’t check your review. Your draft is still here.').waitFor();
  assert.equal(await submit.isDisabled(),true);
  assert.equal(await text.inputValue(),expectedText);
  await check.click();
  await page.getByText('You can submit your draft again.',{exact:true}).waitFor();
  assert.equal(attempts.length,1);
  await submit.click();
  await page.locator('#your-submissions').getByText('Your review is published.').waitFor();
  assert.deepEqual(attempts.slice(0,2),[0,1].map(()=>({actor:reviewer,source:first,body:expectedText})));
  assert.deepEqual(await draftEntries(),[],'a confirmed receipt clears the saved draft');
  assert.equal(await page.locator('#your-submissions').getByText('rejected',{exact:true}).count(),1,'the earlier rejection appears once alongside the active review');
  assert.equal(await submit.count(),0,'a published replacement must keep its usual edit flow');

  await fill(second,'A review saved before its response arrived.');
  await submit.click();
  await check.click();
  await page.locator('#your-submissions').getByText('Your review is published.').waitFor();
  assert.equal(attempts.length,3);
  assert.equal(await submit.count(),0);
  assert.deepEqual(await draftEntries(),[],'receipt recovery also clears the saved draft');

  const other='/guides/og-0000544?intent=review#write-review';
  const privateText='Private unsent text for this account and guide.';
  await page.goto(origin+other,{waitUntil:'domcontentloaded'});
  await text.fill(privateText);
  await page.goto(origin+'/guides/og-0003225?intent=review#write-review',{waitUntil:'domcontentloaded'});
  await text.waitFor();
  assert.equal(await text.inputValue(),'','a different guide must not inherit a draft');
  await text.fill('A separate draft for the second guide.');
  await page.goto(origin+other,{waitUntil:'domcontentloaded'});
  await text.waitFor();
  assert.equal(await text.inputValue(),privateText,'returning to the original guide restores only its draft');
  assert.equal((await draftEntries()).length,2);
  await authEvent('SIGNED_IN',reporter);
  await page.waitForTimeout(200);
  await text.waitFor();
  assert.equal(await text.inputValue(),'','another signed-in account must not see the original account draft');
  const replacement='A draft belonging to the second account.';
  await text.fill(replacement);
  await page.reload({waitUntil:'domcontentloaded'});
  await text.waitFor();
  assert.equal(await text.inputValue(),replacement);
  await discard.click();
  assert.equal(await text.inputValue(),'');
  await page.reload({waitUntil:'domcontentloaded'});
  await text.waitFor();
  assert.equal(await text.inputValue(),'','discarded content must not return on reload');
  await text.fill('This draft must disappear when its account signs out.');
  await page.locator('#write-review').getByRole('button',{name:'Sign out',exact:true}).click();
  await page.locator('#write-review').getByRole('button',{name:'Email me a sign-in link'}).waitFor();
  assert.equal(await text.count(),0);
  assert.ok(!(await draftEntries()).some(([,value])=>value.includes('This draft must disappear')));
  await authEvent('SIGNED_IN',reporter);
  await text.waitFor();
  assert.equal(await text.inputValue(),'');

  // Invalid stored JSON must not crash the form or be shown as a recovered draft.
  await text.fill('Temporary draft used to locate its scoped storage key.');
  const entry=(await draftEntries()).find(([,value])=>value.includes('Temporary draft used to locate'));
  assert.ok(entry);
  await page.goto(origin+'/write-review',{waitUntil:'domcontentloaded'});
  await page.evaluate(key=>localStorage.setItem(key,'{invalid json'),entry[0]);
  await page.goto(origin+other,{waitUntil:'domcontentloaded'});
  await text.waitFor();
  assert.equal(await text.inputValue(),'');

  // Storage failure leaves the current form editable and never falsely reports a saved draft.
  await page.evaluate(prefix=>{
   const setItem=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&key.startsWith(prefix))throw new DOMException('Synthetic storage limit','QuotaExceededError');
    return setItem.call(this,key,value);
   };
  },draftPrefix);
  await text.fill('Still editable when browser storage is unavailable.');
  assert.equal(await text.inputValue(),'Still editable when browser storage is unavailable.');
  await page.getByText('This browser cannot save your draft. Keep this page open to avoid losing it.',{exact:true}).waitFor();
  assert.equal(await saved.count(),0);
  assert.equal(attempts.length,3);
  assert.deepEqual(blocked,[]);
  assert.deepEqual(pageErrors,[]);
 }finally{
  await closeFixtureBrowser(browser);
 }
});
