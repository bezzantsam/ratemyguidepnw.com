'use client';
import {useEffect,useState} from 'react';
import {client} from './AuthPanel';
import ReviewComposer from './ReviewComposer';
import {summarizePublishedReviewSample,PUBLIC_REVIEW_PAGE_LIMIT} from '@/lib/review-scorecard';

type PublicReview = {
  id:string;body:string;quality:number;published_at:string;would_book_again:boolean;
  communication:number|null;professionalism:number|null;safety:number|null;
  equipment:number|null;knowledge:number|null;effort:number|null;
  value_rating:number|null;trip_context:string|null;
};

export default function CaptainReviews({slug}:{slug:string}){
  const [guideId,setGuideId]=useState('');
  const [reviews,setReviews]=useState<PublicReview[]>([]);
  const [status,setStatus]=useState('Loading reviews…');
  useEffect(()=>{
    if(!client){setStatus('Review database is not configured yet.');return}
    let active=true;
    async function load(){
      const {data:guide,error:guideError}=await client!.from('guides')
        .select('id').eq('slug',slug).maybeSingle();
      if(!active)return;
      if(guideError||!guide){setStatus('This listing is not yet connected to the review database.');return}
      setGuideId(guide.id);
      const {data,error}=await client!.from('public_angler_reviews')
        .select('id,body,quality,published_at,would_book_again,communication,professionalism,safety,equipment,knowledge,effort,value_rating,trip_context')
        .eq('guide_id',guide.id).order('published_at',{ascending:false}).limit(PUBLIC_REVIEW_PAGE_LIMIT);
      if(!active)return;
      if(error){setStatus('Published reviews could not be loaded.');return}
      setReviews(data||[]);
      setStatus('');
    }
    void load();
    return()=>{active=false};
  },[slug]);

  const scorecard=summarizePublishedReviewSample(reviews);
  return <section className="section" id="reviews">
    <h2>Ratings &amp; angler reviews</h2>
    <p className="muted">Reviews are public without the author’s account identity, but are associated with an account privately to discourage abuse. No booking receipt or payment proof is required. A moderated review is a firsthand self-report, not a verified trip.</p>
    {status&&<p className="muted" role="status">{status}</p>}
    {!status&&reviews.length===0&&<p>No published reviews yet. Share a genuine firsthand trip experience.</p>}
    {!status&&scorecard.count>0&&<div className="card review-scorecard" aria-label="Published review rating summary">
      <p><strong>{scorecard.average?.toFixed(1)}/5</strong> average from {scorecard.count}{scorecard.scope==='latest_50_published_reviews'?' most recent':''} published {scorecard.count===1?'review':'reviews'}</p>
      {scorecard.earlySample&&<p className="muted">Early sample: only {scorecard.count} {scorecard.count===1?'review':'reviews'}. Read individual experiences before drawing conclusions.</p>}
      <p className="muted">{scorecard.explanation}</p>
    </div>}
    <div className="review-list">{reviews.map(review=><article className="card" key={review.id}>
      <p><strong>{review.quality}/5 overall</strong> · Would book again: {review.would_book_again?'Yes':'No'}</p>
      <p className="muted">Anonymous angler · {new Date(review.published_at).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</p>
      <p>{review.body}</p>
      {review.trip_context&&<p className="muted">{review.trip_context}</p>}
    </article>)}</div>
    <ReviewComposer guideId={guideId} slug={slug}/>
  </section>;
}
