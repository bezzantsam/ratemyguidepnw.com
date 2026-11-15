'use client';
import {useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {matchesPublicGuideIdentity} from '@/lib/guide-db-identity';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
type Review={id:string;body:string;quality:number;published_at:string;would_book_again:boolean};

export default function CaptainReviews({slug,expectedName,expectedBusiness}:{slug:string;expectedName:string;expectedBusiness:string|null}){
 const [reviews,setReviews]=useState<Review[]>([]);
 const [status,setStatus]=useState('Review data is unavailable.');
 useEffect(()=>{
  let active=true;
  setReviews([]);
  setStatus('Review data is unavailable.');
  // Washington slugs have historically identified different live rows. No
  // reviewed mapping to immutable database IDs exists yet, so do not query.
  if(!db||slug.startsWith('wa-'))return ()=>{active=false};
  async function load(){
   const {data:g,error}=await db!.from('guides').select('id,full_name,outfit_name').eq('slug',slug).maybeSingle();
   if(!active||error||!g||!matchesPublicGuideIdentity({name:expectedName,business:expectedBusiness},g))return;
   const {data:r,error:reviewError}=await db!.from('public_angler_reviews').select('id,body,quality,published_at,would_book_again').eq('guide_id',g.id).order('published_at',{ascending:false}).limit(50);
   if(!active||reviewError)return;
   setReviews(r||[]);setStatus('');
  }
  void load();
  return ()=>{active=false};
 },[slug,expectedName,expectedBusiness]);
 return <section className="section" id="reviews"><h2>Ratings &amp; angler reviews</h2>
 {status?<p role="status">{status}</p>:reviews.length===0?<p>No published reviews yet.</p>:<div className="review-list">{reviews.map(r=><article className="card" key={r.id}><p><strong>{r.quality}/5 overall</strong> · Would book again: {r.would_book_again?'Yes':'No'}</p><p className="muted">Anonymous angler · {new Date(r.published_at).toLocaleDateString()}</p><p>{r.body}</p></article>)}</div>}
 <p>Review submissions are not currently available.</p></section>;
}
