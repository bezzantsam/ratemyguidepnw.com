import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const origin=process.env.TEST_BASE_URL;
const executablePath=process.env.BROWSER_EXECUTABLE;
assert.match(origin??'',/^http:\/\/127\.0\.0\.1:\d+$/);
assert.ok(executablePath);
const expected=['og-0000433','og-0000460','og-0000468','og-0000509','og-0000527','og-0002254','og-0003348'];
const water='Wilson River';

test('exact sourced Wilson River discovery works on home, directory and review finder', {timeout:120000},async t=>{
 const browser=await chromium.launch({executablePath,headless:true});
 try{
  for(const width of [390,1366])await t.test(`${width}px`,async()=>{
   const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
   const page=await context.newPage();
   const unexpected=[];
   page.on('pageerror',error=>unexpected.push(error.message));
   await context.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin){
     if(url.pathname==='/api/guide-offerings')return route.fulfill({json:{profile:null,items:[],nextCursor:null}});
     if(url.pathname==='/api/launch'){
      const responses={
       public_review_summaries:{items:[]},
       review_write_availability:{available:true},
       claim_availability:{available:false},
       profile_details:{details:null,attribution:'captain_declared'},
       public_reviews:{summary:{count:0,averageQuality:null},reviews:[]},
      };
      const result=responses[req.postDataJSON().operation];
      if(result)return route.fulfill({json:result});
     }else if(req.method()==='GET')return route.continue();
    }
    unexpected.push([req.method(),url.origin,url.pathname]);
    return route.abort();
   });
   async function verifyResults(){
    await page.waitForFunction(ids=>{
     const actual=[...document.querySelectorAll('a.guide-result')].map(a=>new URL(a.href).pathname.split('/').pop()).sort();
     return actual.join(',')===ids.join(',');
    },expected);
    const cards=page.locator('a.guide-result');
    assert.equal(await cards.getByText('Advertised waters (source-linked): Wilson River',{exact:false}).count(),7);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   }
   for(const path of ['/','/guides','/write-review']){
    await page.goto(origin+path);
    const search=page.getByRole('searchbox');
    await page.waitForFunction(()=>!document.querySelector('input[type=search]')?.disabled);
    await search.fill(water);
    await verifyResults();
    await page.getByRole('button',{name:'Washington',exact:true}).click();
    await page.getByRole('heading',{name:'No matching guides.'}).waitFor();
    assert.equal(await search.inputValue(),water);
    await page.getByRole('button',{name:'Oregon',exact:true}).click();
    await verifyResults();
    const link=page.locator('a.guide-result[href^="/guides/og-0003348?"]');
    const target=new URL(await link.getAttribute('href'),origin);
    const exactReturn=path+'?q=Wilson+River&state=Oregon';
    assert.equal(target.searchParams.get('returnTo'),exactReturn);
    assert.equal(target.searchParams.get('intent'),path==='/guides'?null:'review');
    assert.equal(target.hash,path==='/guides'?'':'#write-review');
    await link.click();
    await page.getByRole('heading',{name:'Keondre Menefee',exact:true}).waitFor();
    const back=page.getByRole('link',{name:path==='/guides'?'← Search guides':'← Back to rating search',exact:true});
    await page.waitForFunction(href=>[...document.querySelectorAll('main a')].some(a=>a.getAttribute('href')===href),exactReturn);
    await back.click();
    await page.waitForURL(origin+exactReturn);
    await verifyResults();
   }

   await page.goto(origin+'/guides?state=Oregon&water=Wilson+River');
   await verifyResults();
   assert.equal(await page.getByRole('combobox',{name:/^Fishing waters/}).inputValue(),water);
   await page.goto(origin+'/guides?q=Hunter+Wilson');
   await page.getByRole('heading',{name:'Hunter Wilson',exact:true}).waitFor();
   assert.deepEqual(unexpected,[]);
   await context.close();
  });
 }finally{await browser.close()}
});
