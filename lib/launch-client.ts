import {type ClaimDraft, type ReviewDraft, validateReviewDraft} from '@/components/launch/submission-model';

/** Provisional adapter for 06's draft contract. It stays disabled until integration is verified. */
export type GuideSource = Readonly<{jurisdiction:'OR'|'WA';sourceId:string}>;
export type PendingReceipt = Readonly<{id:string;status:'pending';existing?:boolean}>;
export type OwnStatus = Readonly<{id:string;status:'pending'|'published'|'rejected'|'removed'|'approved'|'denied'}>;
export type PublicReview = Readonly<{id:string;quality:number;body:string;publishedAt:string}>;
export type PublicReviews = Readonly<{count:number;averageQuality:number|null;reviews:readonly PublicReview[]}>;

export class LaunchClientError extends Error {
  constructor(public readonly code:string) {super(code);this.name='LaunchClientError';}
}
type Fetcher = (input:RequestInfo | URL, init?:RequestInit)=>Promise<Response>;
type Options = Readonly<{enabled?:boolean;getAccessToken:()=>Promise<string|null>;fetcher?:Fetcher}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVIEW_STATES=['pending','published','rejected','removed'];
const CLAIM_STATES=['pending','approved','denied'];
const ERRORS=new Set(['invalid_input','sign_in_required','forbidden','not_found','conflict','json_required','rate_limited','limit_or_conflict','service_unavailable']);
function record(value:unknown):Record<string,unknown> | null {return value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : null;}
function validSource(source:GuideSource):boolean {
  return (source.jurisdiction==='OR'||source.jurisdiction==='WA') && typeof source.sourceId==='string' && source.sourceId.length>0 && source.sourceId.length<=100 && !/[\x00-\x1f\x7f]/.test(source.sourceId);
}

export function createLaunchClient(options:Options) {
  const fetcher=options.fetcher ?? fetch;
  async function call(operation:string, args:Record<string,unknown>, authenticated:boolean):Promise<unknown> {
    if (!options.enabled) throw new LaunchClientError('service_unavailable');
    const headers:Record<string,string>={'Content-Type':'application/json'};
    if(authenticated) {
      const token=await options.getAccessToken();
      if(!token || /\s/.test(token)) throw new LaunchClientError('sign_in_required');
      headers.Authorization=`Bearer ${token}`;
    }
    let response:Response;
    try {response=await fetcher('/api/launch',{method:'POST',headers,body:JSON.stringify({operation,...args}),cache:'no-store',credentials:'same-origin',redirect:'error'});}
    catch {throw new LaunchClientError('service_unavailable');}
    let data:unknown;
    try {data=await response.json();} catch {throw new LaunchClientError('service_unavailable');}
    if(!response.ok) {
      const code=record(data)?.error;
      throw new LaunchClientError(typeof code==='string'&&ERRORS.has(code)?code:'service_unavailable');
    }
    return data;
  }
  function sourceArgs(source:GuideSource) {
    if(!validSource(source)) throw new LaunchClientError('invalid_input');
    return {jurisdiction:source.jurisdiction,sourceId:source.sourceId};
  }
  function receipt(value:unknown):PendingReceipt {
    const data=record(value);
    if(!data || typeof data.id!=='string' || !UUID.test(data.id) || data.status!=='pending' || (data.existing!==undefined&&typeof data.existing!=='boolean')) throw new LaunchClientError('service_unavailable');
    return {id:data.id,status:'pending',...(typeof data.existing==='boolean'?{existing:data.existing}:{})};
  }
  return {
    async session() {
      const data=record(await call('session',{},true));
      if(!data || data.authenticated!==true || typeof data.operator!=='boolean') throw new LaunchClientError('service_unavailable');
      return {authenticated:true as const,operator:data.operator};
    },
    async submitReview(source:GuideSource,draft:ReviewDraft):Promise<PendingReceipt> {
      if(validateReviewDraft(draft) || draft.wouldBookAgain===null || draft.relationship===null) throw new LaunchClientError('invalid_input');
      // The draft backend has no trip-month input. Never silently discard it.
      if(draft.tripMonth!==null) throw new LaunchClientError('optional_detail_unsupported');
      const body=draft.body.trim();
      if(body.length<80||body.length>3000) throw new LaunchClientError('invalid_input');
      return receipt(await call('submit_review',{...sourceArgs(source),quality:draft.quality,intensity:draft.intensity,wouldBookAgain:draft.wouldBookAgain,body,firsthandAttested:draft.firsthand,relationship:draft.relationship},true));
    },
    async submitClaim(source:GuideSource,draft:ClaimDraft):Promise<PendingReceipt> {
      const claimantName=draft.claimantName.trim(),businessName=draft.businessName.trim(),evidence=draft.evidence.trim();
      if(Array.from(claimantName).length<2 || claimantName.length>120 || businessName.length>160 || Array.from(evidence).length<20 || evidence.length>2000) throw new LaunchClientError('invalid_input');
      return receipt(await call('submit_claim',{...sourceArgs(source),claimantName,businessName,evidence},true));
    },
    async ownStatus(kind:'review'|'claim',id:string):Promise<OwnStatus> {
      if((kind!=='review'&&kind!=='claim')||!UUID.test(id)) throw new LaunchClientError('invalid_input');
      const data=record(await call('own_status',{kind,id},true));
      const states=kind==='review'?REVIEW_STATES:CLAIM_STATES;
      if(!data || data.id!==id || typeof data.status!=='string' || !states.includes(data.status)) throw new LaunchClientError('service_unavailable');
      return {id,status:data.status as OwnStatus['status']};
    },
    async publicReviews(source:GuideSource):Promise<PublicReviews> {
      const data=record(await call('public_reviews',sourceArgs(source),false));
      const summary=record(data?.summary);
      if(!summary || !Number.isSafeInteger(summary.count) || (summary.count as number)<0 || !Array.isArray(data?.reviews)) throw new LaunchClientError('service_unavailable');
      const count=summary.count as number,average=summary.averageQuality;
      if(count===0 ? average!==null : typeof average!=='number'||!Number.isFinite(average)||average<1||average>5) throw new LaunchClientError('service_unavailable');
      if(data.reviews.length>count) throw new LaunchClientError('service_unavailable');
      const seen=new Set<string>();
      const reviews=data.reviews.map((value:unknown)=>{
        const r=record(value);
        if(!r || typeof r.id!=='string' || !UUID.test(r.id) || seen.has(r.id) || (r.status!==undefined&&r.status!=='published') || !Number.isInteger(r.quality) || (r.quality as number)<1 || (r.quality as number)>5 || typeof r.body!=='string' || !r.body.trim() || typeof r.published_at!=='string' || !r.published_at || !Number.isFinite(Date.parse(r.published_at))) throw new LaunchClientError('service_unavailable');
        seen.add(r.id);
        return {id:r.id,quality:r.quality as number,body:r.body,publishedAt:r.published_at};
      });
      return {count,averageQuality:average as number|null,reviews};
    },
  };
}
