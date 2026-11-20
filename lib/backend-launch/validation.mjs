const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(x,min,max)=>typeof x==='string' && x.trim().length>=min && x.trim().length<=max;
const identity=x=>['OR','WA'].includes(x.jurisdiction)&&text(x.sourceId,1,100);
const keys=(x,allowed)=>Object.keys(x).every(k=>allowed.includes(k));
const directorySourceId={
 OR:/^OG\.[0-9]{7}(\.[A-Z0-9&]+)?$/,
 WA:/^wa-[0-9]{3,9}$/,
};
const preferredName=x=>x===null||(typeof x==='string'&&Array.from(x.trim()).length<=80&&!/[<>\u0000-\u001f\u007f]/u.test(x.trim()));
const idkeys=['operation','jurisdiction','sourceId'];
const optionalIntensity=x=>x===undefined||x===null||(Number.isInteger(x)&&x>=1&&x<=5);
const optionalRebook=x=>x===undefined||x===null||typeof x==='boolean';
const optionalTripMonth=x=>x===undefined||x===null||(typeof x==='string'&&/^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/.test(x));
const booleans=new Set(['teaching_requested','children_present','dog_present','dog_previously_disclosed']);
const ratings=new Set(['teaching_experience','guide_patience','effort','attentiveness','organization','cleanliness','response_slow_catch','respect_for_boundaries']);
const durations=new Set(['agreed_duration_minutes','actual_duration_minutes']);
const choices={target_species:['chinook','coho','steelhead','other','unknown'],setting:['river','ocean','estuary','other','unknown'],duration_change_reason:['weather','safety','customer_request','guide_decision','other','unknown'],conversation_preference:['talkative','quiet','no_preference']};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function safeReturnTo(value){
 if(typeof value!=='string'||value.length>1000||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value)||/%2f|%5c/i.test(value))return null;
 try{
  const base='https://return.invalid',u=new URL(value,base);if(u.origin!==base||u.username||u.password)return null;
  const path=decodeURIComponent(u.pathname);
  const profile=/^\/guides\/[a-z0-9-]+$/.test(path)||/^\/washington\/wa-[0-9]+$/.test(path);
  if(!profile&&!(/^\/claim\/(?:OG\.[A-Za-z0-9.&]+|wa-[0-9]+)$/.test(path)||path==='/admin'))return null;
  if(!profile&&(u.search||u.hash))return null;
  if(u.search==='?intent=claim'||u.hash==='#claim-profile') {
   return /^\/guides\/og-[0-9]{7}(?:-[a-z0-9-]+)?$/.test(path)&&
    (!u.search||u.search==='?intent=claim')&&(!u.hash||u.hash==='#claim-profile')?u.pathname+u.search+u.hash:null;
  }
  const query=u.search.match(/^\?review=([0-9a-f-]+)$/i),fragment=u.hash.match(/^#review-([0-9a-f-]+)$/i);
  if(query&&!uuid.test(query[1]))return null;
  if(fragment&&!uuid.test(fragment[1]))return null;
  if(u.search&&u.search!=='?intent=review'&&!query)return null;
  if(u.hash&&u.hash!=='#write-review'&&!fragment)return null;
  if((query&&u.hash==='#write-review')||(fragment&&u.search==='?intent=review'))return null;
  if(query&&fragment&&query[1].toLowerCase()!==fragment[1].toLowerCase())return null;
  return u.pathname+u.search+u.hash;
 }catch{return null}
}
export function validateTripResponses(x){
 if(x===undefined||x===null)return true;
 if(!object(x)||!keys(x,['version','answers'])||x.version!==1||!object(x.answers))return false;
 return Object.entries(x.answers).every(([name,answer])=>{
  if(!booleans.has(name)&&!ratings.has(name)&&!durations.has(name)&&!Object.hasOwn(choices,name))return false;
  if(!object(answer)||!keys(answer,['state','value']))return false;
  if(answer.state==='not_applicable')return !Object.hasOwn(answer,'value');
  if(answer.state!=='answered'||!Object.hasOwn(answer,'value'))return false;
  if(booleans.has(name))return typeof answer.value==='boolean';
  if(ratings.has(name))return Number.isInteger(answer.value)&&answer.value>=1&&answer.value<=5;
  if(durations.has(name))return Number.isInteger(answer.value)&&answer.value>=0&&answer.value<=1440;
  return choices[name].includes(answer.value);
 });
}
export function validate(x){
 if(!x||typeof x!=='object'||Array.isArray(x)||typeof x.operation!=='string')return false;
 switch(x.operation){
 case 'safe_return': return keys(x,['operation','returnTo'])&&safeReturnTo(x.returnTo)!==null;
 case 'session': return keys(x,['operation']);
 case 'public_review_summaries':
  return keys(x,['operation','guides'])&&Array.isArray(x.guides)&&x.guides.length<=30&&x.guides.every(guide=>
   object(guide)&&keys(guide,['jurisdiction','sourceId'])&&typeof guide.jurisdiction==='string'&&Object.hasOwn(directorySourceId,guide.jurisdiction)&&
   typeof guide.sourceId==='string'&&guide.sourceId.length<=100&&guide.sourceId===guide.sourceId.trim()&&
   directorySourceId[guide.jurisdiction].test(guide.sourceId));
 case 'profile_names_v1': return keys(x,['operation','jurisdiction','sourceIds'])&&['OR','WA'].includes(x.jurisdiction)&&Array.isArray(x.sourceIds)&&x.sourceIds.length<=100&&x.sourceIds.every(id=>text(id,1,100)&&!/[\u0000-\u001f\u007f]/.test(id));
 case 'own_profile_name_v1': return keys(x,idkeys)&&identity(x);
 case 'set_profile_name_v1': return keys(x,[...idkeys,'name'])&&identity(x)&&Object.hasOwn(x,'name')&&preferredName(x.name);
 case 'admin_set_profile_name_v1': return keys(x,[...idkeys,'name','reason'])&&identity(x)&&Object.hasOwn(x,'name')&&preferredName(x.name)&&typeof x.reason==='string'&&Array.from(x.reason.trim()).length>=1&&Array.from(x.reason.trim()).length<=500&&!/[\u0000-\u001f\u007f]/.test(x.reason.trim());
 case 'profile_name_review_v1': return keys(x,idkeys)&&identity(x);
 case 'public_reviews': return keys(x,idkeys)&&identity(x);
 case 'claim_availability':
 case 'claim_status':
 case 'review_write_availability': return keys(x,idkeys)&&identity(x);
 case 'own_review_for_guide': return keys(x,idkeys)&&identity(x);
 case 'profile_details': return keys(x,idkeys)&&identity(x);
 case 'review_detail': return keys(x,[...idkeys,'id'])&&identity(x)&&typeof x.id==='string'&&uuid.test(x.id);
 case 'report_review': return keys(x,[...idkeys,'reviewId','reason'])&&identity(x)&&typeof x.reviewId==='string'&&uuid.test(x.reviewId)&&['not_firsthand','harassment_or_private_info','other'].includes(x.reason);
 case 'resolve_report': return keys(x,['operation','id'])&&typeof x.id==='string'&&uuid.test(x.id);
 case 'submit_review': return keys(x,[...idkeys,'quality','intensity','wouldBookAgain','body','firsthandAttested','relationship','tripResponses','tripMonth'])&&identity(x)&&Number.isInteger(x.quality)&&x.quality>=1&&x.quality<=5&&optionalIntensity(x.intensity)&&optionalRebook(x.wouldBookAgain)&&optionalTripMonth(x.tripMonth)&&text(x.body,1,3000)&&x.firsthandAttested===true&&['none','personal','financial','other'].includes(x.relationship)&&validateTripResponses(x.tripResponses);
 case 'submit_claim': return keys(x,[...idkeys,'claimantName','businessName','evidence'])&&identity(x)&&text(x.claimantName,2,120)&&typeof x.businessName==='string'&&x.businessName.length<=160&&text(x.evidence,20,1200);
 case 'submit_revision': return keys(x,['operation','reviewId','quality','intensity','wouldBookAgain','body','firsthandAttested','relationship','tripResponses','tripMonth'])&&typeof x.reviewId==='string'&&uuid.test(x.reviewId)&&Number.isInteger(x.quality)&&x.quality>=1&&x.quality<=5&&optionalIntensity(x.intensity)&&optionalRebook(x.wouldBookAgain)&&optionalTripMonth(x.tripMonth)&&text(x.body,1,3000)&&x.firsthandAttested===true&&['none','personal','financial','other'].includes(x.relationship)&&validateTripResponses(x.tripResponses);
 case 'own_status': return keys(x,['operation','kind','id'])&&['review','claim','revision'].includes(x.kind)&&typeof x.id==='string'&&uuid.test(x.id);
 case 'my_submissions': return keys(x,['operation','offset','limit'])&&Number.isInteger(x.offset)&&x.offset>=0&&x.offset<=100000&&Number.isInteger(x.limit)&&x.limit>=1&&x.limit<=100;
 case 'edit_details': return keys(x,[...idkeys,'boat','gear','yearsExperience','expertise','species'])&&identity(x)&&typeof x.boat==='string'&&x.boat.length<=250&&typeof x.gear==='string'&&x.gear.length<=500&&(x.yearsExperience===null||(Number.isInteger(x.yearsExperience)&&x.yearsExperience>=0&&x.yearsExperience<=80))&&typeof x.expertise==='string'&&x.expertise.length<=500&&typeof x.species==='string'&&x.species.length<=350;
 case 'operator_queue': return keys(x,['operation','kind','offset','limit'])&&['review','claim','revision','report'].includes(x.kind)&&Number.isInteger(x.offset)&&x.offset>=0&&x.offset<=100000&&Number.isInteger(x.limit)&&x.limit>=1&&x.limit<=100;
 case 'operator_decide': return keys(x,['operation','kind','id','approve','reason'])&&['review','claim','revision'].includes(x.kind)&&typeof x.id==='string'&&uuid.test(x.id)&&typeof x.approve==='boolean'&&typeof x.reason==='string'&&x.reason.length<=500&&(!x.approve||text(x.reason,20,500));
 default:return false;
 }
}
