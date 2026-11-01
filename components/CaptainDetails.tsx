'use client';
import {useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db=url&&key?createClient(url,key):null;
type Details={boat:string;gear:string;years_experience:number|null;expertise:string;targeted_species:string};
const empty:Details={boat:'',gear:'',years_experience:null,expertise:'',targeted_species:''};
export default function CaptainDetails({slug}:{slug:string}){
 const [id,setId]=useState(''),[details,setDetails]=useState<Details>(empty),[owner,setOwner]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;async function load(){if(!db)return;const {data:g}=await db.from('guides').select('id').eq('slug',slug).single();if(!g||!live)return;setId(g.id);const {data:d}=await db.from('guide_details').select('boat,gear,years_experience,expertise,targeted_species').eq('guide_id',g.id).maybeSingle();if(d&&live)setDetails(d);const {data:u}=await db.auth.getUser();if(u.user){const {data:c}=await db.from('guide_claims').select('id').eq('guide_id',g.id).eq('claimant_id',u.user.id).eq('status','approved').limit(1);if(live)setOwner(!!c?.length)}}void load();return()=>{live=false}},[slug]);
 async function save(){if(!db||!id)return;setSaving(true);const {error}=await db.from('guide_details').upsert({guide_id:id,...details},{onConflict:'guide_id'});setMessage(error?.message||'Captain information updated.');setSaving(false)}
 const edit=(k:keyof Details,v:string)=>setDetails(p=>({...p,[k]:k==='years_experience'?(v===''?null:Number(v)):v}));
 const values=[['Boat / vessel','boat'],['Rods, tackle and gear','gear'],['Areas of expertise','expertise'],['Species targeted','targeted_species']] as const;
 return <section className="section card"><h2>About this captain and their trips</h2>
 {!owner?<div>{values.map(([label,k])=><p key={k}><strong>{label}:</strong> {details[k]||'Not provided yet'}</p>)}<p><strong>Years of experience:</strong> {details.years_experience??'Not provided yet'}</p></div>:
 <div className="captain-details-editor">{values.map(([label,k])=><label key={k}>{label}<textarea maxLength={k==='boat'?250:k==='targeted_species'?350:500} value={details[k]} onChange={e=>edit(k,e.target.value)} rows={2}/></label>)}<label>Years of experience<input type="number" min={0} max={80} value={details.years_experience??''} onChange={e=>edit('years_experience',e.target.value)}/></label><button disabled={saving} onClick={()=>void save()}>Save captain information</button></div>}
 {message&&<p role="status">{message}</p>}<p className="muted">Details are provided by the captain after ownership approval, not independently verified by RateMyGuidePNW.</p></section>
}
