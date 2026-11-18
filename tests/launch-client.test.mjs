import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function compile(path,imports={}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,fetch:()=>{throw Error('unexpected network')},require:name=>imports[name]});return exports;
}
const model=compile('components/launch/submission-model.ts');
const trip=compile('components/launch/trip-responses.ts');
const {createLaunchClient}=compile('lib/launch-client.ts',{'@/components/launch/submission-model':model,'@/components/launch/trip-responses':trip});
const id='10000000-0000-4000-8000-000000000001';
const source={jurisdiction:'OR',sourceId:'OG.0002254'};
const draft={quality:4,intensity:3,wouldBookAgain:false,body:'A firsthand account of the trip and guide. '.repeat(3),firsthand:true,relationship:'none',tripMonth:null};
const response=(data,ok=true)=>({ok,json:async()=>data});
const errorCode=code=>error=>error?.code===code;

test('preferred name projection uses bounded batches and rejects malformed or unrequested identities',async()=>{
 const make=data=>createLaunchClient({enabled:true,getAccessToken:async()=>null,fetcher:async()=>response(data)});
 const entry={jurisdiction:'OR',source_id:'OG.0000359',preferred_name:'李明',provenance:'captain'};
 const result=await make({names:[entry]}).profileNames('OR',['OG.0000359']);
 assert.equal(result[0].name,'李明');assert.equal(result[0].sourceId,'OG.0000359');
 await assert.rejects(make({names:[{...entry,source_id:'OG.0000001'}]}).profileNames('OR',['OG.0000359']),errorCode('service_unavailable'));
 await assert.rejects(make({names:[]}).profileNames('OR',Array(101).fill('x')),errorCode('invalid_input'));
});
test('preferred-name edits require a token, preserve clear and bound Unicode by code points',async()=>{
 let body;const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async(_url,init)=>{body=JSON.parse(init.body);assert.equal(init.headers.Authorization,'Bearer token');return response({status:'saved'})}});
 await client.setProfileName(source,'🐟'.repeat(80));assert.equal(body.name,'🐟'.repeat(80));
 await assert.rejects(client.setProfileName(source,'🐟'.repeat(81)),errorCode('invalid_input'));
 await client.setProfileName(source,null);assert.equal(body.name,null);
 await client.setProfileName(source,'\u00a0Scott\u2003');assert.equal(body.name,'Scott');
 await client.setProfileName(source,'\u00a0\u2003');assert.equal(body.name,null);
 await client.adminSetProfileName(source,'\u2003Scott\u00a0','\u00a0Correction\u2003');assert.equal(body.name,'Scott');assert.equal(body.reason,'Correction');
 await assert.rejects(client.adminSetProfileName(source,'Scott',''),errorCode('invalid_input'));
 const signedOut=createLaunchClient({enabled:true,getAccessToken:async()=>null,fetcher:async()=>{throw Error('no network')}});
 await assert.rejects(signedOut.setProfileName(source,'Scott'),errorCode('sign_in_required'));
});

test('disabled client fails before token access or network requests',async()=>{
  let calls=0;const client=createLaunchClient({getAccessToken:async()=>{calls++;return 'token'},fetcher:async()=>{calls++;return response({})}});
  await assert.rejects(client.session(),errorCode('service_unavailable'));
  assert.equal(calls,0);
});

test('submission sends explicit fields with a bearer token and retains a real pending ID',async()=>{
  let request;
  const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'test-token',fetcher:async(url,init)=>{request={url,init};return response({id,status:'pending'})}});
  const result=await client.submitReview(source,draft);
  assert.equal(result.id,id);assert.equal(result.status,'pending');
  assert.equal(request.url,'/api/launch');assert.equal(request.init.headers.Authorization,'Bearer test-token');
  assert.equal(request.init.cache,'no-store');assert.equal(request.init.redirect,'error');
  const body=JSON.parse(request.init.body);
  assert.equal(body.operation,'submit_review');assert.equal(body.sourceId,source.sourceId);assert.equal(body.jurisdiction,'OR');
  assert.equal(body.firsthandAttested,true);assert.equal(body.wouldBookAgain,false);assert.equal(body.relationship,'none');
  assert.equal(body.tripMonth,null);assert.equal('userId' in body,false);assert.equal('status' in body,false);
});

