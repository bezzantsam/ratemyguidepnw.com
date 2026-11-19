import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const origin=process.env.TEST_BASE_URL;
const authOrigin=process.env.TEST_API_URL;
const mode=process.env.TEST_REVIEW_MODE;
const executablePath=process.env.BROWSER_EXECUTABLE;
if(!origin||!authOrigin||![origin,authOrigin].every(value=>/^http:\/\/127\.0\.0\.1:\d+$/.test(value))||origin===authOrigin||!executablePath||!['enabled','disabled'].includes(mode))throw Error('Use distinct isolated loopback servers, a local browser and an explicit test mode.');

test(`rating-first discovery and profile availability (${mode})`,{timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath,headless:true});
 const blocked=[];
 try {
  for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
   const context=await browser.newContext({viewport});
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){blocked.push(url.origin);return route.abort()}
    if(mode==='enabled'&&url.pathname==='/api/launch'){
     const input=request.postDataJSON();let status=200,data;
     if(input.operation==='review_write_availability')data={available:input.jurisdiction==='OR'};
     else if(input.operation==='public_reviews'&&input.jurisdiction==='OR')data={summary:{count:0,averageQuality:null},reviews:[],limit:100};
     else if(input.operation==='profile_details')data={details:null,attribution:'captain_declared'};
     else {status=503;data={error:'launch_unavailable'}}
     return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    }
    return route.continue();
   });
   const page=await context.newPage();
   await page.goto(origin,{waitUntil:'networkidle'});
   await page.getByRole('heading',{name:'Rate your guide.'}).waitFor();
   assert.ok(await page.getByRole('heading',{name:'How was your trip?'}).count());
   assert.ok(await page.getByRole('heading',{name:'Captain or guide?'}).count());
   assert.ok(await page.getByRole('heading',{name:'How was your trip?'}).evaluate((e)=>!!(e.compareDocumentPosition(document.querySelector('#captain-listing-heading'))&Node.DOCUMENT_POSITION_FOLLOWING)));
   if(mode==='disabled')assert.ok(await page.getByText('Review submissions are not open yet.').count());
   const q=page.getByRole('searchbox');
   for(const [query, name, slug] of [['Douglas Wolfe','Douglas Wolfe','og-0000359'],['Dre Menefee','Keondre Menefee','og-0003348']]){
    await q.fill(query);
    const result=page.locator('.guide-result').filter({has:page.getByRole('heading',{name,exact:true})});
    await result.click();
    await page.waitForURL(url=>url.pathname===`/guides/${slug}`);
    await page.getByRole('heading',{name,exact:true}).waitFor();
    await page.getByRole('link',{name:'← Back to rating search'}).click();
    await page.waitForURL(url=>url.pathname==='/'&&url.searchParams.get('q')===query);
   }
   await q.fill('');
   await page.getByLabel('Species').selectOption({label:'Halibut'});
   await page.locator('.guide-result').filter({hasText:'Walter Rowe'}).click();
   await page.waitForURL(url=>url.pathname==='/guides/og-0003297');
   await page.getByRole('heading',{name:'Walter Rowe',exact:true}).waitFor();
   await page.getByRole('link',{name:'← Back to rating search'}).click();
   await page.waitForURL(url=>url.pathname==='/'&&url.searchParams.get('species')==='Halibut');
   await page.getByLabel('Species').selectOption({label:'All species'});
   await q.fill('Scott Wolfe');
   const match=page.locator('.guide-result').filter({hasText:'Douglas Wolfe'});
   await match.waitFor();assert.equal(await match.count(),1);
   assert.match(await match.innerText(),/Editorial search name supplied by Sam: Scott Wolfe/);
   for(const area of ['Coos','Coquille','Umpqua']){await q.fill(`Scott ${area}`);await match.waitFor()}
   await q.fill('Scott Wolfe');await match.waitFor();
   const href=await match.getAttribute('href');assert.ok(href.startsWith('/guides/og-0000359'));
   if(mode==='enabled')assert.match(href,/intent=review#write-review$/);else assert.doesNotMatch(href,/intent=review/);
   await match.click();await page.waitForURL(/\/guides\/og-0000359/);
   if(mode==='enabled'){
    const action=page.getByRole('link',{name:'Rate Douglas Wolfe'});await action.waitFor();assert.equal(await action.getAttribute('href'),'#write-review');
    assert.ok(await action.evaluate(e=>!!(e.compareDocumentPosition(document.querySelector('#reviews'))&Node.DOCUMENT_POSITION_FOLLOWING)));
    await page.getByText('Sign in to share a firsthand experience with this guide.').waitFor();
   }else{
    assert.ok(await page.getByRole('button',{name:'Rate Douglas Wolfe'}).isDisabled());
    assert.equal(await page.getByRole('link',{name:'Rate Douglas Wolfe'}).count(),0);
    assert.ok(await page.getByText('Review submissions are closed.').count());
   }
   await page.getByRole('link',{name:'← Back to rating search'}).click();
   await page.waitForURL(url=>url.pathname==='/'&&url.searchParams.get('q')==='Scott Wolfe');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.goto(`${origin}/washington`,{waitUntil:'domcontentloaded'});
   await page.locator('.guide-result').first().click();await page.waitForURL(/\/washington\//);
   await page.getByText(mode==='enabled'?'Review submissions are unavailable for this guide right now.':'Review submissions are not open yet.').first().waitFor();
   assert.equal(await page.locator('a[href="#write-review"]').count(),0);
   await page.waitForLoadState('networkidle');await context.close();
  }
  if(mode==='enabled'){
   const moderatorContext=await browser.newContext({viewport:{width:390,height:844}});
   const moderatorPage=await moderatorContext.newPage();
   let attempts=0;
   await moderatorContext.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    const otpRequest=url.origin===authOrigin&&url.pathname==='/auth/v1/otp';
    if(otpRequest&&request.method()==='OPTIONS')return route.fulfill({status:204,headers:{
     'access-control-allow-origin':origin,'access-control-allow-methods':'POST','access-control-allow-headers':'*'
    }});
    if(otpRequest&&request.method()==='POST'){
     attempts++;
     assert.equal(url.searchParams.get('redirect_to'),origin+'/admin');
     assert.equal(request.postDataJSON().create_user,false);
     return route.fulfill({
      status:attempts===1?400:200,contentType:'application/json',headers:{'access-control-allow-origin':origin},
      body:attempts===1?'{"code":"validation_failed","message":"Fixture provider detail"}':'{}'
     });
    }
    if(url.origin===origin)return route.continue();
    blocked.push(url.origin);return route.abort();
   });
   await moderatorPage.goto(`${origin}/admin`,{waitUntil:'domcontentloaded'});
   await moderatorPage.getByText('Sign in with an authorized operator account.').waitFor();
   await moderatorPage.getByText('Use your moderator email to request a sign-in link.').waitFor();
   assert.equal(await moderatorPage.getByRole('button',{name:'Continue with Google'}).count(),0);
   await moderatorPage.getByRole('textbox',{name:'Email',exact:true}).fill('moderator@example.invalid');
   const send=moderatorPage.getByRole('button',{name:'Email me a sign-in link'});
   await send.click();
   await moderatorPage.getByText('Couldn’t send a sign-in link. Check your email address and try again.').waitFor();
   await send.click();
   await moderatorPage.getByText('Check your email for the sign-in link.').waitFor();
   assert.equal(attempts,2);
   await moderatorPage.waitForLoadState('networkidle');await moderatorContext.close();

   const context=await browser.newContext({viewport:{width:390,height:844}});
   const user={id:'10000000-0000-4000-8000-000000000001',email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
   const token=`${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fixture`;
   await context.addInitScript(({token,user})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user})),{token,user});
   let failAvailability=true;
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===authOrigin&&url.pathname==='/auth/v1/user'){
     if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{
      'access-control-allow-origin':origin,'access-control-allow-methods':'GET','access-control-allow-headers':'*'
     }});
     if(request.method()==='GET')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify(user)});
    }
    if(url.origin!==origin){blocked.push(url.origin);return route.abort()}
    if(url.pathname==='/api/launch'){
     const input=request.postDataJSON();let data;
     if(input.operation==='review_write_availability'){
      if(failAvailability)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"service_unavailable"}'});
      data={available:false};
     }
     else if(input.operation==='public_reviews')data={summary:{count:0,averageQuality:null},reviews:[],limit:100};
     else if(input.operation==='profile_details')data={details:null,attribution:'captain_declared'};
     else if(input.operation==='session')data={authenticated:true,operator:false};
     else if(input.operation==='own_review_for_guide')data={review:null};
     else if(input.operation==='my_submissions')data={items:[],offset:0,limit:50};
     else return route.fulfill({status:503,contentType:'application/json',body:'{"error":"launch_unavailable"}'});
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    }
    return route.continue();
   });
   const page=await context.newPage();await page.goto(`${origin}/guides/og-0000359`,{waitUntil:'networkidle'});
   await page.getByText('Couldn’t load review information.',{exact:false}).waitFor();
   assert.equal(await page.locator('a[href="#write-review"]').count(),0);
   failAvailability=false;
   await page.getByRole('button',{name:'Retry',exact:true}).click();
   await page.getByText('Review submissions are closed.').waitFor();
   assert.equal(await page.getByText('Are you the captain? Request this listing').count(),0);
   assert.equal(await page.locator('a[href="#write-review"]').count(),0);
   await page.waitForLoadState('networkidle');await context.close();
  }
  assert.deepEqual(blocked,[]);
 }finally{await browser.close()}
});
