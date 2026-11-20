const sourceIdPattern=/^wa-[0-9]{3,9}$/;
const versionPattern=/^[0-9a-f]{64}$/;

/** Select an internal review key. The caller supplies a trusted, bundled version lookup. */
export function washingtonReviewSource(sourceId,env,versionFor){
 if(typeof sourceId!=='string'||sourceId!==sourceId.trim()||!sourceIdPattern.test(sourceId))return undefined;
 const listed=env.RMG_WA_LISTED_REVIEW_PILOT_SOURCE_ID;
 const prospective=env.RMG_WA_REVIEW_PILOT_SOURCE_ID;
 let kind;
 if(sourceId===listed){
  if(prospective)return undefined;
  kind='listed';
 }else if(sourceId===prospective){
  return listed?undefined:{kind:'prospective',sourceId};
 }else if(env.RMG_WA_CATALOG_REVIEWS_ENABLED==='true'){
  kind='catalog';
 }else return undefined;
 const version=versionFor?.(sourceId,kind);
 if(typeof version!=='string'||version.length!==64||!versionPattern.test(version))return undefined;
 return {kind,sourceId:sourceId+'@'+(kind==='catalog'?'catalog:':'')+version};
}