test('basic review transmits skipped intensity and rebooking as null, not invented values',async()=>{
  let payload;const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async(_url,init)=>{payload=JSON.parse(init.body);return response({id,status:'pending'})}});
  await client.submitReview(source,{...draft,body:'Good trip.',intensity:null,wouldBookAgain:null});
  assert.equal(payload.intensity,null);assert.equal(payload.wouldBookAgain,null);assert.equal(payload.body,'Good trip.');
});

test('write readiness and own-review lookup distinguish unavailable, empty and persisted states',async()=>{
  const create=value=>createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response(value)});
  assert.equal(await create({available:true}).reviewWriteAvailability(source),true);
  assert.equal(await create({available:false}).reviewWriteAvailability(source),false);
  await assert.rejects(create({}).reviewWriteAvailability(source),errorCode('service_unavailable'));
  assert.equal(await create({review:null}).ownReviewForGuide(source),null);
  assert.equal((await create({review:{id,status:'published'}}).ownReviewForGuide(source)).id,id);
  await assert.rejects(create({review:{id,status:'approved'}}).ownReviewForGuide(source),errorCode('service_unavailable'));
});

test('optional trip month reaches the agreed endpoint without an invented day',async()=>{
  let payload;const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async(_url,init)=>{payload=JSON.parse(init.body);return response({id,status:'pending'})}});
  await client.submitReview(source,{...draft,tripMonth:'2026-11'});assert.equal(payload.tripMonth,'2026-11');
  await assert.rejects(client.submitReview(source,{...draft,tripMonth:'0000-11'}),errorCode('invalid_input'));
});

test('versioned trip answers reach the draft endpoint without changing false or not applicable',async()=>{
  let payload;const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async(_url,init)=>{payload=JSON.parse(init.body);return response({id,status:'pending'})}});
  const tripResponses={version:1,answers:{dog_present:{state:'answered',value:false},children_present:{state:'not_applicable'}}};
  await client.submitReview(source,{...draft,tripResponses});
  assert.deepEqual(payload.tripResponses,tripResponses);
});

test('malformed success, unknown errors and wrong-owner status fail closed',async()=>{
  const create=data=>createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response(data)});
  await assert.rejects(create({status:'pending'}).submitReview(source,draft),errorCode('service_unavailable'));
  await assert.rejects(create({id:'20000000-0000-4000-8000-000000000002',status:'pending'}).ownStatus('review',id),errorCode('service_unavailable'));
  const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({error:'raw database error'},false)});
  await assert.rejects(client.session(),errorCode('service_unavailable'));
  const limited=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({error:'rate_limited'},false)});
  await assert.rejects(limited.session(),errorCode('rate_limited'));
});

test('own status preserves only states valid for that submission type',async()=>{
  for(const [kind,status] of [['review','removed'],['review','published'],['claim','denied'],['claim','approved']]) {
    const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({id,status})});
    const result=await client.ownStatus(kind,id);assert.equal(result.status,status);
  }
  const wrong=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({id,status:'approved'})});
  await assert.rejects(wrong.ownStatus('review',id),errorCode('service_unavailable'));
});

