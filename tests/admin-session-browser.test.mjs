import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from 'playwright-core';

const origin=process.env.TEST_BASE_URL,issuer=process.env.TEST_API_URL;
const executablePath=process.env.BROWSER_EXECUTABLE;
for(const url of [origin,issuer])assert.match(url??'',/^http:\/\/127\.0\.0\.1:\d+$/);
assert.notEqual(origin,issuer);
assert.ok(executablePath);
const key='sb-127-auth-token';
const expiresAt=Math.floor(Date.now()/1000)+3600;
const pack=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function sessionFor(id,email){
 return {
  access_token:`${pack({alg:'none'})}.${pack({sub:id,exp:expiresAt,role:'authenticated'})}.fixture`,
  refresh_token:'fixture',token_type:'bearer',expires_at:expiresAt,expires_in:3600,
  user:{id,email,aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-11-19T00:00:00Z',app_metadata:{},user_metadata:{}},
 };
}
const operator=sessionFor('10000000-0000-4000-8000-000000000001','moderator.fixture@example.invalid');
const ordinary=sessionFor('10000000-0000-4000-8000-000000000002','angler.fixture@example.invalid');
const queue=[
 ['20000000-0000-4000-8000-000000000001','Own fixture guide',true],
 ['20000000-0000-4000-8000-000000000002','Other fixture guide',false],
].map(([id,guide_name,is_own_submission])=>({
 id,guide_name,is_own_submission,body:'Synthetic queue fixture.',quality:4,intensity:null,would_book_again:null,
 trip_month:null,relationship_disclosure:'none',trip_responses:null,firsthand_attested:true,created_at:'2026-11-19T00:00:00Z',
}));

test('moderator session, private decisions and recovery work in the phone queue',{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath});
 const context=await browser.newContext({viewport:{width:390,height:667},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const calls=[],unexpected=[],writes=[];
 let holdQueue,queueStarted,sessionUnavailable=false,queueUnavailable=false;
 let queueRows=queue,decisionReply;
 try{
  await context.addInitScript(({origin,key,operator})=>{
   if(location.origin!==origin||localStorage.getItem('fixture-primed'))return;
   localStorage.setItem('fixture-primed','true');
   localStorage.setItem(key,JSON.stringify(operator));
  },{origin,key,operator});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   const bearer=req.headers().authorization;
   const actor=[operator,ordinary].find(session=>bearer==='Bearer '+session.access_token);
   if(url.origin===issuer){
    const headers={'access-control-allow-origin':origin,'access-control-allow-headers':'*',
     'access-control-allow-methods':'GET,POST,OPTIONS'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(url.pathname==='/auth/v1/user'&&actor)return route.fulfill({headers,json:actor.user});
    if(url.pathname==='/auth/v1/logout'&&req.method()==='POST'&&actor){
     calls.push(['logout',url.searchParams.get('scope')]);
     return route.fulfill({status:204,headers});
    }
    if(url.pathname==='/rest/v1/rpc/rmg_account_saved_guides_v1'&&req.method()==='POST'&&actor){
     assert.deepEqual(req.postDataJSON(),{p_action:'list',p_guides:[]});
     return route.fulfill({headers,json:{status:'listed',items:[]}});
    }
   }
   if(url.origin===origin&&url.pathname==='/api/launch'){
    const payload=req.postDataJSON();
    const {operation,offset,limit}=payload;
    calls.push([operation,actor?.user.email]);
    switch(operation){
     case 'session':
      if(sessionUnavailable)return route.fulfill({status:503,json:{error:'service_unavailable'}});
      return route.fulfill({json:{authenticated:true,operator:actor===operator}});
     case 'operator_queue':
      if(actor!==operator)return route.fulfill({status:403,json:{error:'forbidden'}});
      if(holdQueue){queueStarted();await holdQueue}
      if(queueUnavailable)return route.fulfill({status:503,json:{error:'service_unavailable'}});
      return route.fulfill({json:{items:queueRows,offset,limit}});
     case 'operator_decide':
      assert.equal(actor,operator);
      assert.equal(payload.kind,'review');
      assert.equal(payload.id,queue[1].id);
      writes.push(payload);
      assert.ok(decisionReply,'Only an explicitly expected synthetic decision may be sent');
      return decisionReply(route,payload);
     case 'public_reviews':
      return route.fulfill({json:{summary:{count:0,averageQuality:null},reviews:[]}});
     case 'review_write_availability':
      return route.fulfill({json:{available:true}});
     case 'profile_details':
      return route.fulfill({json:{details:null,attribution:'captain_declared'}});
     case 'own_review_for_guide':
      return route.fulfill({json:{review:null}});
     case 'my_submissions':
      return route.fulfill({json:{items:[],offset,limit}});
    }
   }else if(url.origin===origin&&req.method()==='GET')return route.continue();
   unexpected.push([req.method(),url.origin,url.pathname]);return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>unexpected.push(error.message));
  const other=page.locator('article').filter({hasText:'Other fixture guide'});
  const own=page.locator('article').filter({hasText:'Own fixture guide'});
  const note=other.getByRole('textbox',{name:'Private decision note',exact:true});
  const approve=other.getByRole('button',{name:'Approve',exact:true});
  const reject=other.getByRole('button',{name:'Reject',exact:true});
  const checkQueue=other.getByRole('button',{name:'Check pending queue',exact:true});
  const position=async button=>{
   await button.scrollIntoViewIfNeeded();
   const box=await button.boundingBox();
   assert.ok(box);
   return [box.x+box.width/2,box.y+box.height/2];
  };
  async function event(event,session){
   await page.evaluate(({event,session,key})=>{
    localStorage.setItem(key,JSON.stringify(session));
    const channel=new BroadcastChannel(key);
    channel.postMessage({event,session});
    channel.close();
   },{event,session,key});
  }

  await page.goto(origin+'/admin');
  await page.getByText(operator.user.email,{exact:true}).waitFor();
  await own.getByText('Your submission. Another moderator must make the decision.').waitFor();
  assert.equal(await own.getByRole('button',{name:'Approve'}).count(),0);
  assert.equal(await own.getByRole('button',{name:'Reject'}).count(),0);
  await other.getByRole('button',{name:'Approve'}).waitFor();
  assert.equal(await other.getByRole('button',{name:'Approve'}).isEnabled(),true);

  await note.fill('Unsaved synthetic decision note');
  const reads=calls.filter(([op])=>op==='operator_queue').length;
  await event('SIGNED_IN',operator);
  await event('TOKEN_REFRESHED',operator);
  await page.waitForTimeout(150);
  assert.equal(await note.inputValue(),'Unsaved synthetic decision note');
  assert.equal(calls.filter(([op])=>op==='operator_queue').length,reads);

  await page.reload();
  await other.getByRole('button',{name:'Approve'}).waitFor();
  await page.goto(origin+'/guides/og-0002193?intent=review#write-review');
  await page.getByText(operator.user.email,{exact:true}).waitFor();
  await page.goto(origin+'/admin');
  await other.getByRole('button',{name:'Approve'}).waitFor();

  await other.getByText(/Approval requires at least 20 characters.*Rejection requires a reason/).waitFor();
  await approve.focus();
  await page.keyboard.press('Enter');
  await other.getByRole('alert').filter({hasText:/Enter at least 20 characters/}).waitFor();
  assert.equal(await note.evaluate(element=>element===document.activeElement),true);
  assert.equal(await note.getAttribute('aria-invalid'),'true');
  await note.fill('   ');
  await reject.tap();
  await other.getByRole('alert').filter({hasText:'Enter a reason before rejecting.'}).waitFor();
  assert.equal(await note.evaluate(element=>element===document.activeElement),true);
  assert.equal(writes.length,0);

  const evidence='Synthetic test note for the mock decision only.';
  await note.fill(evidence);
  const approvalPoint=await position(approve);
  const rejectionPoint=await position(reject);
  let respond,gotDecision;
  const waiting=new Promise(resolve=>{respond=resolve});
  const sent=new Promise(resolve=>{gotDecision=resolve});
  decisionReply=async route=>{gotDecision();await waiting;return route.abort('connectionreset')};
  await approve.evaluate(button=>{
   // Dispatch in the same task to exercise the guard before a disabled render.
   button.click();
   button.click();
   button.nextElementSibling.click();
  });
  await sent;
  await page.touchscreen.tap(...approvalPoint);
  await page.touchscreen.tap(...rejectionPoint);
  assert.equal(writes.length,1);
  assert.equal(await approve.isDisabled(),true);
  assert.equal(await reject.isDisabled(),true);
  await other.getByRole('status').filter({hasText:'Submitting approval…'}).waitFor();
  respond();
  await other.getByRole('alert').filter({hasText:/The decision could not be confirmed/}).waitFor();
  assert.equal(await note.inputValue(),evidence);
  assert.equal(await approve.isDisabled(),true);
  assert.equal(writes.length,1);

  queueUnavailable=true;
  await checkQueue.tap();
  await other.getByRole('alert').filter({hasText:'The pending queue could not be checked. Try checking again.'}).waitFor();
  assert.equal(await reject.isDisabled(),true);
  queueUnavailable=false;
  await checkQueue.tap();
  await other.getByRole('status').filter({hasText:/This submission is still pending/}).waitFor();
  assert.equal(await approve.isEnabled(),true);
  assert.equal(await note.inputValue(),evidence);
  assert.equal(writes.length,1);

  const rejection='Synthetic rejection reason.';
  await note.fill(rejection);
  decisionReply=(route,payload)=>{
   assert.equal(payload.approve,false);
   assert.equal(payload.reason,rejection);
   queueRows=[queue[0]];
   return route.fulfill({json:{id:payload.id,status:'rejected'}});
  };
  await reject.focus();
  await page.keyboard.press('Space');
  await other.getByRole('status').filter({hasText:'Decision confirmed: rejected.'}).waitFor();
  assert.equal(await reject.count(),0);
  assert.equal(await note.count(),0);
  assert.equal(writes.length,2);

  // Simulate a lost success receipt on another isolated run, where the row is already absent.
  queueRows=queue;
  await page.reload();
  await approve.waitFor();
  await note.fill(evidence);
  decisionReply=route=>{queueRows=[queue[0]];return route.abort('connectionreset')};
  await approve.tap();
  await checkQueue.tap();
  await other.getByRole('status').filter({hasText:/Its outcome could not be confirmed here/}).waitFor();
  assert.equal(await approve.count(),0);
  assert.equal(await reject.count(),0);
  assert.equal(writes.length,3);
  queueRows=queue;

  let release;
  holdQueue=new Promise(resolve=>{release=resolve});
  const started=new Promise(resolve=>{queueStarted=resolve});
  await page.getByRole('button',{name:'Refresh queue'}).click();
  await started;
  await event('SIGNED_IN',ordinary);
  await page.getByText(ordinary.user.email,{exact:true}).waitFor();
  await page.getByText(/This account does not have operator access. Sign out/).waitFor();
  release();
  holdQueue=undefined;
  await page.waitForTimeout(150);
  assert.equal(await page.locator('article').count(),0);
  assert.ok(!calls.some(([op,actor])=>op==='operator_queue'&&actor===ordinary.user.email));

  await event('SIGNED_IN',operator);
  await other.getByRole('button',{name:'Approve'}).waitFor();
  sessionUnavailable=true;
  await page.reload();
  await page.getByText('Operator access is temporarily unavailable.',{exact:true}).waitFor();
  sessionUnavailable=false;
  await page.getByRole('button',{name:'Check access again'}).click();
  await other.getByRole('button',{name:'Approve'}).waitFor();
  await page.getByRole('button',{name:'Sign out'}).click();
  await page.getByRole('textbox',{name:'Email'}).waitFor();
  assert.equal(await page.locator('article').count(),0);
  assert.deepEqual(calls.filter(([op])=>op==='logout'),[['logout','local']]);
  assert.deepEqual(unexpected,[]);
 }finally{
  await context.close();
  await browser.close();
 }
});
