import {type ClaimDraft, type ReviewDraft, validateReviewDraft} from '@/components/launch/submission-model';
import {decodeTripResponses,describeTripResponses,encodeTripResponses} from '@/components/launch/trip-responses';

/** Provisional adapter for 06's draft contract. It stays disabled until integration is verified. */
export type GuideSource = Readonly<{jurisdiction:'OR'|'WA';sourceId:string}>;
export type PendingReceipt = Readonly<{id:string;status:'pending';existing?:boolean}>;
export type OwnStatus = Readonly<{id:string;status:'pending'|'published'|'rejected'|'removed'|'approved'|'denied'}>;
export type PublicReview = Readonly<{id:string;quality:number;body:string;publishedAt:string;tripMonth:string|null;tripDetails:readonly string[]|null}>;
export type PublicReviews = Readonly<{count:number;averageQuality:number|null;reviews:readonly PublicReview[]}>;
export type ClaimStatus='none'|'pending'|'approved'|'denied'|'unavailable';
export type OwnedKind='review'|'claim'|'revision';
export type SubmissionKind=OwnedKind|'report';
export type ReportReason='not_firsthand'|'harassment_or_private_info'|'other';
export type OwnSubmission=Readonly<{id:string;kind:OwnedKind;status:string;createdAt:string;jurisdiction:'OR'|'WA'|null;sourceId:string|null;reviewId:string|null;identities:readonly GuideSource[]}>;
export type OwnerDetails=Readonly<{boat:string;gear:string;yearsExperience:number|null;expertise:string;species:string}>;
export type OperatorItem=Readonly<{id:string;kind:SubmissionKind;guideName:string|null;reviewId:string|null;description:string;createdAt:string;canApprove:boolean}>;

