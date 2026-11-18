'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import AuthPanel,{client as authClient} from '@/components/AuthPanel';
import {createLaunchClient,type GuideSource,type OwnSubmission,type OwnerDetails} from '@/lib/launch-client';
import {publishedReviewIdFromHash} from '@/lib/canonical-share';
import {ProfileSharing} from './ProfileSharing';
import {PublishedReviews,ReviewCard,type PublishedReview,type ReviewLoadState} from './PublishedReviews';
import {ClaimSubmission,ReviewSubmission} from './SubmissionViews';
import type {ReviewDraft} from './submission-model';

const blankDetails:OwnerDetails={boat:'',gear:'',yearsExperience:null,expertise:'',species:''};
type DetailsState={status:'loading'|'error'}|{status:'ready';value:OwnerDetails|null};
function nextSteps(item:OwnSubmission):string {
  if(item.kind==='claim')return item.status==='pending'?'Your request is awaiting review. Editing is not available yet.':item.status==='approved'?'Your ownership request was approved. You may edit captain-declared details when available.':'Your ownership request was not approved.';
  if(item.kind==='revision')return item.status==='pending'?'Your changes are awaiting review.':item.status==='approved'?'Your updated review was approved.':'Your changes were not published.';
  return item.status==='pending'?'Your review is awaiting review and is not public.':item.status==='published'?'Your review is published.':item.status==='removed'?'Your review is no longer published.':'Your review was not published.';
}

function OwnerEditor({initial,onSave}:{initial:OwnerDetails|null;onSave:(value:OwnerDetails)=>Promise<void>}) {
  const [value,setValue]=useState<OwnerDetails>(initial??blankDetails),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setMessage('');
    try {await onSave(value);setMessage('Your declared details were saved.');} catch {setMessage('We could not confirm your changes. Refresh the profile before trying again.');} finally {setBusy(false)}
  }
  return <form className="card" onSubmit={submit}>
    <h3>Edit captain-declared details</h3><p>These details are supplied by the approved captain and are not independently verified.</p>
    <label>Boat<input value={value.boat} maxLength={250} onChange={e=>setValue({...value,boat:e.target.value})}/></label>
    <label>Gear<input value={value.gear} maxLength={500} onChange={e=>setValue({...value,gear:e.target.value})}/></label>
    <label>Years of experience<input type="number" min="0" max="80" step="1" value={value.yearsExperience??''} onChange={e=>setValue({...value,yearsExperience:e.target.value===''?null:Number(e.target.value)})}/></label>
    <label>Expertise<textarea value={value.expertise} maxLength={500} onChange={e=>setValue({...value,expertise:e.target.value})}/></label>
    <label>Species<input value={value.species} maxLength={350} onChange={e=>setValue({...value,species:e.target.value})}/></label>
    <button type="submit" disabled={busy}>{busy?'Saving…':'Save details'}</button>{message&&<p role="status">{message}</p>}
  </form>;
}

