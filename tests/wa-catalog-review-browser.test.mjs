import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const origin=process.env.TEST_BASE_URL;
const issuer=process.env.TEST_API_URL;
const executablePath=process.env.BROWSER_EXECUTABLE;
for(const url of [origin,issuer])assert.match(url??'',/^http:\/\/127\.0\.0\.1:\d+$/);
assert.notEqual(origin,issuer);
assert.ok(executablePath);

const charles={jurisdiction:'WA',sourceId:'wa-021',name:'Charles Stahley'};
const andy={jurisdiction:'WA',sourceId:'wa-004',name:'Andy Coleman'};
const held={jurisdiction:'WA',sourceId:'wa-001',name:'Aaron Berg'};
const rod={jurisdiction:'OR',sourceId:'OG.0002193'};
const publishedId='10000000-0000-4000-8000-000000000001';
const publishedReview={
  id:publishedId,quality:4,would_book_again:false,communication:2,value_rating:5,
  trip_responses:{version:1,answers:{kindness:{state:'not_applicable'},fishiness:{state:'answered',value:2},fish_landed:{state:'answered',value:0}}},
  body:'An independently moderated fixture review.',published_at:'2026-11-19T00:00:00Z',
};
const pendingId='10000000-0000-4000-8000-000000000002';
const authorId='10000000-0000-4000-8000-000000000003';
const email='fixture@example.invalid';
const expiresAt=Math.floor(Date.now()/1000)+3600;
const pack=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=`${pack({alg:'none'})}.${pack({sub:authorId,exp:expiresAt,role:'authenticated'})}.fixture`;
const session={
  access_token:token,refresh_token:'fixture',expires_in:3600,expires_at:expiresAt,token_type:'bearer',
  user:{id:authorId,email,aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-11-19T00:00:00Z',
    app_metadata:{},user_metadata:{}},
};
const score=(sourceId)=>sourceId===andy.sourceId?{count:1,averageQuality:4}:{count:0,averageQuality:null};
const finder=name=>'/write-review?'+new URLSearchParams({q:name,state:'Washington'}).toString();
const profile=source=>'/washington/'+source.sourceId;
const known=new Set([charles.sourceId,andy.sourceId,held.sourceId,rod.sourceId]);
const publicOps=new Set(['public_review_summaries','review_write_availability','public_reviews','review_detail','claim_availability','profile_details']);

