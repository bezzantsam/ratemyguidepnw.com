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
 for(const change of [{evidence:'short'},{claimantName:'x'},{businessName:null},{status:'approved'},{claimantId:'other'}])assert.equal(validate({...claim,...change}),false);
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
 assert.equal(validate(x),true);assert.equal(validate({...x,licenseNumber:'123'}),false);assert.equal(validate({...x,reviewId:'123'}),false);assert.equal(validate({...x,yearsExperience:101}),false);
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
 for(const bad of ['https://evil.example/','//evil.example/','/\\evil.example','/%2f%2fevil.example','/guides/a?token=secret','/guides/a#private','/other','/guides/a\n'])assert.equal(safeReturnTo(bad),null,bad);
});
