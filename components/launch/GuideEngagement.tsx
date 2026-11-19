'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import AuthPanel,{client as authClient} from '@/components/AuthPanel';
import {createLaunchClient,LaunchClientError,type GuideSource,type OwnStatus,type OwnSubmission,type OwnerDetails,type ReportReason} from '@/lib/launch-client';
import {publishedReviewIdFromHash} from '@/lib/canonical-share';
import {ProfileSharing} from './ProfileSharing';
import {PublishedReviews,ReviewCard,type PublishedReview,type ReviewLoadState} from './PublishedReviews';
import {ClaimSubmission,ReviewSubmission} from './SubmissionViews';
import type {ReviewDraft} from './submission-model';

const blankDetails:OwnerDetails={boat:'',gear:'',yearsExperience:null,expertise:'',species:''};
type DetailsState={status:'loading'|'error'}|{status:'ready';value:OwnerDetails|null};
type OwnReviewState={status:'loading'|'error'}|{status:'ready';review:OwnStatus|null};
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
  return <form className="card launch-form" onSubmit={submit}>
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
  const [ownReview,setOwnReview]=useState<OwnReviewState>({status:'loading'});
  const [writeReady,setWriteReady]=useState<boolean|'error'|null>(null),[formActivated,setFormActivated]=useState(false);
  const [submissions,setSubmissions]=useState<OwnSubmission[]|null>(null),[nextOffset,setNextOffset]=useState(0),[more,setMore]=useState(false),[statusError,setStatusError]=useState(false);
  const [revision,setRevision]=useState<{id:string;initial:ReviewDraft}|null>(null),[revisionError,setRevisionError]=useState('');
  const [selected,setSelected]=useState<{status:'loading'|'error';id:string}|{status:'ready';review:PublishedReview}|null>(null);
  const authEpoch=useRef(0),availabilityEpoch=useRef(0);
  const loadReviews=useCallback(async()=>{try{const result=await api.publicReviews(stableSource);setReviews({status:'ready',page:{guideKey,total:result.count,average:result.averageQuality,reviews:result.reviews.map(r=>({...r,guideKey,status:'published' as const,rating:r.quality}))}})}catch{setReviews({status:'error'})}},[api,guideKey,stableSource]);
  const loadDetails=useCallback(async()=>{try{setDetails({status:'ready',value:await api.profileDetails(stableSource)})}catch{setDetails({status:'error'})}},[api,stableSource]);
  const loadWriteReady=useCallback(async()=>{const epoch=++availabilityEpoch.current;setWriteReady(null);try{const available=await api.reviewWriteAvailability(stableSource);if(epoch===availabilityEpoch.current)setWriteReady(available)}catch{if(epoch===availabilityEpoch.current)setWriteReady('error')}},[api,stableSource]);
  const loadOwnReview=useCallback(async(epoch=authEpoch.current,quiet=false)=>{if(!quiet)setOwnReview({status:'loading'});try{const review=await api.ownReviewForGuide(stableSource);if(epoch===authEpoch.current)setOwnReview({status:'ready',review})}catch{if(epoch===authEpoch.current&&!quiet)setOwnReview({status:'error'})}},[api,stableSource]);
  function recordWriteFailure(error:unknown){if(error instanceof LaunchClientError&&['launch_unavailable','service_unavailable'].includes(error.code)){availabilityEpoch.current++;setWriteReady(false)}}
  async function reportReview(id:string,reason:ReportReason){try{return await api.reportReview(stableSource,id,reason)}catch(error){recordWriteFailure(error);throw error}}
  const loadSubmissions=useCallback(async(offset=0,epoch=authEpoch.current)=>{try{const rows=await api.mySubmissions(offset,50);if(epoch!==authEpoch.current)return;setSubmissions(previous=>offset===0?rows:[...(previous??[]),...rows]);setNextOffset(offset+rows.length);setMore(rows.length===50);setStatusError(false)}catch{if(epoch===authEpoch.current)setStatusError(true)}},[api]);
  const refreshSession=useCallback(async()=>{
    const epoch=++authEpoch.current;
    try{const result=await authClient?.auth.getSession();if(epoch!==authEpoch.current)return;if(!result?.data.session){setSession('signed_out');setSubmissions(null);setOwnReview({status:'loading'});return}await api.session();if(epoch!==authEpoch.current)return;setSession('signed_in');await Promise.all([loadSubmissions(0,epoch),loadOwnReview(epoch)])}
    catch{if(epoch===authEpoch.current){setSession('error');setSubmissions(null);setOwnReview({status:'error'})}}
  },[api,loadSubmissions,loadOwnReview]);
  useEffect(()=>{setFormActivated(false);setWriteReady(null);void loadWriteReady();return()=>{availabilityEpoch.current++}},[loadWriteReady]);
  useEffect(()=>{if(writeReady===true)setFormActivated(true)},[writeReady]);
  useEffect(()=>{void loadReviews();void loadDetails();void refreshSession();if(!authClient)return;const {data:{subscription}}=authClient.auth.onAuthStateChange((_event,next)=>{authEpoch.current++;setSession(next?'loading':'signed_out');setSubmissions(null);setOwnReview({status:'loading'});setRevision(null);window.setTimeout(()=>void refreshSession(),0)});return()=>{authEpoch.current++;subscription.unsubscribe()}},[loadReviews,loadDetails,refreshSession]);
  useEffect(()=>{let generation=0;function openReview(){const id=publishedReviewIdFromHash(window.location.hash),current=++generation;if(!id){setSelected(null);return}setSelected({status:'loading',id});void api.publicReview(stableSource,id).then(r=>{if(current===generation)setSelected({status:'ready',review:{...r,guideKey,status:'published',rating:r.quality}})}).catch(()=>{if(current===generation)setSelected({status:'error',id})})}window.addEventListener('hashchange',openReview);openReview();return()=>{generation++;window.removeEventListener('hashchange',openReview)}},[api,guideKey,stableSource]);
  const own=(submissions??[]).filter(item=>item.identities.some(identity=>identity.jurisdiction===source.jurisdiction&&identity.sourceId===source.sourceId));
  const existingReview=ownReview.status==='ready'?ownReview.review:null;
  const pendingRevision=existingReview&&own.some(item=>item.kind==='revision'&&item.reviewId===existingReview.id&&item.status==='pending');
  const owner=own.some(item=>item.kind==='claim'&&item.status==='approved');
  const availabilityMessage=writeReady===null||reviews.status==='loading'
    ? 'Checking review availability…'
    : writeReady==='error'||reviews.status==='error'
      ? 'We couldn’t check review availability.'
      : 'Review submissions are unavailable for this guide right now.';
  async function editReview(id:string){setRevisionError('');try{setRevision({id,initial:await api.reviewDetail(source,id)})}catch{setRevisionError('This review cannot be edited right now. Its published version has not changed.')}}
  async function saveDetails(value:OwnerDetails){await api.editDetails(source,value);const saved=await api.profileDetails(source);if(!saved||saved.boat!==value.boat.trim()||saved.gear!==value.gear.trim()||saved.expertise!==value.expertise.trim()||saved.species!==value.species.trim()||saved.yearsExperience!==value.yearsExperience)throw new Error('No confirmed readback');setDetails({status:'ready',value:saved})}
  return <>
    <section className="section" aria-label={`Rate ${guideName}`}>
      {writeReady===true&&reviews.status==='ready'
        ? <a className="button" href="#write-review">Rate {guideName}</a>
        : <><h2>Rate {guideName}</h2><p role="status">{availabilityMessage}</p>{(writeReady==='error'||reviews.status==='error')&&<button type="button" onClick={()=>{void loadWriteReady();if(reviews.status==='error')void loadReviews()}}>Retry review availability</button>}</>}
    </section>
    <section className="section" id="reviews">
      {selected?.status==='loading'&&<p role="status">Loading the linked review…</p>}{selected?.status==='error'&&<p role="status">The linked review is unavailable.</p>}{selected?.status==='ready'&&<><h2>Linked angler review</h2><ReviewCard review={selected.review} profilePath={profilePath} guideName={guideName} allowSignIn={session==='signed_out'} onReport={session==='signed_in'?reportReview:undefined}/></>}
      <PublishedReviews guideKey={guideKey} state={selected?.status==='ready'&&reviews.status==='ready'?{status:'ready',page:{...reviews.page,reviews:reviews.page.reviews.filter(r=>r.id!==selected.review.id)}}:reviews} profilePath={profilePath} guideName={guideName} allowSignIn={session==='signed_out'} onReport={session==='signed_in'?reportReview:undefined}/>
    </section>
    {details.status==='ready'&&details.value&&<section className="card"><h2>Captain-declared details</h2><p>These details were supplied by the approved captain and are not independently verified.</p>{details.value.boat&&<p><strong>Boat:</strong> {details.value.boat}</p>}{details.value.gear&&<p><strong>Gear:</strong> {details.value.gear}</p>}{details.value.yearsExperience!==null&&<p><strong>Years of experience:</strong> {details.value.yearsExperience}</p>}{details.value.expertise&&<p><strong>Expertise:</strong> {details.value.expertise}</p>}{details.value.species&&<p><strong>Species:</strong> {details.value.species}</p>}</section>}
    <section className="section launch-controls" id="write-review"><h2>Rate {guideName}</h2>
      {reviews.status==='ready'?<>{session==='signed_out'&&<p>{writeReady===true?'Sign in to share a firsthand experience with this guide.':'Sign in to check your existing submissions.'}</p>}<AuthPanel profilePath={profilePath} onSignedIn={()=>void refreshSession()}/>
        {session==='loading'&&<p role="status">Checking your account…</p>}{session==='error'&&<p role="status">Your account status is temporarily unavailable.</p>}
        {session==='signed_in'&&<>{ownReview.status==='loading'&&<p role="status">Checking your review for this guide…</p>}{ownReview.status==='error'&&<><p role="status">Your review status is temporarily unavailable.</p><button type="button" onClick={()=>void loadOwnReview()}>Retry review status</button></>}
          {ownReview.status==='ready'&&!existingReview&&(writeReady===true||formActivated)&&<ReviewSubmission allowTripResponses writeAvailable={writeReady===true} onDuplicate={()=>void loadOwnReview(undefined,true)} onSubmit={async draft=>{try{const receipt=await api.submitReview(stableSource,draft);void loadOwnReview(undefined,true);void loadSubmissions();return receipt}catch(error){recordWriteFailure(error);if(error instanceof LaunchClientError&&error.code==='service_unavailable')void loadOwnReview(undefined,true);throw error}}}/>}
          {writeReady===false&&<><p role="status">Reviews aren’t available for this guide right now.</p><button type="button" onClick={()=>void loadWriteReady()}>Check review availability</button></>}
          {writeReady==='error'&&<p role="status">We couldn’t check review availability. Try again before submitting.</p>}
          {writeReady===true&&<details><summary>Are you the captain? Request this listing</summary><ClaimSubmission onSubmit={async draft=>{const receipt=await api.submitClaim(source,draft);void loadSubmissions();return receipt}}/></details>}
          <section><h3>Your submissions</h3>{existingReview&&<div><p>Review: <strong>{existingReview.status}</strong></p><p>{existingReview.status==='pending'?'Your review is awaiting review and is not public.':existingReview.status==='published'?'Your review is published.':existingReview.status==='removed'?'Your review is no longer published.':'Your review was not published.'}</p>{existingReview.status==='published'&&!pendingRevision&&!more&&submissions!==null&&!statusError&&<button type="button" onClick={()=>void editReview(existingReview.id)}>Edit your review</button>}{existingReview.status==='published'&&pendingRevision&&<p>Your changes are awaiting review.</p>}</div>}{statusError?<><p role="status">Your submission status is temporarily unavailable.</p><button type="button" onClick={()=>void loadSubmissions()}>Retry status</button></>:submissions===null?<p role="status">Loading your submissions…</p>:<>{own.filter(item=>item.kind!=='review').map(item=><div key={`${item.kind}:${item.id}`}><p>{item.kind==='revision'?'Review edit':'Claim request'}: <strong>{item.status}</strong></p><p>{nextSteps(item)}</p></div>)}{more&&<><p>Load the remaining submissions to check your full review history.</p><button type="button" onClick={()=>void loadSubmissions(nextOffset)}>Load more submissions</button></>}</>}
            {revisionError&&<p role="alert">{revisionError}</p>}{revision&&<ReviewSubmission key={revision.id} initial={revision.initial} mode="revision" allowTripResponses writeAvailable={writeReady===true} onSubmit={async draft=>{try{const receipt=await api.submitRevision(revision.id,draft);void loadSubmissions();return receipt}catch(error){recordWriteFailure(error);throw error}}}/>}
          </section>
          {owner&&details.status==='ready'&&<OwnerEditor initial={details.value} onSave={saveDetails}/>}
        </>}
      </>:<p role="status">Review and claim requests are temporarily unavailable for this listing.</p>}
    </section>
    <ProfileSharing profilePath={profilePath} guideName={guideName} reviewAvailable={reviews.status==='ready'&&writeReady===true}/>
  </>;
}