test('two separate unclaimed WA guides can be reviewed, with pending privacy and a held neighbor', {timeout:120000},async()=>{
  const browser=await chromium.launch({executablePath,headless:true});
  const calls=[];
  const unexpected=[];
  let pending=false;
  let submitAttempts=0;
  let readinessError=false;
  const authorContext=await browser.newContext({viewport:{width:390,height:667},hasTouch:true,serviceWorkers:'block'});
  const anonymous=await browser.newContext({viewport:{width:1366,height:850},serviceWorkers:'block'});
  try{
    await authorContext.addInitScript(({origin,session})=>{
      if(location.origin===origin)localStorage.setItem('sb-127-auth-token',JSON.stringify(session));
    },{origin,session});
    for(const [context,actor] of [[authorContext,'author'],[anonymous,'anonymous']]){
      await context.route('**/*',route=>{
        const req=route.request(),u=new URL(req.url());
        if(u.origin===issuer&&u.pathname==='/auth/v1/user'&&actor==='author'){
          const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'GET,OPTIONS',
            'access-control-allow-headers':'*'};
          if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
          if(req.method()==='GET')return route.fulfill({json:session.user,headers});
        }
        if(u.origin===origin&&u.pathname==='/api/launch'){
          const input=req.postDataJSON();
          const {operation,sourceId}=input;
          calls.push({actor,operation,sourceId});
          if(!publicOps.has(operation))assert.equal(req.headers().authorization,'Bearer '+token);
          if(sourceId)assert.ok(known.has(sourceId));
          switch(operation){
            case 'public_review_summaries':
              return route.fulfill({json:{items:input.guides.filter(g=>known.has(g.sourceId)&&g.sourceId!==held.sourceId)
                .map(g=>({...g,...score(g.sourceId)}))}});
            case 'review_write_availability':
              if(readinessError&&sourceId===held.sourceId)return route.fulfill({status:503,json:{error:'service_unavailable'}});
              return route.fulfill({json:{available:sourceId!==held.sourceId}});
            case 'public_reviews':
              assert.notEqual(sourceId,held.sourceId);
              return route.fulfill({json:{summary:score(sourceId),reviews:sourceId===andy.sourceId?[publishedReview]:[]}});
            case 'review_detail':
              assert.equal(sourceId,andy.sourceId);
              assert.equal(input.id,publishedId);
              return route.fulfill({json:{review:publishedReview}});
            case 'claim_availability':
            case 'profile_details':
              assert.equal(sourceId,rod.sourceId);
              return route.fulfill({json:operation==='claim_availability'?{available:false}:{details:null}});
            case 'session':
              return route.fulfill({json:{authenticated:true,operator:false}});
            case 'own_review_for_guide':
              assert.notEqual(sourceId,held.sourceId);
              return route.fulfill({json:{review:pending&&sourceId===charles.sourceId?{id:pendingId,status:'pending'}:null}});
            case 'my_submissions':
              return route.fulfill({json:{items:pending?[{
                id:pendingId,kind:'review',status:'pending',created_at:'2026-11-19T00:00:00Z',
                jurisdiction:'WA',source_id:charles.sourceId,review_id:null,
              }]:[],offset:input.offset,limit:input.limit}});
            case 'submit_review':
              assert.equal(sourceId,charles.sourceId);
              assert.equal(input.body,'Private firsthand fixture trip.');
              assert.equal(input.ratingVersion,1);
              assert.equal(input.wouldBookAgain,false);
              assert.deepEqual(input.ratings,{professionalism:4,safety:2});
              assert.deepEqual(input.tripResponses,{version:1,answers:{
                kindness:{state:'answered',value:4},organization:{state:'answered',value:3},
                fishiness:{state:'answered',value:5},fish_landed:{state:'answered',value:0},
              }});
              assert.equal(pending,false);
              if(++submitAttempts===1)return route.fulfill({status:503,json:{error:'service_unavailable'}});
              pending=true;
              return route.fulfill({json:{id:pendingId,status:'pending'}});
          }
        }else if(u.origin===origin&&req.method()==='GET')return route.continue();
        unexpected.push([actor,req.method(),u.origin,u.pathname]);
        return route.abort();
      });
    }
    async function openFinder(page,guide,tile){
      await page.goto(origin+finder(guide.name));
      const result=page.locator(`.guide-result[href^="${profile(guide)}?"]`);
      await result.getByText(tile,{exact:true}).waitFor();
      await result.click();
      await page.waitForURL(url=>url.pathname===profile(guide)&&url.hash==='#write-review');
      assert.equal(new URL(page.url()).searchParams.get('returnTo'),finder(guide.name));
    }
    const phone=await authorContext.newPage(),desktop=await anonymous.newPage();
    for(const page of [phone,desktop])page.on('pageerror',error=>unexpected.push(error.message));

    await openFinder(phone,charles,'No reviews yet');
    await phone.getByRole('button',{name:'Submit review'}).waitFor();
    const booking=phone.getByRole('group',{name:'Would you book again?'});
    const optional=phone.getByRole('group',{name:'Rate individual aspects (optional)'});
    assert.equal(await booking.getByRole('radio',{checked:true}).count(),0);
    assert.ok((await booking.boundingBox()).y<(await optional.boundingBox()).y);
    assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const group=name=>phone.getByRole('group',{name,exact:true});
    const star=(name,score)=>group(name).getByRole('radio',{name:score===1?'1 star':`${score} stars`,exact:true});
    for(const name of ['Overall quality','Safety','Kindness','Organization','Finding fish']){
      assert.equal(await group(name).getByRole('radio').count(),5);
      assert.equal(await group(name).getByRole('radio',{checked:true}).count(),0);
    }
    await star('Overall quality',5).tap();
    await booking.getByRole('radio',{name:'Yes',exact:true}).focus();
    await phone.keyboard.press('ArrowRight');
    assert.equal(await booking.getByRole('radio',{name:'No',exact:true}).isChecked(),true);
    await star('Kindness',3).tap();
    await star('Kindness',3).press('ArrowRight');
    assert.equal(await star('Kindness',4).isChecked(),true);
    await star('Organization',3).tap();
    await star('Finding fish',5).tap();
    const fishLanded=phone.getByLabel('How many fish did your group land?',{exact:false});
    assert.equal(await fishLanded.inputValue(),'');
    await fishLanded.fill('0');
    await optional.getByText('More ratings (optional)',{exact:true}).click();
    await star('Professionalism',4).tap();
    await star('Safety',2).tap();
    await phone.getByLabel('Your relationship to this guide or business').selectOption('none');
    await phone.getByLabel('Your experience').fill('Private firsthand fixture trip.');
    await phone.getByLabel('I personally took this trip.').check();
    await phone.getByRole('button',{name:'Submit review'}).click();
    await phone.getByRole('alert').filter({hasText:'Your draft is still here'}).waitFor();
    assert.equal(await phone.getByLabel('Your experience').inputValue(),'Private firsthand fixture trip.');
    assert.equal(await phone.getByRole('button',{name:'Submit review'}).isDisabled(),true);
    await phone.getByRole('button',{name:'Check before retrying'}).click();
    await phone.getByText('No review was found. You can submit your draft again.').waitFor();
    await phone.getByRole('button',{name:'Submit review'}).click();
    const privateReceipt=phone.getByText('Your review is awaiting review and is not public.');
    await privateReceipt.waitFor();
    await phone.reload();
    await privateReceipt.waitFor();
    assert.equal(calls.filter(call=>call.operation==='submit_review').length,2);

    await openFinder(desktop,charles,'No reviews yet');
    await desktop.getByRole('button',{name:'Email me a sign-in link'}).waitFor();
    await desktop.getByText('No published reviews yet.',{exact:true}).waitFor();
    assert.equal(await desktop.getByText(/Private firsthand fixture trip|Your submissions/).count(),0);

    await openFinder(phone,andy,'4.0');
    await phone.getByText('An independently moderated fixture review.').waitFor();
    const details=phone.locator(`#review-${publishedId}`);
    await details.getByText('Would book again: No').waitFor();
    await details.getByText('Fish landed by the group, including releases: 0').waitFor();
    assert.match(await details.locator('.published-review-dimensions').innerText(),/Finding fish\s+2 \/ 5/);
    assert.match(await details.locator('.published-review-dimensions').innerText(),/Communication\s+2 \/ 5[\s\S]+Value\s+5 \/ 5/);
    assert.equal(await details.getByText('Safety',{exact:true}).count(),0);
    await desktop.goto(origin+profile(andy)+'#review-'+publishedId);
    await desktop.getByRole('heading',{name:'Linked angler review'}).waitFor();
    const linked=desktop.locator(`#review-${publishedId}`);
    await linked.getByText('Fish landed by the group, including releases: 0').waitFor();
    await linked.getByText('Overall quality: 4 / 5').waitFor();
    const cleared=linked.locator('.published-review-dimensions > div').filter({hasText:'Kindness'});
    assert.equal(await cleared.locator('dd').innerText(),'Unanswered');

    await phone.getByRole('link',{name:'4.0 / 5 · 1 review'}).waitFor();
    await phone.getByRole('button',{name:'Submit review'}).waitFor();
    assert.equal(await privateReceipt.count(),0);
    const back=phone.locator('#write-review').getByRole('link',{name:'← Back to rating search'});
    await back.click();
    await phone.waitForURL(origin+finder(andy.name));
    await phone.locator(`.guide-result[href^="${profile(andy)}?"]`).getByText('4.0',{exact:true}).waitFor();
    assert.equal(await phone.getByRole('searchbox').inputValue(),andy.name);

    for(const failed of [true,false]){
      readinessError=failed;
      await openFinder(phone,held,'Rating unavailable');
      const section=phone.locator('#write-review');
      await section.getByText(failed?'Couldn’t load review information. Try again shortly.':
        'Reviews are unavailable for this guide right now.',{exact:true}).waitFor();
      assert.equal(await phone.locator('input[type=email], #your-submissions').count(),0);
      assert.equal(await back.getAttribute('href'),finder(held.name));
      await back.click();
      await phone.waitForURL(origin+finder(held.name));
    }
    assert.ok(calls.filter(call=>call.sourceId===held.sourceId).every(call=>call.operation==='review_write_availability'));

    await desktop.goto(origin+'/guides/og-0002193?intent=review#write-review');
    await desktop.getByRole('button',{name:'Email me a sign-in link'}).waitFor();
    assert.deepEqual(unexpected,[]);
  }finally{await browser.close()}
});
