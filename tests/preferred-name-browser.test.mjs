import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const origin=process.env.TEST_BASE_URL,authOrigin=process.env.TEST_API_URL,executablePath=process.env.BROWSER_EXECUTABLE;
if(!origin||!authOrigin||![origin,authOrigin].every(x=>/^http:\/\/127\.0\.0\.1:\d+$/.test(x))||origin===authOrigin||!executablePath)throw Error('Distinct isolated loopback servers and a local browser are required');

test('preferred names remain attached to the source record and support owner and moderator actions',{timeout:120000},async()=>{
 const browser=await chromium.launch({executablePath,headless:true});const blocked=[];
 const user={id:'10000000-0000-4000-8000-000000000001',email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
 const token=`${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fixture`;
 let ownerName='Scott',adminName=null;
 async function make(operator){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(({token,user})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user})),{token,user});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===authOrigin&&url.pathname==='/auth/v1/user')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)});
   if(url.origin!==origin){blocked.push(url.origin);return route.abort()}
   if(url.pathname!=='/api/launch')return route.continue();
   const x=request.postDataJSON();let data;
   switch(x.operation){
    case 'profile_names_v1':data={names:x.jurisdiction==='OR'&&x.sourceIds.includes('OG.0000359')&&(adminName||ownerName)?[{jurisdiction:'OR',source_id:'OG.0000359',preferred_name:adminName||ownerName,provenance:adminName?'admin':'captain'}]:[]};break;
    case 'review_write_availability':data={available:false};break;
    case 'public_reviews':data={summary:{count:0,averageQuality:null},reviews:[],limit:100};break;
    case 'profile_details':data={details:null,attribution:'captain_declared'};break;
    case 'session':data={authenticated:true,operator};break;
    case 'own_review_for_guide':data={review:null};break;
    case 'my_submissions':data={items:[{id:'20000000-0000-4000-8000-000000000002',kind:'claim',status:'approved',created_at:'2026-01-01T00:00:00Z',jurisdiction:'OR',source_id:'OG.0000359',review_id:null}],offset:0,limit:50};break;
    case 'own_profile_name_v1':data={name:ownerName,overridden:!!adminName};break;
    case 'set_profile_name_v1':ownerName=x.name;data={status:'saved'};break;
    case 'profile_name_review_v1':data={review:{captain_name:ownerName,captain_name_active:true,admin_name:adminName,history:[]}};break;
    case 'admin_set_profile_name_v1':adminName=x.name;data={status:'saved'};break;
    case 'operator_queue':data={items:[],offset:x.offset,limit:x.limit};break;
    default:return route.fulfill({status:503,contentType:'application/json',body:'{"error":"service_unavailable"}'});
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  return context;
 }
 try{
  const owner=await make(false),page=await owner.newPage();await page.goto(origin,{waitUntil:'networkidle'});
  const search=page.getByRole('searchbox');await search.fill('Scott Wolfe');const entry=page.locator('.guide-result').filter({hasText:'Douglas'});await entry.waitFor();assert.match(await entry.innerText(),/Douglas “Scott” Wolfe/);
  await entry.click();await page.waitForURL(/\/guides\/og-0000359/);await page.getByRole('heading',{name:'Douglas “Scott” Wolfe',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Name you go by'}).waitFor();assert.equal(await page.getByLabel('Name you go by',{exact:true}).inputValue(),'Scott');await page.getByLabel('Name you go by',{exact:true}).fill('李明');await page.getByRole('button',{name:'Save name'}).click();
  await page.getByText('Your name was saved.',{exact:false}).waitFor();await page.getByRole('heading',{name:'Douglas “李明” Wolfe',exact:true}).waitFor();
  await page.getByRole('button',{name:'Clear my name'}).click();await page.getByRole('heading',{name:'Douglas Wolfe',exact:true}).waitFor();assert.equal(ownerName,null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await owner.close();
  ownerName='Scott';adminName='Editorial';const overridden=await make(false),ownerPage=await overridden.newPage();await ownerPage.goto(`${origin}/guides/og-0000359`,{waitUntil:'networkidle'});
  await ownerPage.getByText('An editorial correction currently takes precedence over your saved name.').waitFor();assert.equal(await ownerPage.getByLabel('Name you go by',{exact:true}).inputValue(),'Scott');await overridden.close();ownerName=null;adminName=null;
  const admin=await make(true),moderator=await admin.newPage();await moderator.goto(`${origin}/admin`,{waitUntil:'networkidle'});await moderator.getByRole('heading',{name:'Editorial name corrections'}).waitFor();
  await moderator.getByLabel('Source listing ID').fill('OG.0000359');await moderator.getByRole('button',{name:'Review name'}).click();await moderator.getByText('Editorial name: None').waitFor();
  await moderator.getByLabel('Name you go by',{exact:true}).fill('Scott');await moderator.getByLabel('Correction reason').fill('User supplied editorial correction');await moderator.getByRole('button',{name:'Save correction'}).click();await moderator.getByText('Editorial name change saved.').waitFor();assert.equal(adminName,'Scott');
  await moderator.getByRole('button',{name:'Clear correction'}).click();await moderator.getByText('Editorial name: None').waitFor();assert.equal(adminName,null);
  await admin.close();assert.deepEqual(blocked,[]);
 }finally{await browser.close()}
});

test('a late prior-guide name cannot overwrite the current profile',{timeout:60000},async()=>{
 const browser=await chromium.launch({executablePath,headless:true});const context=await browser.newContext();
 let releaseA,signalA;const deferredA=new Promise(resolve=>{releaseA=resolve}),requestedA=new Promise(resolve=>{signalA=resolve});
 try{
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();
   if(url.pathname!=='/api/launch')return route.continue();const x=request.postDataJSON();
   if(x.operation==='profile_names_v1'&&x.sourceIds[0]==='OG.0000001'){signalA();await deferredA;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({names:[{jurisdiction:'OR',source_id:'OG.0000001',preferred_name:'Old',provenance:'captain'}]})})}
   if(x.operation==='profile_names_v1'&&x.sourceIds[0]==='OG.0000002')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({names:[{jurisdiction:'OR',source_id:'OG.0000002',preferred_name:'Bee',provenance:'captain'}]})});
   return route.fulfill({status:503,contentType:'application/json',body:'{"error":"service_unavailable"}'});
  });
  const page=await context.newPage();await page.goto(`${origin}/test-preferred-race`,{waitUntil:'domcontentloaded'});await requestedA;
  await page.getByRole('button',{name:'Guide B'}).click();await page.getByRole('heading',{name:'Bob “Bee” Example'}).waitFor();releaseA();
  await page.waitForTimeout(300);assert.equal(await page.getByRole('heading',{name:'Bob “Bee” Example'}).count(),1);assert.equal(await page.getByText('Alice “Old” Example').count(),0);
 }finally{releaseA();await context.close();await browser.close()}
});
