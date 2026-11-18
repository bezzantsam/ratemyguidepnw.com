import {validate,safeReturnTo} from './validation.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(status,code)=>json({error:code},status);
async function body(req){
 const reader=req.body?.getReader();if(!reader)return null;
 const parts=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new Error('too_large')}parts.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function dbError(error){
 switch(error?.code){case '42501':return fail(403,'forbidden');case 'P0002':return fail(404,'not_found');case '22023':case '22P02':return fail(400,'invalid_input');case '23505':case 'P0001':return fail(409,'conflict');case 'P4290':return fail(429,'rate_limited');default:return fail(503,'service_unavailable')}
}
const args=(x)=>({p_jurisdiction:x.jurisdiction,p_source_id:x.sourceId});
async function isAdmin(client){const r=await client.rpc('is_site_admin');return !r.error&&r.data===true}
export async function handleLaunch(req, createClient, env){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return fail(415,'json_required');
 let x;try{x=await body(req)}catch{return fail(400,'invalid_input')}
 if(!validate(x))return fail(400,'invalid_input');
 if(x.operation==='safe_return')return json({returnTo:safeReturnTo(x.returnTo)});
 const url=env.NEXT_PUBLIC_SUPABASE_URL,key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return fail(503,'service_unavailable');
 const header=req.headers.get('authorization');const token=header?.match(/^Bearer ([^\s]+)$/i)?.[1];
 if(!['public_reviews','review_detail','profile_details'].includes(x.operation)&&!token)return fail(401,'sign_in_required');
 try{
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:token?{Authorization:`Bearer ${token}`}:{}}});
  if(token){const result=await client.auth.getUser(token);if(result.error||!result.data.user||result.data.user.is_anonymous||!result.data.user.email_confirmed_at)return fail(401,'sign_in_required')}
  if(x.operation==='session')return json({authenticated:true,operator:await isAdmin(client)});
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
  if(x.operation==='operator_queue'||x.operation==='operator_decide'){
   if(!await isAdmin(client))return fail(403,'forbidden');
   if(x.operation==='operator_queue'){
    if(x.kind==='revision'){const r=await client.rpc('rmg_revision_queue',{p_offset:x.offset,p_limit:x.limit});return r.error?dbError(r.error):json({items:r.data,offset:x.offset,limit:x.limit})}
    const name=x.kind==='claim'?'admin_pending_claims':'admin_pending_reviews';
    const r=await client.from(name).select('*').order('created_at',{ascending:true}).order('id',{ascending:true}).range(x.offset,x.offset+x.limit-1);
    return r.error?dbError(r.error):json({items:r.data,offset:x.offset,limit:x.limit});
   }
   const r=await client.rpc(x.kind==='claim'?'admin_decide_claim':x.kind==='revision'?'rmg_decide_revision':'admin_decide_review',{p_id:x.id,p_approve:x.approve,p_reason:x.reason});
   return r.error?dbError(r.error):json(x.kind==='revision'?r.data:{status:'decided'});
  }
  let name,params;
  switch(x.operation){
   case 'submit_review':name='rmg_submit_review';params={...args(x),p_quality:x.quality,p_intensity:x.intensity,p_rebook:x.wouldBookAgain,p_body:x.body,p_firsthand:x.firsthandAttested,p_relationship:x.relationship,p_trip_responses:x.tripResponses??null};break;
   case 'submit_revision':name='rmg_submit_revision';params={p_review_id:x.reviewId,p_quality:x.quality,p_intensity:x.intensity,p_rebook:x.wouldBookAgain,p_body:x.body,p_firsthand:x.firsthandAttested,p_relationship:x.relationship,p_trip_responses:x.tripResponses??null};break;
   case 'submit_claim':name='rmg_submit_claim';params={...args(x),p_name:x.claimantName,p_business:x.businessName,p_evidence:x.evidence};break;
   case 'own_status':name='rmg_own_status';params={p_kind:x.kind,p_id:x.id};break;
   case 'my_submissions':name='rmg_my_submissions';params={p_offset:x.offset,p_limit:x.limit};break;
   case 'edit_details':name='rmg_edit_details';params={...args(x),p_boat:x.boat,p_gear:x.gear,p_years:x.yearsExperience,p_expertise:x.expertise,p_species:x.species};break;
   default:return fail(400,'invalid_input');
  }
  const r=await client.rpc(name,params);return r.error?dbError(r.error):x.operation==='my_submissions'?json({items:r.data,offset:x.offset,limit:x.limit}):json(r.data);
 }catch{return fail(503,'service_unavailable')}
}
