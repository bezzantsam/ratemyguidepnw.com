import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function compile(path,imports={}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,require:name=>imports[name]??require(name)});return exports;
}
const model=compile('components/launch/trip-responses.ts');
function plain(value){return JSON.parse(JSON.stringify(value))}
function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found}}

test('unanswered, not applicable, false and zero remain distinct',()=>{
  assert.equal(model.encodeTripResponses({}).value,null);
  const result=model.encodeTripResponses({teaching_requested:'value:no',children_present:'na',actual_duration_minutes:'value:0',conversation_preference:'value:quiet'});
  assert.equal(result.error,null);
  assert.deepEqual(plain(result.value),{version:1,answers:{teaching_requested:{state:'answered',value:false},children_present:{state:'not_applicable'},actual_duration_minutes:{state:'answered',value:0},conversation_preference:{state:'answered',value:'quiet'}}});
  assert.equal(Object.hasOwn(result.value.answers,'guide_patience'),false);
});

test('unknown, incomplete and out-of-range answers fail rather than being dropped',()=>{
  for(const draft of [{invented:'value:x'},{effort:'value:0'},{actual_duration_minutes:'value:'},{actual_duration_minutes:'value:1441'},{dog_present:'value:maybe'},{setting:'value:mountain'}]) assert.ok(model.encodeTripResponses(draft).error);
});

test('editing round trips recognized answers and rejects unknown or malformed versions',()=>{
  const original={version:1,answers:{dog_present:{state:'answered',value:false},children_present:{state:'not_applicable'},actual_duration_minutes:{state:'answered',value:0}}};
  const decoded=model.decodeTripResponses(original);
  assert.deepEqual(plain(model.encodeTripResponses(decoded).value),original);
  assert.equal(model.decodeTripResponses({version:2,answers:{}}),null);
  assert.equal(model.decodeTripResponses({version:1,answers:{new_field:{state:'answered',value:'x'}}}),null);
  assert.equal(model.decodeTripResponses({version:1,answers:{dog_present:{state:'not_applicable',value:false}}}),null);
});

test('optional controls start unanswered and never collect names or free text',()=>{
  const views=compile('components/launch/TripDetails.tsx',{react:{useId:()=>':test:'},'./trip-responses':model});
  let draft={};const render=()=>views.TripFields({fields:model.TRIP_FIELDS,draft,onChange:value=>{draft=value}});
  assert.equal(views.TripDetails({draft,onChange:()=>{}}).type,'details');
  let tree=render();
  const dog=find(tree,n=>n.type==='select'&&n.props.id.endsWith('-dog_present'));
  assert.equal(dog.props.value,'');dog.props.onChange({target:{value:'value:no'}});
  const duration=find(render(),n=>n.type==='select'&&n.props.id.endsWith('-actual_duration_band'));
  assert.equal(duration.props.value,'');
  duration.props.onChange({target:{value:'value:over_6_to_8'}});
  assert.equal(model.encodeTripResponses(draft).value.answers.dog_present.value,false);
  assert.equal(model.encodeTripResponses(draft).value.answers.actual_duration_band.value,'over_6_to_8');
  assert.equal(find(render(),n=>n.type==='textarea'),undefined);
});


test('survey ratings reuse organization once and keep blank and numeric zero separate',()=>{
  assert.equal(model.TRIP_FIELDS.filter(field=>field.key==='organization').length,1);
  const draft={organization:'value:4',kindness:'value:5',fishiness:'value:2',fish_landed:'value:0'};
  const payload=model.encodeTripResponses(draft).value;
  assert.deepEqual(plain(model.decodeTripResponses(payload)),draft);
  assert.equal(payload.answers.fish_landed.value,0);
  const skipped=model.encodeTripResponses({...draft,fish_landed:''}).value;
  assert.equal(Object.hasOwn(skipped.answers,'fish_landed'),false);
  const unavailable=model.encodeTripResponses({...draft,fish_landed:'na'}).value;
  assert.deepEqual(plain(unavailable.answers.fish_landed),{state:'not_applicable'});
  assert.deepEqual(Array.from(model.describeTripResponses(payload)),[
    'Kindness: 5 / 5','Organization: 4 / 5','Finding fish: 2 / 5','Fish landed by the group: 0',
  ]);
  for(const entry of ['value:-1','value:2.5','value:2147483648','value:','value:unknown']) {
    assert.ok(model.encodeTripResponses({fish_landed:entry}).error,entry);
  }
  assert.equal(model.encodeTripResponses({fish_landed:'value:2147483647'}).value.answers.fish_landed.value,2147483647);
});


