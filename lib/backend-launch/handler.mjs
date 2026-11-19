import {validate,safeReturnTo} from './validation.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(status,code)=>json({error:code},status);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function body(req){
 const reader=req.body?.getReader();if(!reader)return null;
 const parts=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new Error('too_large')}parts.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function dbError(error){
 switch(error?.code){case '42501':return fail(403,'forbidden');case 'P0002':return fail(404,'not_found');case '22023':case '22P02':case '23502':case '23514':return fail(400,'invalid_input');case 'P4091':return fail(409,'duplicate_review');case '23505':case 'P0001':return fail(409,'conflict');case 'P4290':return fail(429,'rate_limited');case 'P5030':return fail(503,'launch_unavailable');default:return fail(503,'service_unavailable')}
}
const args=(x)=>({p_jurisdiction:x.jurisdiction,p_source_id:x.sourceId});
async function isAdmin(client){const r=await client.rpc('is_site_admin');return !r.error&&r.data===true}
export async function handleLaunch(req, createClient, env){
 const launch=env.RMG_LAUNCH_ENABLED==='true';
 if(!launch&&env.NEXT_PUBLIC_RMG_AUTH_CHECK_ENABLED!=='true')return fail(503,'launch_unavailable');
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return fail(415,'json_required');
 let x;try{x=await body(req)}catch{return fail(400,'invalid_input')}
 if(!validate(x))return fail(400,'invalid_input');
 if(!launch&&x.operation!=='session')return fail(503,'launch_unavailable');
 if(x.operation==='safe_return')return json({returnTo:safeReturnTo(x.returnTo)});
 const claimOperation=x.operation==='submit_claim'||x.operation==='edit_details'||
  ((x.operation==='operator_queue'||x.operation==='operator_decide')&&x.kind==='claim');
 if(claimOperation&&env.RMG_CLAIMS_ENABLED!=='true')return fail(503,'launch_unavailable');
 if(x.jurisdiction==='WA'){
  if(x.operation==='review_write_availability')return json({available:false});
  if(['submit_review','report_review','submit_claim','edit_details'].includes(x.operation))return fail(403,'forbidden');
 }
 const url=env.NEXT_PUBLIC_SUPABASE_URL,key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return fail(503,'service_unavailable');
 const header=req.headers.get('authorization');const token=header?.match(/^Bearer ([^\s]+)$/i)?.[1];
 if(!['public_reviews','review_detail','profile_details','review_write_availability'].includes(x.operation)&&!token)return fail(401,'sign_in_required');
 try{
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:token?{Authorization:`Bearer ${token}`}:{}}});
  if(token){
   const result=await client.auth.getUser(token);
   if(result.error){const status=result.error.status;return !status||status>=500?fail(503,'service_unavailable'):fail(401,'sign_in_required')}
   if(!result.data.user||result.data.user.is_anonymous||!result.data.user.email_confirmed_at)return fail(401,'sign_in_required');
  }
  if(x.operation==='session'){
   if(launch)return json({authenticated:true,operator:await isAdmin(client)});
   const role=await client.rpc('is_site_admin');
   if(role.error||typeof role.data!=='boolean')return fail(503,'service_unavailable');
   if(!role.data)return json({authenticated:true,operator:false});
   const queue=await client.from('admin_pending_reviews').select('id',{head:true}).limit(1);
   if(queue.error)return dbError(queue.error);
   return json({authenticated:true,operator:true,reviewQueueReady:true});
  }
  if(x.operation==='review_write_availability'){
   const r=await client.rpc('rmg_review_write_availability',args(x));
   return r.error?dbError(r.error):typeof r.data?.available==='boolean'?json({available:r.data.available}):fail(503,'service_unavailable');
  }
  if(x.operation==='own_review_for_guide'){
   const r=await client.rpc('rmg_own_review_for_guide',args(x));
   if(r.error)return dbError(r.error);
   if(r.data===null)return json({review:null});
   return typeof r.data?.id==='string'&&uuid.test(r.data.id)&&['pending','published','rejected','removed'].includes(r.data.status)?json({review:{id:r.data.id,status:r.data.status}}):fail(503,'service_unavailable');
  }
  if(x.operation==='profile_details'){
   const r=await client.rpc('rmg_profile_details',args(x));
   return r.error?dbError(r.error):json({details:r.data,attribution:'captain_declared'});
  }
  if(x.operation==='review_detail'){
   const mapped=await client.rpc('rmg_resolve_guide',args(x));if(mapped.error)return dbError(mapped.error);
   const r=await client.from('public_angler_reviews').select('id,quality,intensity,would_book_again,body,trip_month,published_at,relationship_disclosure,trip_responses').eq('guide_id',mapped.data).eq('id',x.id).maybeSingle();
   return r.error?dbError(r.error):r.data?json({review:r.data}):fail(404,'not_found');
  }
  if(x.operation==='public_reviews'){
   const mapped=await client.rpc('rmg_resolve_guide',args(x));if(mapped.error)return dbError(mapped.error);
   const [summary,reviews]=await Promise.all([client.rpc('rmg_review_summary',args(x)),client.from('public_angler_reviews').select('id,quality,intensity,would_book_again,body,trip_month,published_at,relationship_disclosure,trip_responses').eq('guide_id',mapped.data).order('published_at',{ascending:false}).limit(100)]);
   if(summary.error||reviews.error)return dbError(summary.error||reviews.error);
   return json({summary:summary.data,reviews:reviews.data,limit:100});
  }
  if(x.operation==='operator_queue'||x.operation==='operator_decide'||x.operation==='resolve_report'){
   if(!await isAdmin(client))return fail(403,'forbidden');
   if(x.operation==='resolve_report'){const r=await client.rpc('rmg_resolve_report',{p_id:x.id});return r.error?dbError(r.error):typeof r.data?.id==='string'&&r.data.id.toLowerCase()===x.id.toLowerCase()&&r.data.status==='resolved'?json(r.data):fail(503,'service_unavailable')}
   if(x.operation==='operator_queue'){
    if(x.kind==='report'){const r=await client.rpc('rmg_report_queue',{p_offset:x.offset,p_limit:x.limit});return r.error?dbError(r.error):Array.isArray(r.data)?json({items:r.data,offset:x.offset,limit:x.limit}):fail(503,'service_unavailable')}
    if(x.kind==='revision'){const r=await client.rpc('rmg_revision_queue',{p_offset:x.offset,p_limit:x.limit});return r.error?dbError(r.error):json({items:r.data,offset:x.offset,limit:x.limit})}
    const name=x.kind==='claim'?'admin_pending_claims':'admin_pending_reviews';
    const r=await client.from(name).select('*').order('created_at',{ascending:true}).order('id',{ascending:true}).range(x.offset,x.offset+x.limit-1);
    return r.error?dbError(r.error):json({items:r.data,offset:x.offset,limit:x.limit});
   }
   const r=x.kind==='revision'?await client.rpc('rmg_decide_revision',{p_id:x.id,p_approve:x.approve,p_reason:x.reason}):await client.rpc('rmg_decide_submission',{p_kind:x.kind,p_id:x.id,p_approve:x.approve,p_reason:x.reason});
   return r.error?dbError(r.error):json(r.data);
  }
  let name,params;
  switch(x.operation){
   case 'report_review':name='rmg_report_review';params={...args(x),p_review_id:x.reviewId,p_reason:x.reason};break;
   case 'submit_review':name='rmg_submit_review_v2';params={...args(x),p_quality:x.quality,p_intensity:x.intensity??null,p_rebook:x.wouldBookAgain??null,p_body:x.body,p_firsthand:x.firsthandAttested,p_relationship:x.relationship,p_trip_responses:x.tripResponses??null,p_trip_month:x.tripMonth??null};break;
   case 'submit_revision':name='rmg_submit_revision_v2';params={p_review_id:x.reviewId,p_quality:x.quality,p_intensity:x.intensity??null,p_rebook:x.wouldBookAgain??null,p_body:x.body,p_firsthand:x.firsthandAttested,p_relationship:x.relationship,p_trip_responses:x.tripResponses??null,p_trip_month_specified:Object.hasOwn(x,'tripMonth'),p_trip_month:x.tripMonth??null};break;
   case 'submit_claim':name='rmg_submit_claim';params={...args(x),p_name:x.claimantName,p_business:x.businessName,p_evidence:x.evidence};break;
   case 'own_status':name='rmg_own_status';params={p_kind:x.kind,p_id:x.id};break;
   case 'my_submissions':name='rmg_my_submissions';params={p_offset:x.offset,p_limit:x.limit};break;
   case 'edit_details':name='rmg_edit_details';params={...args(x),p_boat:x.boat,p_gear:x.gear,p_years:x.yearsExperience,p_expertise:x.expertise,p_species:x.species};break;
   default:return fail(400,'invalid_input');
  }
  const r=await client.rpc(name,params);
  if(r.error)return dbError(r.error);
  if(x.operation==='report_review'&&(!r.data||typeof r.data.id!=='string'||!uuid.test(r.data.id)||r.data.status!=='submitted'||typeof r.data.existing!=='boolean'))return fail(503,'service_unavailable');
  return x.operation==='my_submissions'?json({items:r.data,offset:x.offset,limit:x.limit}):json(r.data);
 }catch{return fail(503,'service_unavailable')}
}
