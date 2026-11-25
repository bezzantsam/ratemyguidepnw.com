import test from 'node:test';
import assert from 'node:assert/strict';
import {validate,validateTripResponses,safeReturnTo} from '../../lib/backend-launch/validation.mjs';
const review={operation:'submit_review',jurisdiction:'OR',sourceId:'or-1',quality:5,intensity:3,wouldBookAgain:true,body:'x'.repeat(80),firsthandAttested:true,relationship:'none'};
const claim={operation:'submit_claim',jurisdiction:'OR',sourceId:'or-1',claimantName:'Test Name',businessName:'',evidence:'e'.repeat(20)};
test('review requires firsthand, full ratings, disclosure and source identity',()=>{
 assert.equal(validate(review),true);
 for(const change of [{firsthandAttested:false},{relationship:'unknown'},{quality:0},{quality:6},{quality:'5'},{intensity:0},{wouldBookAgain:'no'},{body:' '},{body:'x'.repeat(3001)},{jurisdiction:'CA'},{sourceId:''},{status:'published'},{authorId:'other'}])assert.equal(validate({...review,...change}),false,JSON.stringify(change));
 assert.equal(validate({...review,intensity:null,wouldBookAgain:null,body:'Good'}),true);
 const {intensity,wouldBookAgain,...basic}=review;assert.equal(validate({...basic,body:'Good'}),true);
});
test('claim requires evidence and forbids forged status',()=>{
 assert.equal(validate(claim),true);
 assert.equal(validate({...claim,evidence:'e'.repeat(1200)}),true);
 for(const change of [{evidence:'short'},{evidence:'e'.repeat(1201)},{claimantName:'x'},{businessName:null},{status:'approved'},{claimantId:'other'}])assert.equal(validate({...claim,...change}),false);
});
test('operator and status inputs are bounded and cannot assert authority',()=>{
 const id='00000000-0000-0000-0000-000000000001';
 assert.equal(validate({operation:'own_status',kind:'review',id}),true);
 assert.equal(validate({operation:'own_status',kind:'review',id:'bad'}),false);
 assert.equal(validate({operation:'operator_queue',kind:'claim',offset:0,limit:100}),true);
 assert.equal(validate({operation:'operator_queue',kind:'claim',offset:0,limit:101}),false);
 assert.equal(validate({operation:'operator_queue',kind:'claim',offset:0,limit:1,isAdmin:true}),false);
 assert.equal(validate({operation:'operator_decide',kind:'claim',id,approve:true,reason:'short'}),false);
 assert.equal(validate({operation:'operator_decide',kind:'claim',id,approve:true,reason:'evidence independently checked'}),true);
});
test('owner edit contract excludes registry identity and review fields',()=>{
 const x={operation:'edit_details',jurisdiction:'WA',sourceId:'wa-123',boat:'',gear:'',yearsExperience:null,expertise:'',species:''};
 assert.equal(validate(x),true);assert.equal(validate({...x,boat:'b'.repeat(250),gear:'g'.repeat(500),yearsExperience:80,expertise:'e'.repeat(500),species:'s'.repeat(350)}),true);
 for(const change of [{licenseNumber:'123'},{reviewId:'123'},{boat:'b'.repeat(251)},{gear:'g'.repeat(501)},{yearsExperience:81},{expertise:'e'.repeat(501)},{species:'s'.repeat(351)}])assert.equal(validate({...x,...change}),false);
});
test('versioned answers distinguish missing, not applicable, false and a rating',()=>{
 const v={version:1,answers:{children_present:{state:'answered',value:false},guide_patience:{state:'not_applicable'},effort:{state:'answered',value:1}}};
 assert.equal(validateTripResponses(undefined),true);assert.equal(validateTripResponses(null),true);assert.equal(validateTripResponses(v),true);
 for(const bad of [{version:2,answers:{}},{version:1,answers:{religion:{state:'answered',value:'x'}}},{version:1,answers:{children_present:{state:'answered',value:null}}},{version:1,answers:{effort:{state:'answered',value:0}}},{version:1,answers:{guide_patience:{state:'not_applicable',value:1}}},{version:1,answers:{children_name:{state:'answered',value:'child'}}}])assert.equal(validateTripResponses(bad),false);
 assert.equal(validate({...review,tripResponses:v}),true);assert.equal(validate({...review,tripResponses:{version:1,answers:{politics:{state:'answered',value:'x'}}}}),false);
});
test('auth return accepts only allowed internal destinations and intent',()=>{
 assert.equal(safeReturnTo('/guides/og-123?intent=review#write-review'),'/guides/og-123?intent=review#write-review');
 assert.equal(safeReturnTo('/claim/OG.A%26B'),'/claim/OG.A%26B');
 const id='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
 assert.equal(safeReturnTo(`/guides/og-123?review=${id}`),`/guides/og-123?review=${id}`);
 assert.equal(safeReturnTo(`/washington/wa-123#review-${id}`),`/washington/wa-123#review-${id}`);
 assert.equal(safeReturnTo(`/guides/og-123?review=${id}#review-${id}`),`/guides/og-123?review=${id}#review-${id}`);
 for(const bad of ['https://evil.example/','//evil.example/','/\\evil.example','/%2f%2fevil.example','/guides/a?token=secret','/guides/a#private','/other','/guides/a\n',`/guides/a?review=${id}&x=1`,`/guides/a?review=${id}#review-${other}`,`/admin?review=${id}`,`/guides/a?intent=review#review-${id}`,`/guides/a?review=${id}#write-review`])assert.equal(safeReturnTo(bad),null,bad);
});

test('trip survey records subjective ratings independently of fish landed, including zero',()=>{
 const answered=value=>({state:'answered',value});
 const valid=answers=>validateTripResponses({version:1,answers});
 assert.equal(valid({organization:answered(3),kindness:answered(5),fishiness:answered(1),fish_landed:answered(0)}),true);
 assert.equal(valid({fishiness:answered(5),fish_landed:answered(2147483647)}),true);
 assert.equal(valid({fishiness:answered(5)}),true);
 assert.equal(valid({fish_landed:{state:'not_applicable'}}),true);
 for(const value of [-1,1.5,2147483648,'0',null,true]){
  assert.equal(valid({fish_landed:answered(value)}),false);
 }
 for(const key of ['fishiness','kindness']){
  for(const value of [0,2.5,6,'3'])assert.equal(valid({[key]:answered(value)}),false);
 }
});

test('trip timing accepts one duration per question and only explicit recognition',()=>{
 const answered=value=>({state:'answered',value});
 const valid=answers=>validateTripResponses({version:1,answers});
 for(const prefix of ['agreed','actual']){
  const band=prefix+'_duration_band',minutes=prefix+'_duration_minutes';
  for(const value of ['up_to_4','over_4_to_6','over_6_to_8','over_8_to_10','over_10']){
   assert.equal(valid({[band]:answered(value)}),true);
  }
  for(const value of [0,'8+','Over 10 hours'])assert.equal(valid({[band]:answered(value)}),false);
  assert.equal(valid({[minutes]:answered(0)}),true);
  assert.equal(valid({[minutes]:answered(320),[band]:answered('over_4_to_6')}),false);
 }
 for(const key of ['limited_out_early','guide_stayed_extra']){
  assert.equal(valid({[key]:answered(true)}),true);
  assert.equal(valid({[key]:{state:'not_applicable'}}),true);
  for(const value of [false,'true',1,null])assert.equal(valid({[key]:answered(value)}),false);
 }
});