export class LaunchClientError extends Error {
  constructor(public readonly code:string) {super(code);this.name='LaunchClientError';}
}
type Fetcher = (input:RequestInfo | URL, init?:RequestInit)=>Promise<Response>;
type Options = Readonly<{enabled?:boolean;getAccessToken:()=>Promise<string|null>;fetcher?:Fetcher}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVIEW_STATES=['pending','published','rejected','removed'];
const CLAIM_STATES=['pending','approved','denied'];
const REVISION_STATES=['pending','approved','rejected'];
const ERRORS=new Set(['invalid_input','sign_in_required','forbidden','not_found','conflict','duplicate_review','launch_unavailable','json_required','rate_limited','limit_or_conflict','service_unavailable']);
function record(value:unknown):Record<string,unknown> | null {return value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : null;}
function validSource(source:GuideSource):boolean {
  return (source.jurisdiction==='OR'||source.jurisdiction==='WA') && typeof source.sourceId==='string' && source.sourceId.length>0 && source.sourceId.length<=100 && !/[\x00-\x1f\x7f]/.test(source.sourceId);
}
function readTripMonth(value:unknown):string|null {
  if(value===null||value===undefined)return null;
  if(typeof value!=='string'||!/^(?!0000)\d{4}-(0[1-9]|1[0-2])-01$/.test(value))throw new LaunchClientError('service_unavailable');
  return value.slice(0,7);
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
      throw new LaunchClientError(typeof code==='string'&&ERRORS.has(code)&&(code!=='duplicate_review'||response.status===409)?code:'service_unavailable');
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
  function publicRecord(value:unknown,expectedId?:string):PublicReview {
    const r=record(value);
    if(!r||typeof r.id!=='string'||!UUID.test(r.id)||(expectedId!==undefined&&r.id!==expectedId)||(r.status!==undefined&&r.status!=='published')||!Number.isInteger(r.quality)||(r.quality as number)<1||(r.quality as number)>5||typeof r.body!=='string'||!r.body.trim()||typeof r.published_at!=='string'||!r.published_at||!Number.isFinite(Date.parse(r.published_at)))throw new LaunchClientError('service_unavailable');
    return {id:r.id,quality:r.quality as number,body:r.body,publishedAt:r.published_at,tripMonth:readTripMonth(r.trip_month),tripDetails:describeTripResponses(r.trip_responses)};
  }
  return {
    async session() {
      const data=record(await call('session',{},true));
      if(!data || data.authenticated!==true || typeof data.operator!=='boolean') throw new LaunchClientError('service_unavailable');
      return {authenticated:true as const,operator:data.operator,...(data.operator&&data.reviewQueueReady===true?{reviewQueueReady:true as const}:{})};
    },
    async reviewWriteAvailability(source:GuideSource):Promise<boolean> {
      const data=record(await call('review_write_availability',sourceArgs(source),false));
      if(!data||typeof data.available!=='boolean')throw new LaunchClientError('service_unavailable');
      return data.available;
    },
    async ownReviewForGuide(source:GuideSource):Promise<OwnStatus|null> {
      const data=record(await call('own_review_for_guide',sourceArgs(source),true));
      if(!data||!Object.hasOwn(data,'review'))throw new LaunchClientError('service_unavailable');
      if(data.review===null)return null;
      const row=record(data.review);
      if(!row||typeof row.id!=='string'||!UUID.test(row.id)||typeof row.status!=='string'||!REVIEW_STATES.includes(row.status))throw new LaunchClientError('service_unavailable');
      return {id:row.id,status:row.status as OwnStatus['status']};
    },
    async submitReview(source:GuideSource,draft:ReviewDraft):Promise<PendingReceipt> {
      if(validateReviewDraft(draft) || draft.relationship===null) throw new LaunchClientError('invalid_input');
      const body=draft.body.trim();
      if(body.length<1||body.length>3000) throw new LaunchClientError('invalid_input');
      return receipt(await call('submit_review',{...sourceArgs(source),quality:draft.quality,intensity:draft.intensity,wouldBookAgain:draft.wouldBookAgain,body,firsthandAttested:draft.firsthand,relationship:draft.relationship,tripMonth:draft.tripMonth,...(draft.tripResponses?{tripResponses:draft.tripResponses}:{})},true));
    },
    async claimAvailability(source:GuideSource):Promise<boolean> {
      const data=record(await call('claim_availability',sourceArgs(source),false));
      if(!data||typeof data.available!=='boolean')throw new LaunchClientError('service_unavailable');
      return data.available;
    },
    async claimStatus(source:GuideSource):Promise<ClaimStatus> {
      const data=record(await call('claim_status',sourceArgs(source),true));
      const status=data?.status;
      if(status==='none'||status==='pending'||status==='approved'||status==='denied'||status==='unavailable')return status;
      throw new LaunchClientError('service_unavailable');
    },
    async submitClaim(source:GuideSource,draft:ClaimDraft):Promise<PendingReceipt> {
      const claimantName=draft.claimantName.trim(),businessName=draft.businessName.trim(),evidence=draft.evidence.trim();
      if(Array.from(claimantName).length<2 || claimantName.length>120 || businessName.length>160 || Array.from(evidence).length<20 || evidence.length>1200) throw new LaunchClientError('invalid_input');
      return receipt(await call('submit_claim',{...sourceArgs(source),claimantName,businessName,evidence},true));
    },
    async reportReview(source:GuideSource,reviewId:string,reason:ReportReason):Promise<{id:string;status:'submitted';existing:boolean}> {
      if(!UUID.test(reviewId)||!['not_firsthand','harassment_or_private_info','other'].includes(reason))throw new LaunchClientError('invalid_input');
      const data=record(await call('report_review',{...sourceArgs(source),reviewId,reason},true));
      if(!data||typeof data.id!=='string'||!UUID.test(data.id)||data.status!=='submitted'||typeof data.existing!=='boolean')throw new LaunchClientError('service_unavailable');
      return {id:data.id,status:'submitted',existing:data.existing};
    },
    async resolveReport(id:string):Promise<{id:string;status:'resolved'}> {
      if(!UUID.test(id))throw new LaunchClientError('invalid_input');
      const data=record(await call('resolve_report',{id},true));
      if(!data||data.id!==id||data.status!=='resolved')throw new LaunchClientError('service_unavailable');
      return {id,status:'resolved'};
    },
    async ownStatus(kind:OwnedKind,id:string):Promise<OwnStatus> {
      if(!['review','claim','revision'].includes(kind)||!UUID.test(id)) throw new LaunchClientError('invalid_input');
      const data=record(await call('own_status',{kind,id},true));
      const states=kind==='review'?REVIEW_STATES:kind==='claim'?CLAIM_STATES:REVISION_STATES;
      if(!data || data.id!==id || typeof data.status!=='string' || !states.includes(data.status)) throw new LaunchClientError('service_unavailable');
      return {id,status:data.status as OwnStatus['status']};
    },
    async mySubmissions(offset=0,limit=50):Promise<OwnSubmission[]> {
      if(!Number.isInteger(offset)||offset<0||offset>100000||!Number.isInteger(limit)||limit<1||limit>100) throw new LaunchClientError('invalid_input');
      const data=record(await call('my_submissions',{offset,limit},true));
      if(!data||data.offset!==offset||data.limit!==limit||!Array.isArray(data.items)||data.items.length>limit) throw new LaunchClientError('service_unavailable');
      const seen=new Set<string>();
      return data.items.map((value:unknown)=>{
        const item=record(value);if(!item||typeof item.id!=='string'||!UUID.test(item.id)||seen.has(item.id)||!['review','claim','revision'].includes(item.kind as string)||typeof item.created_at!=='string'||!Number.isFinite(Date.parse(item.created_at)))throw new LaunchClientError('service_unavailable');
        const kind=item.kind as OwnedKind, states=kind==='review'?REVIEW_STATES:kind==='claim'?CLAIM_STATES:REVISION_STATES;
        if(typeof item.status!=='string'||!states.includes(item.status)||(item.jurisdiction!==null&&item.jurisdiction!=='OR'&&item.jurisdiction!=='WA')||(item.source_id!==null&&(typeof item.source_id!=='string'||!item.source_id))||(item.jurisdiction===null)!==(item.source_id===null)||(kind==='revision'?(typeof item.review_id!=='string'||!UUID.test(item.review_id)):item.review_id!==null))throw new LaunchClientError('service_unavailable');
        if(item.jurisdiction!==null&&!validSource({jurisdiction:item.jurisdiction as 'OR'|'WA',sourceId:item.source_id as string}))throw new LaunchClientError('service_unavailable');
        const identities:GuideSource[]=[];
        if(item.identities===undefined){if(item.jurisdiction!==null)identities.push({jurisdiction:item.jurisdiction as 'OR'|'WA',sourceId:item.source_id as string})}
        else {
          if(!Array.isArray(item.identities)||item.identities.length>2)throw new LaunchClientError('service_unavailable');
          const mapped=new Set<string>();
          for(const value of item.identities){const entry=record(value);if(!entry||typeof entry.source_id!=='string'||(entry.jurisdiction!=='OR'&&entry.jurisdiction!=='WA'))throw new LaunchClientError('service_unavailable');const identity={jurisdiction:entry.jurisdiction,sourceId:entry.source_id} as GuideSource;if(!validSource(identity)||mapped.has(identity.jurisdiction))throw new LaunchClientError('service_unavailable');mapped.add(identity.jurisdiction);identities.push(identity)}
          if((item.jurisdiction===null)!==(identities.length===0)||(item.jurisdiction!==null&&!identities.some(identity=>identity.jurisdiction===item.jurisdiction&&identity.sourceId===item.source_id)))throw new LaunchClientError('service_unavailable');
        }
        seen.add(item.id);return {id:item.id,kind,status:item.status,createdAt:item.created_at,jurisdiction:item.jurisdiction as 'OR'|'WA'|null,sourceId:item.source_id as string|null,reviewId:item.review_id as string|null,identities};
      });
    },
    async submitRevision(reviewId:string,draft:ReviewDraft):Promise<PendingReceipt> {
      if(!UUID.test(reviewId)||validateReviewDraft(draft)||draft.relationship===null)throw new LaunchClientError('invalid_input');
      return receipt(await call('submit_revision',{reviewId,quality:draft.quality,intensity:draft.intensity,wouldBookAgain:draft.wouldBookAgain,body:draft.body.trim(),firsthandAttested:draft.firsthand,relationship:draft.relationship,tripMonth:draft.tripMonth,...(draft.tripResponses?{tripResponses:draft.tripResponses}:{})},true));
    },
    async reviewDetail(source:GuideSource,id:string):Promise<ReviewDraft> {
      if(!UUID.test(id))throw new LaunchClientError('invalid_input');
      const data=record(await call('review_detail',{...sourceArgs(source),id},false));
      const r=record(data?.review);
      if(!r||r.id!==id||!Number.isInteger(r.quality)||(r.quality as number)<1||(r.quality as number)>5||(r.intensity!==null&&(!Number.isInteger(r.intensity)||(r.intensity as number)<1||(r.intensity as number)>5))||(r.would_book_again!==null&&typeof r.would_book_again!=='boolean')||typeof r.body!=='string'||!['none','personal','financial','other'].includes(r.relationship_disclosure as string)||typeof r.published_at!=='string'||!Number.isFinite(Date.parse(r.published_at)))throw new LaunchClientError('service_unavailable');
      const tripDraft=decodeTripResponses(r.trip_responses);if(!tripDraft)throw new LaunchClientError('service_unavailable');
      const encoded=encodeTripResponses(tripDraft);if(encoded.error)throw new LaunchClientError('service_unavailable');
      if(!Object.hasOwn(r,'trip_month'))throw new LaunchClientError('service_unavailable');
      return {quality:r.quality as number,intensity:r.intensity as number|null,wouldBookAgain:r.would_book_again as boolean|null,body:r.body,firsthand:false,relationship:r.relationship_disclosure as ReviewDraft['relationship'],tripMonth:readTripMonth(r.trip_month),tripResponses:encoded.value};
    },
    async publicReview(source:GuideSource,id:string):Promise<PublicReview> {
      if(!UUID.test(id))throw new LaunchClientError('invalid_input');
      const data=record(await call('review_detail',{...sourceArgs(source),id},false));
      return publicRecord(data?.review,id);
    },
    async profileDetails(source:GuideSource):Promise<OwnerDetails|null> {
      const data=record(await call('profile_details',sourceArgs(source),false));
      if(!data||data.attribution!=='captain_declared')throw new LaunchClientError('service_unavailable');
      if(data.details===null)return null;
      const d=record(data.details);if(!d||![d.boat,d.gear,d.expertise,d.targeted_species].every(x=>x===null||typeof x==='string')||(d.years_experience!==null&&(!Number.isInteger(d.years_experience)||(d.years_experience as number)<0||(d.years_experience as number)>80)))throw new LaunchClientError('service_unavailable');
      return {boat:(d.boat as string|null)??'',gear:(d.gear as string|null)??'',yearsExperience:d.years_experience as number|null,expertise:(d.expertise as string|null)??'',species:(d.targeted_species as string|null)??''};
    },
    async editDetails(source:GuideSource,details:OwnerDetails):Promise<void> {
      if(typeof details.boat!=='string'||details.boat.length>250||typeof details.gear!=='string'||details.gear.length>500||typeof details.expertise!=='string'||details.expertise.length>500||typeof details.species!=='string'||details.species.length>350||(details.yearsExperience!==null&&(!Number.isInteger(details.yearsExperience)||details.yearsExperience<0||details.yearsExperience>80)))throw new LaunchClientError('invalid_input');
      const result=record(await call('edit_details',{...sourceArgs(source),...details},true));
      if(result?.status!=='saved')throw new LaunchClientError('service_unavailable');
    },
    async operatorQueue(kind:SubmissionKind,offset=0,limit=50):Promise<OperatorItem[]> {
      if(!['review','claim','revision','report'].includes(kind)||!Number.isInteger(offset)||offset<0||offset>100000||!Number.isInteger(limit)||limit<1||limit>100)throw new LaunchClientError('invalid_input');
      const data=record(await call('operator_queue',{kind,offset,limit},true));
      if(!data||data.offset!==offset||data.limit!==limit||!Array.isArray(data.items)||data.items.length>limit)throw new LaunchClientError('service_unavailable');
      const seen=new Set<string>();
      return data.items.map((value:unknown)=>{
        const row=record(value);
        if(!row||typeof row.id!=='string'||!UUID.test(row.id)||seen.has(row.id)||typeof row.created_at!=='string'||!Number.isFinite(Date.parse(row.created_at)))throw new LaunchClientError('service_unavailable');
        seen.add(row.id);
        const guideName=typeof row.guide_name==='string'&&row.guide_name.trim()?row.guide_name:null;
        const reviewId=(kind==='revision'||kind==='report')&&typeof row.review_id==='string'&&UUID.test(row.review_id)?row.review_id:null;
        if((kind==='revision'||kind==='report')&&!reviewId)throw new LaunchClientError('service_unavailable');
        if(kind==='report') {
          if(typeof row.reason!=='string'||!row.reason.trim()||typeof row.review_status!=='string'||!REVIEW_STATES.includes(row.review_status)||(row.public_review_body!==null&&typeof row.public_review_body!=='string')||(row.review_status!=='published'&&row.public_review_body!==null))throw new LaunchClientError('service_unavailable');
          const reasons:Record<string,string>={not_firsthand:'Not about a firsthand trip',harassment_or_private_info:'Harassment or private information',other:'Other'};
          return {id:row.id,kind,guideName,reviewId,createdAt:row.created_at,description:`Reason: ${reasons[row.reason]??'Earlier report category'}\nReview status: ${row.review_status}\n${row.public_review_body??'Review text is not public.'}`,canApprove:false};
        }
        if(kind==='claim') {
          const source=typeof row.source_id==='string'?row.source_id:'',name=typeof row.claimant_name==='string'?row.claimant_name:'',business=typeof row.business_name==='string'?row.business_name:'',evidence=typeof row.public_evidence==='string'?row.public_evidence:'';
          return {id:row.id,kind,guideName,reviewId,createdAt:row.created_at,description:`Oregon listing: ${source||'Unavailable'}\nClaimant: ${name||'Unavailable'}\nBusiness: ${business||'Not supplied'}\nEvidence: ${evidence||'Unavailable'}`,canApprove:!!guideName&&!!source&&!!name.trim()&&evidence.trim().length>=20};
        }
        if(typeof row.body!=='string'||!row.body.trim()||!Number.isInteger(row.quality)||(row.quality as number)<1||(row.quality as number)>5)throw new LaunchClientError('service_unavailable');
        const trip=Object.hasOwn(row,'trip_responses')?describeTripResponses(row.trip_responses):null, relationship=typeof row.relationship_disclosure==='string'?row.relationship_disclosure:'Unavailable';
        const hasIntensity=Object.hasOwn(row,'intensity')&&(row.intensity===null||(Number.isInteger(row.intensity)&&(row.intensity as number)>=1&&(row.intensity as number)<=5));
        const hasRebook=Object.hasOwn(row,'would_book_again')&&(row.would_book_again===null||typeof row.would_book_again==='boolean');
        const hasMonth=Object.hasOwn(row,'trip_month')&&(kind==='review'||typeof row.trip_month_specified==='boolean');
        const month=hasMonth?(kind==='revision'&&row.trip_month_specified===false?'Unchanged':readTripMonth(row.trip_month)??(kind==='revision'?'Cleared':'Not supplied')):'Unavailable';
        const intensity=hasIntensity?(row.intensity===null?'Not answered':`${row.intensity} / 5`):'Unavailable';
        const rebook=hasRebook?(row.would_book_again===null?'Not answered':row.would_book_again?'Yes':'No'):'Unavailable';
        return {id:row.id,kind,guideName,reviewId,createdAt:row.created_at,description:`Rating: ${row.quality} / 5\nRelationship: ${relationship}\nTrip month: ${month}\nTrip intensity: ${intensity}\nWould book again: ${rebook}\n${row.body}\n${trip===null?'Trip details unavailable':trip.join('\n')}`,canApprove:!!guideName&&hasMonth&&hasIntensity&&hasRebook&&trip!==null&&['none','personal','financial','other'].includes(relationship)&&(kind==='revision'||row.firsthand_attested===true)};
      });
    },
    async operatorDecide(kind:OwnedKind,id:string,approve:boolean,reason:string):Promise<{id:string;status:string}> {
      if(!['review','claim','revision'].includes(kind)||!UUID.test(id)||typeof approve!=='boolean'||typeof reason!=='string'||reason.length>500||(approve&&reason.trim().length<20))throw new LaunchClientError('invalid_input');
      const data=record(await call('operator_decide',{kind,id,approve,reason:reason.trim()},true));
      const status=kind==='review'?(approve?'published':'rejected'):kind==='claim'?(approve?'approved':'denied'):(approve?'approved':'rejected');
      if(!data||data.id!==id||data.status!==status)throw new LaunchClientError('service_unavailable');
      return {id,status};
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
        const r=publicRecord(value);if(seen.has(r.id))throw new LaunchClientError('service_unavailable');seen.add(r.id);return r;
      });
      return {count,averageQuality:average as number|null,reviews};
    },
  };
}
