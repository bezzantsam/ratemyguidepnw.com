import {createHash} from 'node:crypto';
import type {WashingtonReviewVersion} from './backend-launch/wa-review-source.mjs';
import {washingtonGuide,washingtonGuides,washingtonSourceKey} from './washington';

/** Matches the offline intake's canonical JSON for the full Washington source row. */
export function washingtonListedReviewVersion(sourceId:string):string|undefined {
 const listing=washingtonGuide(sourceId);
 if(!listing||listing.id!==sourceId)return undefined;
 const {id,...record}=listing;
 const sortedRecord=Object.fromEntries(Object.entries(record).sort(([a],[b])=>a<b?-1:a>b?1:0));
 const payload=JSON.stringify({record:sortedRecord,source_id:id,source_key:washingtonSourceKey(record)});
 return createHash('sha256').update(payload).digest('hex');
}

/** Catalog reviews are limited to current, separately published directory listings. */
export const washingtonReviewVersion: WashingtonReviewVersion = (sourceId,kind) => {
 if(kind==='catalog'&&!washingtonGuides.some(guide=>guide.id===sourceId))return undefined;
 return washingtonListedReviewVersion(sourceId);
};
