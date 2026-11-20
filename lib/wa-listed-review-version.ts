import {createHash} from 'node:crypto';
import {washingtonGuide,washingtonSourceKey} from './washington';

/** Matches the offline intake's canonical JSON for the full Washington source row. */
export function washingtonListedReviewVersion(sourceId:string):string|undefined {
 const listing=washingtonGuide(sourceId);
 if(!listing||listing.id!==sourceId)return undefined;
 const {id,...record}=listing;
 const sortedRecord=Object.fromEntries(Object.entries(record).sort(([a],[b])=>a<b?-1:a>b?1:0));
 const payload=JSON.stringify({record:sortedRecord,source_id:id,source_key:washingtonSourceKey(record)});
 return createHash('sha256').update(payload).digest('hex');
}
