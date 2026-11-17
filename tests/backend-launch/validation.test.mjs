import test from 'node:test';
import assert from 'node:assert/strict';
import {validate} from '../../lib/backend-launch/validation.mjs';
const review={operation:'submit_review',jurisdiction:'OR',sourceId:'or-1',quality:5,intensity:3,wouldBookAgain:true,body:'x'.repeat(80),firsthandAttested:true,relationship:'none'};
const claim={operation:'submit_claim',jurisdiction:'OR',sourceId:'or-1',claimantName:'Test Name',businessName:'',evidence:'e'.repeat(20)};
test('review requires firsthand, full ratings, disclosure and source identity',()=>{
 assert.equal(validate(review),true);
 for(const change of [{firsthandAttested:false},{relationship:'unknown'},{quality:0},{quality:6},{quality:'5'},{intensity:null},{wouldBookAgain:null},{body:'x'.repeat(79)},{body:'x'.repeat(3001)},{jurisdiction:'CA'},{sourceId:''},{status:'published'},{authorId:'other'}])assert.equal(validate({...review,...change}),false,JSON.stringify(change));
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