export function GuideEngagement({source,profilePath,guideName}:{source:GuideSource;profilePath:string;guideName:string}) {
  const guideKey=`${source.jurisdiction}:${source.sourceId}`;
  const stableSource=useMemo(()=>({jurisdiction:source.jurisdiction,sourceId:source.sourceId}),[source.jurisdiction,source.sourceId]);
  const api=useMemo(()=>createLaunchClient({enabled:true,getAccessToken:async()=>{const result=await authClient?.auth.getSession();return result?.data.session?.access_token??null}}),[]);
  const [reviews,setReviews]=useState<ReviewLoadState>({status:'loading'}),[details,setDetails]=useState<DetailsState>({status:'loading'});
  const [session,setSession]=useState<'loading'|'signed_out'|'signed_in'|'error'>('loading');
  const [submissions,setSubmissions]=useState<OwnSubmission[]|null>(null),[nextOffset,setNextOffset]=useState(0),[more,setMore]=useState(false),[statusError,setStatusError]=useState(false);
  const [revision,setRevision]=useState<{id:string;initial:ReviewDraft}|null>(null),[revisionError,setRevisionError]=useState('');
  const [selected,setSelected]=useState<{status:'loading'|'error';id:string}|{status:'ready';review:PublishedReview}|null>(null);
  const authEpoch=useRef(0);
  const loadReviews=useCallback(async()=>{try{const result=await api.publicReviews(stableSource);setReviews({status:'ready',page:{guideKey,total:result.count,average:result.averageQuality,reviews:result.reviews.map(r=>({...r,guideKey,status:'published' as const,rating:r.quality}))}})}catch{setReviews({status:'error'})}},[api,guideKey,stableSource]);
  const loadDetails=useCallback(async()=>{try{setDetails({status:'ready',value:await api.profileDetails(stableSource)})}catch{setDetails({status:'error'})}},[api,stableSource]);
  const loadSubmissions=useCallback(async(offset=0,epoch=authEpoch.current)=>{try{const rows=await api.mySubmissions(offset,50);if(epoch!==authEpoch.current)return;setSubmissions(previous=>offset===0?rows:[...(previous??[]),...rows]);setNextOffset(offset+rows.length);setMore(rows.length===50);setStatusError(false)}catch{if(epoch===authEpoch.current)setStatusError(true)}},[api]);
  const refreshSession=useCallback(async()=>{
    const epoch=++authEpoch.current;
    try{const result=await authClient?.auth.getSession();if(epoch!==authEpoch.current)return;if(!result?.data.session){setSession('signed_out');setSubmissions(null);return}await api.session();if(epoch!==authEpoch.current)return;setSession('signed_in');await loadSubmissions(0,epoch)}
    catch{if(epoch===authEpoch.current){setSession('error');setSubmissions(null)}}
  },[api,loadSubmissions]);
  useEffect(()=>{void loadReviews();void loadDetails();void refreshSession();if(!authClient)return;const {data:{subscription}}=authClient.auth.onAuthStateChange((_event,next)=>{authEpoch.current++;setSession(next?'loading':'signed_out');setSubmissions(null);setRevision(null);window.setTimeout(()=>void refreshSession(),0)});return()=>{authEpoch.current++;subscription.unsubscribe()}},[loadReviews,loadDetails,refreshSession]);
  useEffect(()=>{let generation=0;function openReview(){const id=publishedReviewIdFromHash(window.location.hash),current=++generation;if(!id){setSelected(null);return}setSelected({status:'loading',id});void api.publicReview(stableSource,id).then(r=>{if(current===generation)setSelected({status:'ready',review:{...r,guideKey,status:'published',rating:r.quality}})}).catch(()=>{if(current===generation)setSelected({status:'error',id})})}window.addEventListener('hashchange',openReview);openReview();return()=>{generation++;window.removeEventListener('hashchange',openReview)}},[api,guideKey,stableSource]);
  const own=(submissions??[]).filter(item=>item.jurisdiction===source.jurisdiction&&item.sourceId===source.sourceId);
  const owner=own.some(item=>item.kind==='claim'&&item.status==='approved');
  async function editReview(id:string){setRevisionError('');try{setRevision({id,initial:await api.reviewDetail(source,id)})}catch{setRevisionError('This review cannot be edited right now. Its published version has not changed.')}}
  async function saveDetails(value:OwnerDetails){await api.editDetails(source,value);const saved=await api.profileDetails(source);if(!saved||saved.boat!==value.boat.trim()||saved.gear!==value.gear.trim()||saved.expertise!==value.expertise.trim()||saved.species!==value.species.trim()||saved.yearsExperience!==value.yearsExperience)throw new Error('No confirmed readback');setDetails({status:'ready',value:saved})}
  return <>
    <section className="section" id="reviews">
      {selected?.status==='loading'&&<p role="status">Loading the linked review…</p>}{selected?.status==='error'&&<p role="status">The linked review is unavailable.</p>}{selected?.status==='ready'&&<><h2>Linked angler review</h2><ReviewCard review={selected.review} profilePath={profilePath} guideName={guideName}/></>}
      <PublishedReviews guideKey={guideKey} state={selected?.status==='ready'&&reviews.status==='ready'?{status:'ready',page:{...reviews.page,reviews:reviews.page.reviews.filter(r=>r.id!==selected.review.id)}}:reviews} profilePath={profilePath} guideName={guideName}/>
    </section>
    {details.status==='ready'&&details.value&&<section className="card"><h2>Captain-declared details</h2><p>These details were supplied by the approved captain and are not independently verified.</p>{details.value.boat&&<p><strong>Boat:</strong> {details.value.boat}</p>}{details.value.gear&&<p><strong>Gear:</strong> {details.value.gear}</p>}{details.value.yearsExperience!==null&&<p><strong>Years of experience:</strong> {details.value.yearsExperience}</p>}{details.value.expertise&&<p><strong>Expertise:</strong> {details.value.expertise}</p>}{details.value.species&&<p><strong>Species:</strong> {details.value.species}</p>}</section>}
    <section className="section" id="write-review"><h2>Review or claim this listing</h2>
      {reviews.status==='ready'?<><p>Sign in to submit a firsthand review or request ownership of this listing.</p><AuthPanel profilePath={profilePath} onSignedIn={()=>void refreshSession()}/>
        {session==='loading'&&<p role="status">Checking your account…</p>}{session==='error'&&<p role="status">Your account status is temporarily unavailable.</p>}
        {session==='signed_in'&&<><ReviewSubmission allowTripResponses onSubmit={async draft=>{const receipt=await api.submitReview(source,draft);void loadSubmissions();return receipt}}/>
          <ClaimSubmission onSubmit={async draft=>{const receipt=await api.submitClaim(source,draft);void loadSubmissions();return receipt}}/>
          <section><h3>Your submissions</h3>{statusError?<p role="status">Your submission status is temporarily unavailable.</p>:submissions===null?<p role="status">Loading your submissions…</p>:<>{own.length===0&&<p>No submissions for this listing in the loaded results.</p>}{own.map(item=><div key={`${item.kind}:${item.id}`}><p>{item.kind==='revision'?'Review edit':item.kind==='claim'?'Claim request':'Review'}: <strong>{item.status}</strong></p><p>{nextSteps(item)}</p>{item.kind==='review'&&item.status==='published'&&<button type="button" onClick={()=>void editReview(item.id)}>Edit your review</button>}</div>)}{more&&<button type="button" onClick={()=>void loadSubmissions(nextOffset)}>Load more submissions</button>}</>}
            {revisionError&&<p role="alert">{revisionError}</p>}{revision&&<ReviewSubmission key={revision.id} initial={revision.initial} mode="revision" allowTripResponses onSubmit={async draft=>{const receipt=await api.submitRevision(revision.id,draft);void loadSubmissions();return receipt}}/>}
          </section>
          {owner&&details.status==='ready'&&<OwnerEditor initial={details.value} onSave={saveDetails}/>}
        </>}
      </>:<p role="status">Review and claim requests are temporarily unavailable for this listing.</p>}
    </section>
    <ProfileSharing profilePath={profilePath} guideName={guideName} reviewAvailable={reviews.status==='ready'}/>
  </>;
}
