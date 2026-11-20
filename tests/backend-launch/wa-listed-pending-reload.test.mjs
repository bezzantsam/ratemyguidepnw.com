import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const pgLog=process.env.RMG_WA_LISTED_PG_LOG;
const requireNode=createRequire(import.meta.url);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function compile(source,imports,globals={}){
 const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,
 }}).outputText;
 const exports={};
 vm.runInNewContext(js,{exports,URL,Response,fetch,process:{env:{}},
  require:name=>imports[name]??requireNode(name),...globals});
 return exports;
}

function hasText(node,text){
 if(node===text)return true;
 if(Array.isArray(node))return node.some(child=>hasText(child,text));
 return node!=null&&typeof node==='object'&&hasText(node.props?.children,text);
}

test('actual PG pending revision survives WA profile mount and reload', {skip:!pgLog},async()=>{
 const marker='LISTED_PENDING_RECEIPTS=';
 const line=readFileSync(pgLog,'utf8').split('\n').map(value=>value.trim()).find(value=>value.startsWith(marker));
 assert.ok(line,'real PG receipt snapshot is required');
 const items=JSON.parse(line.slice(marker.length));
 const revision=items.find(item=>item.kind==='revision');
 const review=items.find(item=>item.kind==='review'&&item.id===revision?.review_id);
 assert.equal(revision?.status,'pending');
 assert.equal(review?.status,'published');
 const source={jurisdiction:'WA',sourceId:'wa-001'};
 const clientModule=compile(readFileSync('lib/launch-client.ts','utf8'),{
  '@/components/launch/submission-model':{},'@/components/launch/trip-responses':{},
 });
 const client=clientModule.createLaunchClient({enabled:true,getAccessToken:async()=> 'synthetic',
  fetcher:async(_path,init)=>{
   const request=JSON.parse(init.body);
   assert.equal(request.operation,'my_submissions');
   return Response.json({items,offset:request.offset,limit:request.limit});
  }});
 const api={
  mySubmissions:client.mySubmissions, session:async()=>({authenticated:true,operator:false}),
  reviewWriteAvailability:async()=>true, ownReviewForGuide:async()=>({id:review.id,status:'published'}),
  publicReviews:async()=>({count:1,averageQuality:3,reviews:[]}),
 };
 const ui=readFileSync('components/launch/GuideEngagement.tsx','utf8');
 const auth={auth:{getSession:async()=>({data:{session:{user:{id:'synthetic-reviewer'},access_token:'synthetic'}}}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
 function AuthPanel() {}
 function ProfileSharing() {}
 function PublishedReviews() {}
 function ReviewCard() {}
 function ReviewSubmission() {}
 function ClaimSubmission() {}

 async function freshMount(){
  let cursor=0,effects=[];
  const slots=[];
  function memo(factory,deps){
   const i=cursor++;
   const old=slots[i];
   if(!old||!deps||deps.some((value,j)=>!Object.is(value,old.deps[j])))slots[i]={value:factory(),deps};
   return slots[i].value;
  }
  const react={
   useState(initial){
    const i=cursor++;
    if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
    return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}];
   },
   useRef:initial=>memo(()=>({current:initial}),[]),useMemo:memo,
   useCallback:(fn,deps)=>memo(()=>fn,deps),
   useEffect:(fn,deps)=>memo(()=>{effects.push(fn);return null},deps),
  };
  const view=compile(ui,{
   react,'@/components/AuthPanel':{__esModule:true,default:AuthPanel,client:auth},
   '@/lib/launch-client':{createLaunchClient:()=>api,LaunchClientError:clientModule.LaunchClientError},
   '@/lib/canonical-share':{publishedReviewIdFromHash:()=>null},'./ProfileSharing':{ProfileSharing},
   './PublishedReviews':{PublishedReviews,ReviewCard,validReviewPage:()=>true},
   './SubmissionViews':{ReviewSubmission,ClaimSubmission},
  },{window:{location:{hash:''},addEventListener(){},removeEventListener(){}}});
  let result;
  for(let pass=0;pass<5;pass++){
   cursor=0;
   effects=[];
   result=view.GuideEngagement({source,profilePath:'/washington/wa-001',guideName:'Synthetic guide',compactProfile:true});
   for(const run of effects)run();
   await tick();
  }
  return result;
 }
 for(let load=0;load<2;load++){
  const tree=await freshMount();
  assert.equal(hasText(tree,'Your changes are awaiting review.'),true);
  assert.equal(hasText(tree,'Edit your review'),false);
 }
});
