const OR_ID=/^OG\.[0-9]{7}(\.[A-Z0-9&]+)?$/;
const WA_ID=/^wa-[0-9]{3,9}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_BATCH={items:[],nextCursor:null};
const json=(value,status=200)=>Response.json(value,{status,headers:{
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
}});
const failure=(status,error)=>json({error},status);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fields=(value,keys)=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const source=(jurisdiction,id)=>typeof id==='string'&&(
 jurisdiction==='OR'?OR_ID.test(id):jurisdiction==='WA'&&WA_ID.test(id));

async function readBody(req){
 const reader=req.body?.getReader();
 if(!reader)return null;
 let size=0;
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let prepared='';
 for(;;){
  const {value,done}=await reader.read();
  if(done)break;
  size+=value.byteLength;
  if(size>32768){await reader.cancel();throw new Error('payload too large')}
  prepared+=decoder.decode(value,{stream:true});
 }
 return JSON.parse(prepared+decoder.decode());
}

function valid(operation,input){
 const owner=input.jurisdiction==='OR'&&source(input.jurisdiction,input.sourceId);
 const revision=integer(input.expectedRevision,0,999999999);
 switch(operation){
  case 'owner_get':return owner&&fields(input,['jurisdiction','sourceId']);
  case 'owner_save':return owner&&revision&&object(input.draft)&&fields(input,['jurisdiction','sourceId','expectedRevision','draft']);
  case 'owner_submit':return owner&&revision&&fields(input,['jurisdiction','sourceId','expectedRevision']);
  case 'moderator_list':return fields(input,['offset','limit'])&&integer(input.offset,0,100000)&&integer(input.limit,1,50);
  case 'moderator_decide':return fields(input,['proposalId','approve','reason'])&&typeof input.proposalId==='string'&&UUID.test(input.proposalId)&&
   typeof input.approve==='boolean'&&typeof input.reason==='string'&&input.reason.trim().length>=(input.approve?20:1)&&input.reason.length<=500;
  case 'public_profile':return fields(input,['jurisdiction','sourceId'])&&source(input.jurisdiction,input.sourceId);
  case 'public_batch':return fields(input,['afterSourceId','limit'])&&integer(input.limit,1,100)&&
   (input.afterSourceId===null||(typeof input.afterSourceId==='string'&&OR_ID.test(input.afterSourceId)));
  default:return false;
 }
}

function dbFailure(code){
 switch(code){
  case '42501':return failure(403,'forbidden');
  case 'P0002':return failure(404,'not_found');
  case '22023':case '22P02':case '23502':case '23514':return failure(400,'invalid_input');
  case '23505':case 'P0001':return failure(409,'conflict');
  case 'P5030':return failure(503,'launch_unavailable');
  default:return failure(503,'service_unavailable');
 }
}

export async function handleGuideOfferings(req,createClient,env){
 if(req.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')return failure(415,'json_required');
 let body;
 try{body=await readBody(req)}catch{return failure(400,'invalid_input')}
 if(!object(body))return failure(400,'invalid_input');
 const {operation,...input}=body;
 if(!valid(operation,input))return failure(400,'invalid_input');
 const publicRead=operation==='public_profile'||operation==='public_batch';
 if(env.RMG_GUIDE_OFFERINGS_ENABLED!=='true'){
  return publicRead?json(operation==='public_profile'?{profile:null}:EMPTY_BATCH):failure(503,'launch_unavailable');
 }
 if(operation==='public_profile'&&input.jurisdiction==='WA')return json({profile:null});
 const token=publicRead?undefined:req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
 if(!publicRead&&!token)return failure(401,'sign_in_required');
 const url=env.NEXT_PUBLIC_SUPABASE_URL,key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return failure(503,'service_unavailable');
 try{
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
   global:{headers:token?{Authorization:`Bearer ${token}`}:{}}});
  if(token){
   const result=await client.auth.getUser(token);
   if(result.error)return !result.error.status||result.error.status>=500?failure(503,'service_unavailable'):failure(401,'sign_in_required');
   const user=result.data?.user;
   if(!user||user.is_anonymous||!user.email_confirmed_at)return failure(401,'sign_in_required');
  }
  const rpc=publicRead?'rmg_guide_offerings_public_v1':'rmg_guide_offerings_authorized_v1';
  const result=await client.rpc(rpc,{p_operation:operation,p_input:input});
  if(result.error)return dbFailure(result.error.code);
  return object(result.data)?json(result.data):failure(503,'service_unavailable');
 }catch{return failure(503,'service_unavailable')}
}
