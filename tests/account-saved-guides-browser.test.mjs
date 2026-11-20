import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const origin=process.env.TEST_BASE_URL, provider=process.env.TEST_SUPABASE_URL;
const executablePath=process.env.BROWSER_EXECUTABLE;
for(const url of [origin,provider])assert.match(url??'',/^http:\/\/127\.0\.0\.1:\d+$/,'Loopback origin required');
assert.ok(executablePath);

const deviceKey='rmgpnw:saved-guides:v1';
const authKey='sb-127-auth-token';
const waPath='/washington/wa-002', orPath='/guides/og-0001225-f-f';
const waGuide={jurisdiction:'WA',sourceId:'wa-002'};
const orGuide={jurisdiction:'OR',sourceId:'OG.0001225.F&F'};
const users=[
 {id:'20000000-0000-4000-8000-000000000001',email:'angler-a@example.invalid'},
 {id:'20000000-0000-4000-8000-000000000002',email:'angler-b@example.invalid'},
].map(user=>({...user,aud:'authenticated',role:'authenticated',is_anonymous:false,app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}));
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function session(user,version){
 const now=Math.floor(Date.now()/1000);
 const token=encoded({alg:'HS256',typ:'JWT'})+'.'+encoded({sub:user.id,iat:now,exp:now+3600,version})+'.synthetic';
 return {access_token:token,refresh_token:'fixture-'+version,token_type:'bearer',expires_in:3600,expires_at:now+3600,user};
}
function callback(path,value){
 const {access_token,refresh_token,token_type,expires_in}=value;
 return origin+path+'#'+new URLSearchParams({access_token,refresh_token,token_type,expires_in});
}
function defer(){
 let resolve;
 const promise=new Promise(settle=>{resolve=settle});
 return {resolve,promise};
}

