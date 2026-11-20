'use client';

import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import AuthPanel,{client as authClient} from '@/components/AuthPanel';
import ReturnToResults from '@/components/ReturnToResults';
import {createLaunchClient,LaunchClientError,type GuideSource,type OwnStatus,type OwnSubmission,type OwnerDetails,type ReportReason} from '@/lib/launch-client';
import {publishedReviewIdFromHash} from '@/lib/canonical-share';
import {ProfileSharing} from './ProfileSharing';
import {WashingtonReviewStatus} from './WashingtonReviewStatus';
import {PublishedReviews,ReviewCard,validReviewPage,type PublishedReview,type ReviewLoadState} from './PublishedReviews';
import {ReviewSubmission} from './SubmissionViews';
import {clearReviewDraft,clearReviewDraftsForAccount} from './review-draft-storage';
import type {ReviewDraft} from './submission-model';

type DetailsState={status:'loading'|'error'}|{status:'ready';value:OwnerDetails|null};
type OwnReviewState={status:'loading'|'error'}|{status:'ready';review:OwnStatus|null};
type RevisionWrite={epoch:number;accountId:string;editorId:number};
function nextSteps(item:OwnSubmission):string {
  if(item.kind==='claim')return item.status==='pending'?'Your request is awaiting review. Editing is not available yet.':item.status==='approved'?'Your ownership request was approved. You may edit captain-declared details when available.':'Your ownership request was not approved.';
  if(item.kind==='revision')return item.status==='pending'?'Your changes are awaiting review.':item.status==='approved'?'Your changes have been published.':'Your changes were not published.';
  return item.status==='pending'?'Your review is awaiting review and is not public.':item.status==='published'?'Your review is published.':item.status==='removed'?'Your review is no longer published.':'Your review was not published.';
}

