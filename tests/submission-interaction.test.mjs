import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const ts=require('typescript');
const receiptId='10000000-0000-4000-8000-000000000001';
const trip=compile('components/launch/trip-responses.ts');
const details={TripDetails:function TripDetails(){}};
function compile(path, imports={}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,require:name=>imports[name]??require(name)});
  return exports;
}
function hookHarness() {
  const cells=[];let cursor=0;
  return {
    reset(){cursor=0},
    react:{
      useId:()=>':test:',
      useState(initial){const slot=cursor++;if(!(slot in cells))cells[slot]=typeof initial==='function'?initial():initial;return [cells[slot],value=>{cells[slot]=value}]},
      useRef(initial){const slot=cursor++;if(!(slot in cells))cells[slot]={current:initial};return cells[slot]},
    },
  };
}
function find(element, predicate) {
  if (!element || typeof element!=='object') return undefined;
  if (predicate(element)) return element;
  for(const child of [element.props?.children].flat(Infinity)) {const match=find(child,predicate);if(match)return match}
  return undefined;
}
function setup(onSubmit,allowTripResponses=false) {
  const hooks=hookHarness();
  const model=compile('components/launch/submission-model.ts');
  const views=compile('components/launch/SubmissionViews.tsx',{react:hooks.react,'./submission-model':model,'./trip-responses':trip,'./TripDetails':details});
  const render=()=>{hooks.reset();return views.ReviewSubmission({onSubmit,allowTripResponses})};
  return {render,views};
}

test('optional trip answers are validated and passed without inventing unanswered values',async()=>{
  let captured;const {render}=setup(async draft=>{captured=draft;return {id:receiptId,status:'pending'}},true);
  enterReview(render);
  find(render(),node=>node.type===details.TripDetails).props.onChange({dog_present:'value:no',children_present:'na',actual_duration_minutes:'value:0'});
  await render().props.onSubmit({preventDefault(){}});
  assert.equal(captured.tripResponses.answers.dog_present.value,false);
  assert.equal(captured.tripResponses.answers.children_present.state,'not_applicable');
  assert.equal(captured.tripResponses.answers.actual_duration_minutes.value,0);
  assert.equal(Object.hasOwn(captured.tripResponses.answers,'guide_patience'),false);
});
function enterReview(render) {
  const tree=render();
  for(const [suffix,value] of [['-quality','5'],['-intensity','3'],['-again','no'],['-relationship','none'],['-body','A firsthand description of the fishing trip. '.repeat(3)]]) {
    const control=find(tree,node=>node.props?.id?.endsWith(suffix));
    assert.ok(control,suffix);
    control.props.onChange({target:{value}});
  }
  const checkbox=find(tree,node=>node.type==='input'&&node.props.type==='checkbox');
  checkbox.props.onChange({target:{checked:true}});
}

test('submission sends user answers once and shows only the confirmed receipt',async()=>{
  let calls=0,resolveSubmission,captured;
  const {render,views}=setup(draft=>{calls++;captured=draft;return new Promise(resolve=>{resolveSubmission=resolve})});
  enterReview(render);
  const form=render();
  const first=form.props.onSubmit({preventDefault(){}});
  const second=form.props.onSubmit({preventDefault(){}});
  assert.equal(calls,1);
  assert.equal(captured.quality,5);
  assert.equal(captured.intensity,3);
  assert.equal(captured.wouldBookAgain,false);
  assert.equal(captured.firsthand,true);
  assert.equal(captured.relationship,'none');
  resolveSubmission({id:receiptId,status:'pending'});
  await Promise.all([first,second]);
  const result=render();
  assert.equal(result.type,views.SubmissionStatus);
  assert.equal(result.props.receipt.status,'pending');
});

test('an unconfirmed submission stays on the form and offers no false success',async()=>{
  const {render}=setup(async()=>({status:'not-a-real-status'}));
  enterReview(render);
  await render().props.onSubmit({preventDefault(){}});
  const result=render();
  assert.equal(result.type,'form');
  const alert=find(result,node=>node.props?.role==='alert');
  assert.match(alert.props.children,/could not confirm/i);
});

test('claim submission preserves the persisted denied state',async()=>{
  const hooks=hookHarness();
  const model=compile('components/launch/submission-model.ts');
  const views=compile('components/launch/SubmissionViews.tsx',{react:hooks.react,'./submission-model':model,'./trip-responses':trip,'./TripDetails':details});
  let captured;
  const render=()=>{hooks.reset();return views.ClaimSubmission({onSubmit:async draft=>{captured=draft;return {id:receiptId,status:'denied'}}})};
  find(render(),node=>node.props?.id?.endsWith('-claimant')).props.onChange({target:{value:' A Guide '}});
  find(render(),node=>node.type==='textarea').props.onChange({target:{value:' I operate this listed business. '}});
  await render().props.onSubmit({preventDefault(){}});
  const result=render();
  assert.equal(captured.claimantName,'A Guide');
  assert.equal(captured.evidence,'I operate this listed business.');
  assert.equal(result.type,views.SubmissionStatus);
  assert.equal(result.props.receipt.status,'denied');
});

test('moderation requires a rejection reason and waits for the actual decision',async()=>{
  const hooks=hookHarness();
  const model=compile('components/launch/submission-model.ts');
  const views=compile('components/launch/SubmissionViews.tsx',{react:hooks.react,'./submission-model':model,'./trip-responses':trip,'./TripDetails':details});
  const queue=compile('components/launch/ModerationQueue.tsx',{react:hooks.react,'./submission-model':model,'./SubmissionViews':views});
  let calls=0,resolveDecision,captured;
  const item={id:receiptId,kind:'claim',guideName:'Guide',description:'Evidence',submittedAt:'2026-11-17'};
  const onDecide=(...args)=>{calls++;captured=args;return new Promise(resolve=>{resolveDecision=resolve})};
  const container=queue.ModerationQueue({state:{status:'ready',items:[item]},onDecide});
  const element=find(container,node=>node.props?.item?.id===receiptId);
  const render=()=>{hooks.reset();return element.type(element.props)};
  const reject=()=>find(render(),node=>node.type==='button'&&node.props.children==='Reject');
  reject().props.onClick();
  assert.equal(calls,0);
  assert.match(find(render(),node=>node.props?.role==='alert').props.children,/reason/i);
  find(render(),node=>node.type==='textarea').props.onChange({target:{value:'Evidence does not match.'}});
  const button=reject();
  button.props.onClick();button.props.onClick();
  assert.equal(calls,1);
  assert.equal(captured[0].id,receiptId);
  assert.equal(captured[1],'reject');
  assert.equal(captured[2],'Evidence does not match.');
  resolveDecision({id:receiptId,status:'denied'});
  await new Promise(resolve=>setImmediate(resolve));
  const status=find(render(),node=>node.type===views.SubmissionStatus);
  assert.equal(status.props.receipt.status,'denied');
});
