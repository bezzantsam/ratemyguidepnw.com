import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

// Run with the listed pilot configured for the synthetic wa-002 browser fixture.
const origin=process.env.TEST_BASE_URL;
const executablePath=process.env.BROWSER_EXECUTABLE;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin??'') || !executablePath){
  throw new Error('Set a loopback TEST_BASE_URL and an isolated BROWSER_EXECUTABLE.');
}

const heldMessage='Reviews are unavailable for this guide right now.';
const emptyReviews={summary:{count:0,averageQuality:null},reviews:[],limit:100};

test('held Washington review entry and exact pilot readiness on phone and desktop',{timeout:120000},async t=>{
  const browser=await chromium.launch({headless:true,executablePath});
  try {
    for(const width of [390,1366])await t.test(`${width}px`,async()=>{
      const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
      const page=await context.newPage();
      const calls=[];
      const unexpected=[];
      let pilotMode='paused';
      page.on('pageerror',error=>unexpected.push(error.message));
      await context.route('**/*',route=>{
        const request=route.request();
        const url=new URL(request.url());
        if(url.origin!==origin){
          unexpected.push(url.origin);
          return route.abort();
        }
        if(url.pathname==='/api/guide-offerings')return route.fulfill({json:{profile:null,items:[],nextCursor:null}});
        if(url.pathname!=='/api/launch')return route.continue();
        const {operation,sourceId}=request.postDataJSON();
        calls.push([sourceId,operation]);
        switch(operation){
          case 'public_review_summaries':return route.fulfill({json:{summaries:[]}});
          case 'claim_availability':return route.fulfill({json:{available:false}});
          case 'profile_details':return route.fulfill({json:{details:null,attribution:'captain_declared'}});
          case 'review_write_availability':
            if(sourceId==='wa-002' && pilotMode==='availability error')return route.fulfill({status:503,json:{error:'service_unavailable'}});
            return route.fulfill({json:{available:sourceId!=='wa-002' || pilotMode!=='paused'}});
          case 'public_reviews':
            if(sourceId==='wa-002' && pilotMode==='reviews error')return route.fulfill({status:503,json:{error:'service_unavailable'}});
            return route.fulfill({json:emptyReviews});
          default:
            unexpected.push(operation);
            return route.fulfill({status:503,json:{error:'service_unavailable'}});
        }
      });

      const section=page.locator('#write-review');
      const back=section.getByRole('link',{name:'← Back to rating search'});
      async function expectHeld(){
        await section.getByText(heldMessage,{exact:true}).waitFor();
        assert.equal(await page.getByText(heldMessage,{exact:true}).count(),1);
        assert.equal(await page.locator('#write-review').count(),1);
        assert.equal(await page.locator('input[type=email], a[href="#your-submissions"], button.guide-rate, #reviews').count(),0);
      }
      const finder='/write-review?q=Charles+Stahley&state=Washington';
      const search=page.getByRole('searchbox');
      const charles=page.locator('.guide-result[href^="/washington/wa-021?"]');
      await page.goto(origin+finder);
      await charles.waitFor();
      assert.equal(await search.inputValue(),'Charles Stahley');
      await charles.click();
      await page.waitForURL(url=>url.pathname==='/washington/wa-021' && url.hash==='#write-review');
      await expectHeld();
      await page.waitForFunction(()=>{
        const anchor=document.querySelector('#write-review')?.getBoundingClientRect();
        return anchor && anchor.top>=-1 && anchor.top<innerHeight;
      });
      await back.waitFor();
      await page.waitForFunction(expected=>document.querySelector('#write-review a')?.getAttribute('href')===expected,finder);
      const save=page.getByRole('button',{name:'Save guide: Charles Stahley'});
      await save.click();
      assert.equal(await save.getAttribute('aria-pressed'),'true');
      await back.click();
      await page.waitForURL(origin+finder);
      await charles.waitFor();
      assert.equal(await search.inputValue(),'Charles Stahley');
      await page.getByRole('link',{name:'Saved guides',exact:true}).click();
      await page.locator('a[href="/washington/wa-021"]').waitFor();
      assert.deepEqual(calls.filter(([id])=>id==='wa-021'),[]);

      await page.goto(origin+'/washington/wa-021?intent=review&returnTo=https%3A%2F%2Fexample.invalid#write-review');
      await expectHeld();
      assert.equal(await section.evaluate(el=>el.matches(':target')),true);
      assert.equal(await back.getAttribute('href'),'/write-review');

      const pilotPath='/washington/wa-002?intent=review&returnTo='+encodeURIComponent(finder)+'#write-review';
      for(pilotMode of ['paused','availability error','reviews error']){
        calls.length=0;
        if(page.url()===origin+pilotPath)await page.reload();
        else await page.goto(origin+pilotPath);
        await expectHeld();
        await page.waitForFunction(expected=>document.querySelector('#write-review a')?.getAttribute('href')===expected,finder);
        const operations=[...new Set(calls.filter(([id])=>id==='wa-002').map(([,op])=>op))].sort();
        assert.deepEqual(operations,pilotMode==='reviews error'?['public_reviews','review_write_availability']:['review_write_availability'],pilotMode);
      }
      pilotMode='open';
      await page.reload();
      await section.getByText('Sign in to share a firsthand experience with this guide.').waitFor();
      await page.locator('#reviews').waitFor();
      assert.equal(await section.getByText(heldMessage).count(),0);

      await page.goto(origin+'/guides/og-0002193?intent=review#write-review');
      await section.getByText('Sign in to share a firsthand experience with this guide.').waitFor();
      assert.deepEqual(unexpected,[]);
      await context.close();
    });
  } finally {
    await browser.close();
  }
});