test('own submission discovery accepts only valid actor-scoped receipts and preserves source identity',async()=>{
  const row={id,kind:'review',status:'published',created_at:'2026-11-17T00:00:00Z',jurisdiction:'OR',source_id:'OG.0002254',review_id:null};
  const create=items=>createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({items,offset:0,limit:50})});
  const [item]=await create([row]).mySubmissions();
  assert.equal(item.status,'published');assert.equal(item.sourceId,'OG.0002254');
  assert.equal(item.identities[0].sourceId,'OG.0002254');
  const [cross]=await create([{...row,identities:[{jurisdiction:'OR',source_id:'OG.0002254'},{jurisdiction:'WA',source_id:'wa-123'}]}]).mySubmissions();
  assert.equal(cross.identities[1].sourceId,'wa-123');
  await assert.rejects(create([{...row,identities:[{jurisdiction:'OR',source_id:'OG.0002254'},{jurisdiction:'OR',source_id:'OG.0002254'}]}]).mySubmissions(),errorCode('service_unavailable'));
  await assert.rejects(create([{...row,identities:[{jurisdiction:'OR',source_id:'OG.0002254'},{jurisdiction:'OR',source_id:'OG.0000047'}]}]).mySubmissions(),errorCode('service_unavailable'));
  await assert.rejects(create([{...row,identities:[{jurisdiction:'WA',source_id:'wa-123'}]}]).mySubmissions(),errorCode('service_unavailable'));
  await assert.rejects(create([{...row,status:'approved'}]).mySubmissions(),errorCode('service_unavailable'));
  await assert.rejects(create([{...row,jurisdiction:null}]).mySubmissions(),errorCode('service_unavailable'));
});

test('review revisions send explicit user answers and require a persisted pending receipt',async()=>{
  let payload;const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async(_url,init)=>{payload=JSON.parse(init.body);return response({id,status:'pending'})}});
  assert.equal((await client.submitRevision(id,draft)).status,'pending');
  assert.equal(payload.operation,'submit_revision');assert.equal(payload.reviewId,id);assert.equal(payload.wouldBookAgain,false);
  assert.equal('sourceId' in payload,false);
});

test('review edit loads only the requested public review and retains supported optional answers',async()=>{
  const review={id,quality:4,intensity:3,would_book_again:false,body:draft.body,relationship_disclosure:'none',published_at:'2026-11-17T00:00:00Z',trip_month:'2026-07-01',trip_responses:{version:1,answers:{dog_present:{state:'answered',value:false}}}};
  const create=r=>createLaunchClient({enabled:true,getAccessToken:async()=>null,fetcher:async()=>response({review:r})});
  const initial=await create(review).reviewDetail(source,id);
  assert.equal(initial.firsthand,false);assert.equal(initial.tripResponses.answers.dog_present.value,false);assert.equal(initial.tripMonth,'2026-07');
  await assert.rejects(create({...review,id:'20000000-0000-4000-8000-000000000002'}).reviewDetail(source,id),errorCode('service_unavailable'));
  await assert.rejects(create({...review,trip_responses:{version:2,answers:{}}}).reviewDetail(source,id),errorCode('service_unavailable'));
});

test('a shared review must match its requested ID and be a published dated result',async()=>{
  const review={id,quality:4,body:'A published review.',published_at:'2026-11-17T00:00:00Z',trip_responses:null};
  const create=r=>createLaunchClient({enabled:true,getAccessToken:async()=>null,fetcher:async()=>response({review:r})});
  assert.equal((await create(review).publicReview(source,id)).id,id);
  await assert.rejects(create({...review,status:'pending'}).publicReview(source,id),errorCode('service_unavailable'));
  await assert.rejects(create({...review,id:'20000000-0000-4000-8000-000000000002'}).publicReview(source,id),errorCode('service_unavailable'));
});

test('owner declaration readback is attributed and save requires a real receipt',async()=>{
  let payload;const details={boat:'Drift boat',gear:'',yearsExperience:0,expertise:'',species:''};
  const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async(_url,init)=>{payload=JSON.parse(init.body);return payload.operation==='profile_details'?response({details:{boat:'Drift boat',gear:null,years_experience:0,expertise:null,targeted_species:null},attribution:'captain_declared'}):response({status:'saved'})}});
  assert.equal((await client.profileDetails(source)).yearsExperience,0);
  await client.editDetails(source,details);assert.equal(payload.operation,'edit_details');assert.equal(payload.yearsExperience,0);
  const bad=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({status:'unknown'})});
  await assert.rejects(bad.editDetails(source,details),errorCode('service_unavailable'));
});