export function GuideEngagement({source,profilePath,guideName,compactProfile=false,children}:{source:GuideSource;profilePath:string;guideName:string;compactProfile?:boolean;children?:ReactNode}) {
  const guideKey=`${source.jurisdiction}:${source.sourceId}`;
  const stableSource=useMemo(()=>({jurisdiction:source.jurisdiction,sourceId:source.sourceId}),[source.jurisdiction,source.sourceId]);
  const api=useMemo(()=>createLaunchClient({enabled:true,getAccessToken:async()=>{const result=await authClient?.auth.getSession();return result?.data.session?.access_token??null}}),[]);
  const [reviews,setReviews]=useState<ReviewLoadState>({status:'loading'}),[details,setDetails]=useState<DetailsState>({status:'loading'});
  const [publishedVersion,setPublishedVersion]=useState(0);
  const [session,setSession]=useState<'loading'|'signed_out'|'signed_in'|'error'>('loading');
  const [reviewAccount,setReviewAccount]=useState<string|null>(null);
  const reviewAccountRef=useRef<string|null>(null);
  const reviewApi=useMemo(()=>createLaunchClient({enabled:true,getAccessToken:async()=>{
    const session=(await authClient?.auth.getSession())?.data.session;
    return reviewAccount && session?.user.id===reviewAccount ? session.access_token : null;
  }}),[reviewAccount]);
  const [ownReview,setOwnReview]=useState<OwnReviewState>({status:'loading'});
  const [writeReady,setWriteReady]=useState<boolean|'error'|null>(null),[formActivated,setFormActivated]=useState(false);
  const [submissions,setSubmissions]=useState<OwnSubmission[]|null>(null),[nextOffset,setNextOffset]=useState(0),[more,setMore]=useState(false),[statusError,setStatusError]=useState(false);
  const [revision,setRevision]=useState<{id:string;initial:ReviewDraft;editorId:number;epoch:number}|null>(null),[revisionError,setRevisionError]=useState('');
  const [revisionWrite,setRevisionWrite]=useState<RevisionWrite|null>(null);
  const revisionWriteRef=useRef<RevisionWrite|null>(null);
  const [selected,setSelected]=useState<{status:'loading'|'error';id:string}|{status:'ready';review:PublishedReview}|null>(null);
  const authEpoch=useRef(0),availabilityEpoch=useRef(0),reviewLoadEpoch=useRef(0);
  const revisionEditorId=useRef(0);
  const revisionBusy=revisionWrite!==null&&revisionWrite.epoch===authEpoch.current&&revisionWrite.accountId===reviewAccount;
  const washington=source.jurisdiction==='WA';
  const canReview=writeReady===true;
  const showReviewTools=!washington||canReview;
  const page = showReviewTools && compactProfile && reviews.status==='ready' && validReviewPage(guideKey,reviews.page) ? reviews.page : null;
  const canReadAccount = !washington || page !== null;
  const loadReviews=useCallback(async()=>{
    const epoch=++reviewLoadEpoch.current;
    try{
      const result=await api.publicReviews(stableSource);
      if(epoch!==reviewLoadEpoch.current)return;
      setReviews({status:'ready',page:{guideKey,total:result.count,average:result.averageQuality,reviews:result.reviews.map(r=>({...r,guideKey,status:'published' as const,rating:r.quality}))}});
    }catch(error){
      if(epoch!==reviewLoadEpoch.current)return;
      if(washington&&error instanceof LaunchClientError&&['forbidden','not_found'].includes(error.code))setWriteReady(false);
      setReviews({status:'error'});
    }
  },[api,guideKey,stableSource,washington]);
  const loadDetails=useCallback(async()=>{try{setDetails({status:'ready',value:await api.profileDetails(stableSource)})}catch{setDetails({status:'error'})}},[api,stableSource]);
  const loadWriteReady=useCallback(async()=>{
    const epoch=++availabilityEpoch.current;
    if(washington){
      reviewLoadEpoch.current++;
      setReviews({status:'loading'});
    }
    setWriteReady(null);
    try{
      const available=await api.reviewWriteAvailability(stableSource);
      if(epoch===availabilityEpoch.current)setWriteReady(available);
    }catch{
      if(epoch===availabilityEpoch.current)setWriteReady('error');
    }
  },[api,stableSource,washington]);
  const loadOwnReview=useCallback(async(epoch=authEpoch.current)=>{setOwnReview({status:'loading'});try{const review=await api.ownReviewForGuide(stableSource);if(epoch===authEpoch.current){if(review&&reviewAccountRef.current)clearReviewDraft({...stableSource,accountId:reviewAccountRef.current});setOwnReview({status:'ready',review})}}catch{if(epoch===authEpoch.current)setOwnReview({status:'error'})}},[api,stableSource]);
  function recordWriteFailure(error:unknown){
    if(!(error instanceof LaunchClientError))return;
    const closed=error.code==='launch_unavailable'||
      (washington?error.code==='forbidden':error.code==='service_unavailable');
    if(closed){availabilityEpoch.current++;setWriteReady(false)}
  }
  async function reportReview(id:string,reason:ReportReason){try{return await api.reportReview(stableSource,id,reason)}catch(error){recordWriteFailure(error);throw error}}
  const loadSubmissions=useCallback(async(offset=0,epoch=authEpoch.current)=>{try{const rows=await api.mySubmissions(offset,50);if(epoch!==authEpoch.current)return;setSubmissions(previous=>offset===0?rows:[...(previous??[]),...rows]);setNextOffset(offset+rows.length);setMore(rows.length===50);setStatusError(false)}catch{if(epoch===authEpoch.current)setStatusError(true)}},[api]);
  const refreshSession=useCallback(async()=>{
    const epoch=++authEpoch.current;
    try{const result=await authClient?.auth.getSession();if(epoch!==authEpoch.current)return;if(!result?.data.session){reviewAccountRef.current=null;setSession('signed_out');setReviewAccount(null);setSubmissions(null);setOwnReview({status:'loading'});return}await api.session();if(epoch!==authEpoch.current)return;reviewAccountRef.current=result.data.session.user.id;setReviewAccount(result.data.session.user.id);setSession('signed_in');await Promise.all([loadSubmissions(0,epoch),loadOwnReview(epoch)])}
    catch{if(epoch===authEpoch.current){reviewAccountRef.current=null;setSession('error');setReviewAccount(null);setSubmissions(null);setOwnReview({status:'error'})}}
  },[api,loadSubmissions,loadOwnReview]);
  useEffect(()=>{setFormActivated(false);setWriteReady(null);void loadWriteReady();return()=>{availabilityEpoch.current++}},[loadWriteReady]);
  useEffect(()=>{if(writeReady===true)setFormActivated(true)},[writeReady]);
  useEffect(()=>{if(showReviewTools)void loadReviews()},[showReviewTools,loadReviews,publishedVersion]);
  useEffect(()=>{if(!washington)void loadDetails()},[washington,loadDetails]);
  useEffect(()=>{
    if(!canReadAccount)return;
    let refreshTimer: number | undefined;
    void refreshSession();
    const subscription=authClient?.auth.onAuthStateChange((event,next)=>{
      // Supabase also announces SIGNED_IN when an existing tab regains focus.
      // The current account already passed the session check; its new token is
      // read on each API call. Keep the mounted form and in-flight work intact.
      if(next?.user.id&&next.user.id===reviewAccountRef.current)return;
      if(event==='SIGNED_OUT'&&reviewAccountRef.current)clearReviewDraftsForAccount(reviewAccountRef.current);
      reviewAccountRef.current=null;
      authEpoch.current++;
      setSession(next?'loading':'signed_out');
      setReviewAccount(null);
      setSubmissions(null);
      setOwnReview({status:'loading'});
      setRevision(null);
      window.clearTimeout(refreshTimer);
      refreshTimer=window.setTimeout(()=>void refreshSession(),0);
    }).data.subscription;
    return()=>{
      authEpoch.current++;
      window.clearTimeout(refreshTimer);
      subscription?.unsubscribe();
    };
  },[canReadAccount,refreshSession]);
  useEffect(()=>{if(!canReadAccount)return;let generation=0;function openReview(){const id=publishedReviewIdFromHash(window.location.hash),current=++generation;if(!id){setSelected(null);return}setSelected({status:'loading',id});void api.publicReview(stableSource,id).then(r=>{if(current===generation)setSelected({status:'ready',review:{...r,guideKey,status:'published',rating:r.quality}})}).catch(()=>{if(current===generation)setSelected({status:'error',id})})}window.addEventListener('hashchange',openReview);openReview();return()=>{generation++;window.removeEventListener('hashchange',openReview)}},[api,guideKey,stableSource,canReadAccount,publishedVersion]);
  const own=(submissions??[]).filter(item=>item.identities.some(identity=>identity.jurisdiction===source.jurisdiction&&identity.sourceId===source.sourceId));
  const existingReview=ownReview.status==='ready'?ownReview.review:null;
  const pendingRevision=existingReview&&own.some(item=>item.kind==='revision'&&item.reviewId===existingReview.id&&item.status==='pending');
  const availabilityError=writeReady==='error'||reviews.status==='error';
  const availabilityMessage=writeReady===null||reviews.status==='loading'
    ? 'Checking review availability…'
    : availabilityError
      ? 'We couldn’t check review availability.'
      : 'Review submissions are unavailable for this guide right now.';
  async function editReview(id:string){
    if(!reviewAccount||reviewAccount!==reviewAccountRef.current||revisionWriteRef.current?.epoch===authEpoch.current)return;
    const epoch=authEpoch.current,account=reviewAccount,editorId=++revisionEditorId.current;
    setRevisionError('');
    try{
      const initial=await reviewApi.reviewDetail(stableSource,id);
      if(epoch===authEpoch.current&&account===reviewAccountRef.current&&editorId===revisionEditorId.current)setRevision({id,initial,editorId,epoch});
    }catch{
      if(epoch===authEpoch.current&&account===reviewAccountRef.current)setRevisionError('This review cannot be edited right now. Its published version has not changed.');
    }
  }
  const offerReview = canReview && !!page;
  const inviteFirst = offerReview && (session==='signed_out' || (session==='signed_in' && ownReview.status==='ready' && !existingReview));
  async function submitFirstReview(draft: ReviewDraft) {
    const epoch=authEpoch.current;
    try {
      const receipt=await reviewApi.submitReview(stableSource,draft);
      if(reviewAccount)clearReviewDraft({...stableSource,accountId:reviewAccount});
      if(epoch===authEpoch.current){
        setOwnReview({status:'ready',review:receipt});
        void loadSubmissions(0,epoch);
        if(receipt.status==='published')setPublishedVersion(version=>version+1);
      }
      return receipt;
    } catch(error) {
      if(epoch===authEpoch.current)recordWriteFailure(error);
      throw error;
    }
  }

  async function submitRevision(draft:ReviewDraft){
    if(!revision||!reviewAccount||revision.epoch!==authEpoch.current||reviewAccount!==reviewAccountRef.current||revision.editorId!==revisionEditorId.current)throw new Error('Review editor is unavailable');
    if(revisionWriteRef.current?.epoch===authEpoch.current)throw new Error('Your review changes are already being saved');
    const epoch=authEpoch.current;
    const write={epoch,accountId:reviewAccount,editorId:revision.editorId};
    revisionWriteRef.current=write;
    setRevisionWrite(write);
    try{
      const receipt=await reviewApi.submitRevision(revision.id,draft);
      // An old session must not clear a newer draft, including in the form's
      // own receipt handler after this promise resolves.
      if(revisionWriteRef.current!==write||epoch!==authEpoch.current||reviewAccount!==reviewAccountRef.current)throw new Error('Review account changed');
      clearReviewDraft({...stableSource,accountId:reviewAccount,reviewId:revision.id},'revision');
      if(epoch===authEpoch.current){
        void loadSubmissions(0,epoch);
        if(receipt.status==='approved')setPublishedVersion(version=>version+1);
      }
      return receipt;
    }catch(error){
      if(epoch===authEpoch.current)recordWriteFailure(error);
      throw error;
    }finally{
      if(revisionWriteRef.current===write){revisionWriteRef.current=null;setRevisionWrite(null)}
    }
  }

  async function checkBeforeRetry() {
    const epoch=authEpoch.current;
    const existing=await reviewApi.ownReviewForGuide(stableSource);
    if(epoch!==authEpoch.current)throw new Error('Review account changed');
    if(existing){
      if(reviewAccount)clearReviewDraft({...stableSource,accountId:reviewAccount});
      setOwnReview({status:'ready',review:existing});
      void loadSubmissions(0,epoch);
      if(existing.status==='published')setPublishedVersion(version=>version+1);
      return 'submitted' as const;
    }
    const availability=++availabilityEpoch.current;
    const ready=await api.reviewWriteAvailability(stableSource);
    if(epoch!==authEpoch.current || availability!==availabilityEpoch.current)throw new Error('Review availability changed');
    setWriteReady(ready);
    return ready ? 'ready' as const : 'closed' as const;
  }

  const retryAvailability = () => {void loadWriteReady();if(showReviewTools&&!washington)void loadReviews()};
  // AuthPanel receives the same focus/token notifications. Its callback must
  // not restart the account lookup and unmount a form for an accepted account.
  const onSignedIn = () => {if(!reviewAccountRef.current)void refreshSession()};
  const compactError = (showReviewTools && (reviews.status==='error' || (reviews.status==='ready' && !page))) || writeReady==='error';
  const compactStatus = compactError ? 'Couldn’t load review information.' :
    writeReady===false ? 'Review submissions are closed.' :
    writeReady===null || reviews.status==='loading' ? 'Loading review information…' : '';
  const historyOnly = !washington && compactProfile && page && !canReview && !formActivated && session==='signed_out';
  if(washington && !page)return <>
    <WashingtonReviewStatus
      status={writeReady===false?'held':compactError?'error':'checking'}
      onRetry={retryAvailability}/>
    <ProfileSharing profilePath={profilePath} guideName={guideName} reviewAvailable={false}/>
  </>;

  return <>
    {compactProfile ? <section className="guide-actions" aria-label="Profile actions">
      {page && <p className="guide-rating">{page.total>0
        ? <a href="#reviews"><strong>{page.average?.toFixed(1)} / 5</strong> · {page.total} {page.total===1?'review':'reviews'}</a>
        : 'No published reviews yet.'}</p>}
      <ProfileSharing profilePath={profilePath} guideName={guideName} reviewAvailable={offerReview}
        primaryAction={page && existingReview
          ? <a className="button guide-rate" href="#your-submissions">View your review status</a>
          : offerReview
          ? <a className="button guide-rate" href="#write-review">Rate {guideName}</a>
          : <button type="button" className="button guide-rate" disabled aria-describedby="guide-write-status">Rate {guideName}</button>}/>
      {compactStatus && <p id="guide-write-status" className="guide-status" role="status">{compactStatus}
        {compactError && <button type="button" className="guide-retry" onClick={retryAvailability}>Retry</button>}</p>}
    </section> : <section className="section" aria-label={`Rate ${guideName}`}>
      {canReview&&reviews.status==='ready'
        ? existingReview
          ? <a className="button" href="#your-submissions">View your review status</a>
          : <a className="button" href="#write-review">Rate {guideName}</a>
        : <><h2>Rate {guideName}</h2><p role="status">{availabilityMessage}</p>{availabilityError&&<button type="button" onClick={()=>{void loadWriteReady();if(reviews.status==='error')void loadReviews()}}>Retry review availability</button>}</>}
    </section>}
    {showReviewTools&&<section className="section" id="reviews">
      {selected?.status==='loading'&&<p role="status">Loading the linked review…</p>}{selected?.status==='error'&&<p role="status">The linked review is unavailable.</p>}{selected?.status==='ready'&&<><h2>Linked angler review</h2><ReviewCard review={selected.review} profilePath={profilePath} guideName={guideName} allowSignIn={canReview&&session==='signed_out'} onReport={canReview&&session==='signed_in'?reportReview:undefined}/></>}
      <PublishedReviews compactProfile={compactProfile} inviteFirst={inviteFirst} guideKey={guideKey} state={selected?.status==='ready'&&reviews.status==='ready'?{status:'ready',page:{...reviews.page,reviews:reviews.page.reviews.filter(r=>r.id!==selected.review.id)}}:reviews} profilePath={profilePath} guideName={guideName} allowSignIn={canReview&&session==='signed_out'} onReport={canReview&&session==='signed_in'?reportReview:undefined}/>
    </section>}
    {children}
    {details.status==='ready'&&details.value&&<section className="card"><h2>Captain-declared details</h2><p>These details were supplied by the approved captain and are not independently verified.</p>{details.value.boat&&<p><strong>Boat:</strong> {details.value.boat}</p>}{details.value.gear&&<p><strong>Gear:</strong> {details.value.gear}</p>}{details.value.yearsExperience!==null&&<p><strong>Years of experience:</strong> {details.value.yearsExperience}</p>}{details.value.expertise&&<p><strong>Expertise:</strong> {details.value.expertise}</p>}{details.value.species&&<p><strong>Species:</strong> {details.value.species}</p>}</section>}
    {showReviewTools&&<section className="section launch-controls" id="write-review">
      {historyOnly ? <details><summary>Check a previous submission</summary>
        <AuthPanel emailOnly profilePath={profilePath} onSignedIn={onSignedIn}/>
      </details> : (!compactProfile || (page && (canReview || formActivated || session==='signed_in'))) && <>
      <h2>Rate {guideName}</h2>
      {washington&&<ReturnToResults fallback="/write-review"/>}
      {reviews.status==='ready'?<>{session==='signed_out'&&<p>{writeReady===true?'Sign in to share a firsthand experience with this guide.':'Sign in to check your existing submissions.'}</p>}<AuthPanel emailOnly profilePath={profilePath} onSignedIn={onSignedIn}/>
        {session==='loading'&&<p role="status">Checking your account…</p>}{session==='error'&&<p role="status">Your account status is temporarily unavailable.</p>}
        {session==='signed_in'&&<>{ownReview.status==='loading'&&<p role="status">Checking your review for this guide…</p>}{ownReview.status==='error'&&<><p role="status">Your review status is temporarily unavailable.</p><button type="button" onClick={()=>void loadOwnReview()}>Retry review status</button></>}
          {reviewAccount&&ownReview.status==='ready'&&!existingReview&&(canReview||formActivated)&&<ReviewSubmission key={`${guideKey}:${reviewAccount}`} draftScope={{...stableSource,accountId:reviewAccount}} allowTripResponses writeAvailable={canReview} onCheckBeforeRetry={checkBeforeRetry} onSubmit={submitFirstReview}/>}
          {!compactProfile&&writeReady===false&&<><p role="status">Reviews aren’t available for this guide right now.</p>{source.jurisdiction==='OR'&&<button type="button" onClick={()=>void loadWriteReady()}>Check review availability</button>}</>}
          {!compactProfile&&writeReady==='error'&&<p role="status">We couldn’t check review availability. Try again before submitting.</p>}
          <section id="your-submissions"><h3>Your submissions</h3>{existingReview&&<div><p>Review: <strong>{existingReview.status}</strong></p><p>{existingReview.status==='pending'?'Your review is awaiting review and is not public.':existingReview.status==='published'?'Your review is published.':existingReview.status==='removed'?'Your review is no longer published.':'Your review was not published.'}</p>{canReview&&existingReview.status==='published'&&!pendingRevision&&!more&&submissions!==null&&!statusError&&<button type="button" disabled={revisionBusy} onClick={()=>void editReview(existingReview.id)}>Edit your review</button>}{existingReview.status==='published'&&pendingRevision&&<p>Your changes are awaiting review.</p>}</div>}{statusError?<><p role="status">Your submission status is temporarily unavailable.</p><button type="button" onClick={()=>void loadSubmissions()}>Retry status</button></>:submissions===null?<p role="status">Loading your submissions…</p>:<>{own.filter(item=>item.kind!=='review').map(item=><div key={`${item.kind}:${item.id}`}><p>{item.kind==='revision'?'Review edit':'Claim request'}: <strong>{item.status}</strong></p><p>{nextSteps(item)}</p></div>)}{more&&<><p>Load the remaining submissions to check your full review history.</p><button type="button" onClick={()=>void loadSubmissions(nextOffset)}>Load more submissions</button></>}</>}
            {revisionError&&<p role="alert">{revisionError}</p>}{revision&&reviewAccount&&<ReviewSubmission key={`${guideKey}:${reviewAccount}:${revision.id}:${revision.editorId}`} draftScope={{...stableSource,accountId:reviewAccount,reviewId:revision.id}} initial={revision.initial} mode="revision" allowTripResponses writeAvailable={canReview} onSubmit={submitRevision}/>}
          </section>
        </>}
      </>:<p role="status">Review tools are temporarily unavailable for this listing.</p>}
    </>}
    </section>}
    {!compactProfile&&<ProfileSharing profilePath={profilePath} guideName={guideName} reviewAvailable={reviews.status==='ready'&&canReview}/>}
  </>;
}