test('account shortlist and shared-device opt-in across refresh, logout and account switch',{timeout:120000},async t=>{
 const browser=await chromium.launch({executablePath,headless:true});
 try{
  for(const width of [390,1366])await t.test(String(width),async()=>{
   const userA=session(users[0],'a1'),refreshA=session(users[0],'a2'),userB=session(users[1],'b1');
   const byToken=new Map([userA,refreshA,userB].map(value=>[value.access_token,value.user]));
   const saved=new Map(users.map(user=>[user.id,[]]));
   const actions=[],otp=[];
   let paused, reached;
   async function setup(){
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
    await context.route('**/*',async route=>{
     const req=route.request(),url=new URL(req.url());
     if(url.origin===origin)return route.continue();
     if(url.origin!==provider)return route.abort();
     const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
     const respond=(json,status=200)=>route.fulfill({json,status,headers});
     if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
     const token=req.headers().authorization?.replace(/^Bearer /,'');
     const user=byToken.get(token);
     switch(url.pathname){
      case '/auth/v1/user':return user?respond(user):respond({msg:'Unauthorized'},401);
      case '/auth/v1/logout':return route.fulfill({status:204,headers});
      case '/auth/v1/otp':otp.push(url.searchParams.get('redirect_to'));return respond({});
      case '/rest/v1/rpc/rmg_account_saved_guides_v1': {
       if(!user)return respond({message:'Unauthorized'},401);
       const {p_action:action,p_guides:guides}=req.postDataJSON();
       actions.push({token,action,guides});
       const items=saved.get(user.id);
       if(action==='save'||action==='import'){
        for(const guide of guides)if(!items.some(item=>item.jurisdiction===guide.jurisdiction&&item.sourceId===guide.sourceId))items.push(guide);
       }else if(action==='remove'){
        saved.set(user.id,items.filter(item=>!guides.some(guide=>guide.jurisdiction===item.jurisdiction&&guide.sourceId===item.sourceId)));
       }
       if(paused && action!=='list'){reached.resolve();await paused.promise;}
       const status={list:'listed',save:'saved',remove:'removed',import:'imported'}[action];
       try{return await respond({status,items:saved.get(user.id)});}catch(error){
        if(!String(error).includes('Target page')&&!String(error).includes('Request is already handled'))throw error;
       }
       return;
      }
      default:throw new Error('Unexpected synthetic provider path '+url.pathname);
     }
    });
    return context;
   }
   async function broadcast(page,next,event){
    await page.evaluate(({next,event,authKey})=>{
     localStorage.setItem(authKey,JSON.stringify(next));
     const channel=new BroadcastChannel(authKey);
     channel.postMessage({event,session:next});
     channel.close();
    },{next,event,authKey});
   }
   const context=await setup();
   const page=await context.newPage();
   const heldPaths=[waPath,'/guides/old-listing'];
   await page.goto(origin+'/saved');
   await page.getByText('Sign in to see your shortlist.').waitFor();
   await page.evaluate(({deviceKey,heldPaths})=>localStorage.setItem(deviceKey,JSON.stringify(heldPaths)),{deviceKey,heldPaths});
   assert.equal(await page.locator('a[href="'+waPath+'"]').count(),0);
   assert.equal(actions.length,0);
   await page.getByRole('textbox',{name:'Email'}).fill(users[0].email);
   await page.getByRole('button',{name:'Email me a sign-in link'}).click();
   await page.getByText(/Check your email/).waitFor();
   assert.deepEqual(otp,[origin+'/saved']);

   await page.goto(origin+'/guides');
   await page.goto(callback('/saved',userA));
   await page.getByText('No saved guides yet.',{exact:false}).waitFor();
   await page.getByRole('button',{name:'Review device saves'}).click();
   assert.equal(actions.filter(action=>action.action!=='list').length,0);
   await page.getByRole('button',{name:'Copy to this account'}).click();
   await page.locator('a[href="'+waPath+'"]').waitFor();
   assert.deepEqual(actions.find(action=>action.action==='import').guides,[waGuide]);
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),deviceKey),JSON.stringify(heldPaths));

   await page.goto(origin+orPath);
   const save=page.getByRole('button',{name:/^Save guide:/});
   await save.waitFor();
   paused=defer();reached=defer();
   await save.click();
   await reached.promise;
   await broadcast(page,refreshA,'TOKEN_REFRESHED');
   paused.resolve();paused=null;
   await page.getByText('Guide saved to your account.',{exact:true}).waitFor();
   assert.equal(await save.getAttribute('aria-pressed'),'true');
   assert.deepEqual(actions.find(action=>action.action==='save'),{token:userA.access_token,action:'save',guides:[orGuide]});
   await page.reload();
   await page.waitForFunction(()=>document.querySelector('.save-guide-button')?.getAttribute('aria-pressed')==='true');

   const secondDevice=await setup();
   const secondPage=await secondDevice.newPage();
   await secondPage.goto(callback('/saved',userA));
   await secondPage.locator('a[href="'+orPath+'"]').waitFor();
   assert.equal(await secondPage.locator('a[href="'+waPath+'"]').count(),1);
   assert.equal(await secondPage.getByRole('button',{name:'Review device saves'}).count(),0);
   await secondDevice.close();

   await page.goto(origin+'/saved');
   await page.locator('a[href="'+orPath+'"]').waitFor();
   paused=defer();reached=defer();
   await page.locator('.saved-guide-row').filter({has:page.locator('a[href="'+orPath+'"]')}).getByRole('button',{name:/^Remove/}).click();
   await reached.promise;
   await broadcast(page,userB,'SIGNED_IN');
   await page.getByText('No saved guides yet.',{exact:false}).waitFor();
   paused.resolve();paused=null;
   assert.equal(await page.locator('a[href="'+waPath+'"], a[href="'+orPath+'"]').count(),0);
   assert.deepEqual(saved.get(users[1].id),[]);
   assert.deepEqual(saved.get(users[0].id),[waGuide]);
   await page.getByRole('button',{name:'Sign out'}).click();
   await page.getByText('Sign in to see your shortlist.').waitFor();
   assert.equal(await page.getByRole('button',{name:'Review device saves'}).count(),0);
   assert.equal(await page.locator('a[href="'+waPath+'"]').count(),0);
   await page.goto(origin+orPath);
   await page.getByRole('button',{name:/^Sign in to save/}).click();
   await page.locator('.save-guide-control').getByRole('textbox',{name:'Email'}).fill(users[0].email);
   await page.locator('.save-guide-control').getByRole('button',{name:'Email me a sign-in link'}).click();
   await page.locator('.save-guide-control').getByText(/Check your email/).waitFor();
   assert.equal(otp.at(-1),origin+orPath,'profile sign-in returns to the same exact guide');
   await context.close();
  });
 }finally{await browser.close();}
});
