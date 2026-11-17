const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(x,min,max)=>typeof x==='string' && x.trim().length>=min && x.trim().length<=max;
const identity=x=>['OR','WA'].includes(x.jurisdiction)&&text(x.sourceId,1,100);
const keys=(x,allowed)=>Object.keys(x).every(k=>allowed.includes(k));
const idkeys=['operation','jurisdiction','sourceId'];
export function validate(x){
 if(!x||typeof x!=='object'||Array.isArray(x)||typeof x.operation!=='string')return false;
 switch(x.operation){
 case 'session': return keys(x,['operation']);
 case 'public_reviews': return keys(x,idkeys)&&identity(x);
 case 'submit_review': return keys(x,[...idkeys,'quality','intensity','wouldBookAgain','body','firsthandAttested','relationship'])&&identity(x)&&Number.isInteger(x.quality)&&x.quality>=1&&x.quality<=5&&Number.isInteger(x.intensity)&&x.intensity>=1&&x.intensity<=5&&typeof x.wouldBookAgain==='boolean'&&text(x.body,80,3000)&&x.firsthandAttested===true&&['none','personal','financial','other'].includes(x.relationship);
 case 'submit_claim': return keys(x,[...idkeys,'claimantName','businessName','evidence'])&&identity(x)&&text(x.claimantName,2,120)&&typeof x.businessName==='string'&&x.businessName.length<=160&&text(x.evidence,20,2000);
 case 'own_status': return keys(x,['operation','kind','id'])&&['review','claim'].includes(x.kind)&&typeof x.id==='string'&&uuid.test(x.id);
 case 'edit_details': return keys(x,[...idkeys,'boat','gear','yearsExperience','expertise','species'])&&identity(x)&&typeof x.boat==='string'&&x.boat.length<=500&&typeof x.gear==='string'&&x.gear.length<=500&&(x.yearsExperience===null||(Number.isInteger(x.yearsExperience)&&x.yearsExperience>=0&&x.yearsExperience<=100))&&typeof x.expertise==='string'&&x.expertise.length<=1000&&typeof x.species==='string'&&x.species.length<=500;
 case 'operator_queue': return keys(x,['operation','kind','offset','limit'])&&['review','claim'].includes(x.kind)&&Number.isInteger(x.offset)&&x.offset>=0&&x.offset<=100000&&Number.isInteger(x.limit)&&x.limit>=1&&x.limit<=100;
 case 'operator_decide': return keys(x,['operation','kind','id','approve','reason'])&&['review','claim'].includes(x.kind)&&typeof x.id==='string'&&uuid.test(x.id)&&typeof x.approve==='boolean'&&typeof x.reason==='string'&&x.reason.length<=500&&(!x.approve||text(x.reason,20,500));
 default:return false;
 }
}