test('claim and owner fields enforce the retained database limits before sending',async()=>{
  let calls=0;const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>{calls++;return response({id,status:'pending'})}});
  await assert.rejects(client.submitClaim(source,{claimantName:'A Guide',businessName:'',evidence:'x'.repeat(1201)}),errorCode('invalid_input'));
  const base={boat:'',gear:'',yearsExperience:null,expertise:'',species:''};
  for(const changes of [{boat:'x'.repeat(251)},{gear:'x'.repeat(501)},{expertise:'x'.repeat(501)},{species:'x'.repeat(351)},{yearsExperience:81}])await assert.rejects(client.editDetails(source,{...base,...changes}),errorCode('invalid_input'));
  assert.equal(calls,0);
  await client.submitClaim(source,{claimantName:'A Guide',businessName:'',evidence:'x'.repeat(1200)});assert.equal(calls,1);
});

test('operator queue requires authorization and does not approve a revision without guide identity',async()=>{
  let tokenRequested=false;
  const row={id,review_id:id,body:'An edited trip report.',quality:4,relationship_disclosure:'none',trip_responses:null,created_at:'2026-11-17T00:00:00Z'};
  const client=createLaunchClient({enabled:true,getAccessToken:async()=>{tokenRequested=true;return 'token'},fetcher:async()=>response({items:[row],offset:0,limit:50})});
  const [item]=await client.operatorQueue('revision');
  assert.equal(tokenRequested,true);assert.equal(item.reviewId,id);assert.equal(item.canApprove,false);
});

test('moderators see review and revision trip values and cannot approve missing values',async()=>{
  const row={id,guide_name:'Fixture guide',body:'A firsthand trip.',quality:4,intensity:3,would_book_again:false,trip_month:'2026-07-01',relationship_disclosure:'none',trip_responses:null,firsthand_attested:true,created_at:'2026-11-17T00:00:00Z'};
  const create=value=>createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({items:[value],offset:0,limit:50})});
  const review=(await create(row).operatorQueue('review'))[0];
  assert.equal(review.canApprove,true);assert.match(review.description,/Trip month: 2026-07/);assert.match(review.description,/Trip intensity: 3 \/ 5/);assert.match(review.description,/Would book again: No/);
  const skipped=(await create({...row,intensity:null,would_book_again:null,trip_month:null}).operatorQueue('review'))[0];
  assert.match(skipped.description,/Trip intensity: Not answered/);assert.match(skipped.description,/Would book again: Not answered/);assert.match(skipped.description,/Trip month: Not supplied/);
  for(const key of ['intensity','would_book_again','trip_month','trip_responses']){const incomplete={...row};delete incomplete[key];const item=(await create(incomplete).operatorQueue('review'))[0];assert.equal(item.canApprove,false,`missing ${key} must disable approval`)}
  const revision={...row,review_id:id,trip_month_specified:false};
  assert.match((await create(revision).operatorQueue('revision'))[0].description,/Trip month: Unchanged/);
  assert.match((await create({...revision,trip_month_specified:true,trip_month:null}).operatorQueue('revision'))[0].description,/Trip month: Cleared/);
});

test('moderator actions reject generic or mismatched receipts rather than inventing an outcome',async()=>{
  const create=value=>createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response(value)});
  await assert.rejects(create({status:'decided'}).operatorDecide('review',id,true,'Manual evidence has been reviewed.'),errorCode('service_unavailable'));
  await assert.rejects(create({id,status:'rejected'}).operatorDecide('review',id,true,'Manual evidence has been reviewed.'),errorCode('service_unavailable'));
  assert.equal((await create({id,status:'published'}).operatorDecide('review',id,true,'Manual evidence has been reviewed.')).status,'published');
});