test('cleared survey ratings and catch display as unanswered without changing stored state',()=>{
  const doc={version:1,answers:{kindness:{state:'not_applicable'},organization:{state:'not_applicable'},
    fishiness:{state:'not_applicable'},fish_landed:{state:'not_applicable'},children_present:{state:'not_applicable'}}};
  const draft=model.decodeTripResponses(doc);
  assert.deepEqual(plain(model.encodeTripResponses(draft).value),doc);
  assert.deepEqual(Array.from(model.describeTripResponses(doc)),[
    'Were children on the trip? Not applicable','Kindness: Unanswered','Organization: Unanswered',
    'Finding fish: Unanswered','Fish landed by the group: Unanswered',
  ]);
  const views=compile('components/launch/TripDetails.tsx',{react:{useId:()=>':test:'},'./trip-responses':model});
  const tree=views.TripFields({fields:[...model.REVIEW_TRIP_RATINGS,model.FISH_LANDED_FIELD],draft,onChange:()=>{}});
  for(const key of ['kindness','organization','fishiness','fish_landed']) {
    const field=find(tree,node=>(node.type==='select'||node.type==='input')&&node.props.id.endsWith('-'+key));
    assert.equal(field.props.value,'');
  }
  assert.equal(find(tree,node=>node.type==='option'&&node.props.value==='na'),undefined);
});

test('timing bands replace old minutes only on a deliberate edit and recognition is independently selectable',()=>{
  const views=compile('components/launch/TripDetails.tsx',{react:{useId:()=>':trip:'},'./trip-responses':model});
  let draft={actual_duration_minutes:'value:310',agreed_duration_minutes:'value:0'};
  const render=()=>views.TripFields({fields:model.TRIP_TIMING_FIELDS,draft,onChange:next=>{draft=next}});
  const control=key=>find(render(),node=>node.props?.id?.endsWith('-'+key));
  const actual=control('actual_duration_band');
  assert.equal(actual.props.value,'legacy');
  assert.match(find(actual,n=>n.type==='option'&&n.props.value==='legacy').props.children,/310 minutes/);
  assert.equal(control('agreed_duration_band').props.value,'legacy');
  assert.deepEqual(Object.keys(model.encodeTripResponses(draft).value.answers),['agreed_duration_minutes','actual_duration_minutes']);
  actual.props.onChange({target:{value:'value:over_4_to_6'}});
  control('agreed_duration_band').props.onChange({target:{value:''}});
  control('limited_out_early').props.onChange({target:{checked:true}});
  control('guide_stayed_extra').props.onChange({target:{checked:true}});
  assert.equal(control('limited_out_early').props.checked,true);
  assert.equal(control('guide_stayed_extra').props.checked,true);
  const encoded=model.encodeTripResponses(draft).value;
  assert.deepEqual(plain(model.decodeTripResponses(encoded)),plain(draft));
  assert.deepEqual(Array.from(model.describeTripResponses(encoded)),[
    'How long did the trip last? Over 4 to 6 hours','We limited out early',
    'The guide stayed past our booked time to keep fishing',
  ]);
  control('limited_out_early').props.onChange({target:{checked:false}});
  assert.equal(Object.hasOwn(draft,'limited_out_early'),false);
  assert.equal(control('guide_stayed_extra').props.checked,true);
  for(const invalid of [
    {guide_stayed_extra:'value:no'}, {actual_duration_band:'value:over_20'},
    {actual_duration_band:'value:up_to_4',actual_duration_minutes:'value:100'},
  ]) assert.ok(model.encodeTripResponses(invalid).error);
  assert.deepEqual(Array.from(model.describeTripResponses({version:1,answers:{
    limited_out_early:{state:'not_applicable'},actual_duration_band:{state:'not_applicable'},
  }})),[]);
});