test('reports require a persisted receipt, retain prior-report status and never accept an invalid reason',async()=>{
  let calls=0,payload;const create=value=>createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async(_url,init)=>{calls++;payload=JSON.parse(init.body);return response(value)}});
  const client=create({id,status:'submitted',existing:true});
  assert.equal((await client.reportReview(source,id,'other')).existing,true);assert.equal(payload.operation,'report_review');assert.equal(payload.reviewId,id);
  await assert.rejects(client.reportReview(source,id,'invented'),errorCode('invalid_input'));assert.equal(calls,1);
  for(const value of [{id,status:'submitted'},{id,status:'pending',existing:false},{id:'bad',status:'submitted',existing:false}])await assert.rejects(create(value).reportReview(source,id,'other'),errorCode('service_unavailable'));
  assert.equal((await create({id,status:'resolved'}).resolveReport(id)).status,'resolved');
  await assert.rejects(create({id,status:'submitted'}).resolveReport(id),errorCode('service_unavailable'));
});

test('report queue never exposes hidden review text and duplicate requires a confirmed 409',async()=>{
  const row={id,review_id:id,reason:'other',review_status:'removed',public_review_body:null,guide_name:'Guide',created_at:'2026-11-17T00:00:00Z'};
  const create=value=>createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>response({items:[value],offset:0,limit:50})});
  assert.match((await create(row).operatorQueue('report'))[0].description,/not public/);
  await assert.rejects(create({...row,public_review_body:'private draft'}).operatorQueue('report'),errorCode('service_unavailable'));
  for(const [status,expected] of [[409,'duplicate_review'],[503,'service_unavailable']]){
    const client=createLaunchClient({enabled:true,getAccessToken:async()=> 'token',fetcher:async()=>({ok:false,status,json:async()=>({error:'duplicate_review'})})});
    await assert.rejects(client.submitReview(source,draft),errorCode(expected));
  }
});

test('public results distinguish a valid empty set from an error and never attach auth',async()=>{
  let authRequested=false,headers;
  const client=createLaunchClient({enabled:true,getAccessToken:async()=>{authRequested=true;return 'token'},fetcher:async(_url,init)=>{headers=init.headers;return response({summary:{count:0,averageQuality:null},reviews:[]})}});
  const result=await client.publicReviews(source);
  assert.equal(result.count,0);assert.equal(result.averageQuality,null);assert.equal(result.reviews.length,0);
  assert.equal(authRequested,false);assert.equal(headers.Authorization,undefined);
  const missing=createLaunchClient({enabled:true,getAccessToken:async()=>null,fetcher:async()=>response({error:'not_found'},false)});
  await assert.rejects(missing.publicReviews(source),errorCode('not_found'));
  const invalid=createLaunchClient({enabled:true,getAccessToken:async()=>null,fetcher:async()=>response({summary:{count:1,averageQuality:5},reviews:[{id,quality:5,body:'a review',published_at:null}]})});
  await assert.rejects(invalid.publicReviews(source),errorCode('service_unavailable'));
});

test('public results retain the full aggregate and only accept a published dated record',async()=>{
  const review={id,quality:5,body:'A published account of a trip.',published_at:'2026-11-17T00:00:00Z'};
  const create=value=>createLaunchClient({enabled:true,getAccessToken:async()=>null,fetcher:async()=>response(value)});
  const good=await create({summary:{count:5,averageQuality:4.2},reviews:[review]}).publicReviews(source);
  assert.equal(good.count,5);assert.equal(good.averageQuality,4.2);assert.equal(good.reviews[0].id,id);
  for(const bad of [{...review,status:'pending'},{...review,published_at:'not-a-date'}]) {
    await assert.rejects(create({summary:{count:1,averageQuality:5},reviews:[bad]}).publicReviews(source),errorCode('service_unavailable'));
  }
});

test('public review details retain explicit negatives and not applicable responses',async()=>{
  const review={id,quality:5,body:'A published account.',published_at:'2026-11-17T00:00:00Z',trip_responses:{version:1,answers:{dog_present:{state:'answered',value:false},children_present:{state:'not_applicable'}}}};
  const client=createLaunchClient({enabled:true,getAccessToken:async()=>null,fetcher:async()=>response({summary:{count:1,averageQuality:5},reviews:[review]})});
  const [result]=(await client.publicReviews(source)).reviews;
  assert.ok(result.tripDetails.some(line=>line.includes('Was a dog present? No')));
  assert.ok(result.tripDetails.some(line=>line.includes('Were children on the trip? Not applicable')));
});
