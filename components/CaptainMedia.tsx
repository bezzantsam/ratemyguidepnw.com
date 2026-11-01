'use client';
import {useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase=url&&key?createClient(url,key):null;
type Media={id:string;photo_path:string|null;video_url:string|null;caption:string};
function embedLink(link:string){try{const u=new URL(link);const host=u.hostname.replace(/^www\./,'');const id=host==='youtu.be'?u.pathname.slice(1):host==='youtube.com'?u.searchParams.get('v'):null;return id&&/^[\w-]{11}$/.test(id)?'https://www.youtube-nocookie.com/embed/'+id:null}catch{return null}}
export default function CaptainMedia({slug}:{slug:string}){
 const [guideId,setGuideId]=useState('');const[media,setMedia]=useState<Media[]>([]);const[owner,setOwner]=useState(false);const[email,setEmail]=useState('');const[video,setVideo]=useState('');const[caption,setCaption]=useState('');const[message,setMessage]=useState('');const[busy,setBusy]=useState(false);
 async function refresh(){
  if(!supabase)return;
  const {data:g}=await supabase.from('guides').select('id').eq('slug',slug).single();if(!g)return;setGuideId(g.id);
  const {data:items}=await supabase.from('guide_media').select('id,photo_path,video_url,caption').eq('guide_id',g.id).order('created_at');setMedia(items||[]);
  const {data:user}=await supabase.auth.getUser();if(!user.user){setOwner(false);return}
  const {data:claims}=await supabase.from('guide_claims').select('id').eq('guide_id',g.id).eq('claimant_id',user.user.id).eq('status','approved').limit(1);setOwner(!!claims?.length);
 }
 useEffect(()=>{void refresh();if(!supabase)return;const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{void refresh()});return ()=>subscription.unsubscribe()},[slug]);
 async function signIn(){if(!supabase)return;setBusy(true);const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.href}});setMessage(error?.message||'Check your email for a sign-in link.');setBusy(false)}
 async function upload(file:File|null){if(!supabase||!file||!guideId)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setMessage('Use a JPEG, PNG, or WebP under 5 MB.');return}
 if(media.filter(m=>m.photo_path).length>=10){setMessage('The 10-photo gallery is full.');return}
 setBusy(true);const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=slug+'/'+crypto.randomUUID()+'.'+ext;
 const uploaded=await supabase.storage.from('guide-photos').upload(path,file,{contentType:file.type,upsert:false});if(uploaded.error){setMessage(uploaded.error.message);setBusy(false);return}
 const saved=await supabase.from('guide_media').insert({guide_id:guideId,owner_id:(await supabase.auth.getUser()).data.user?.id,photo_path:path,caption:''});
 if(saved.error){await supabase.storage.from('guide-photos').remove([path]);setMessage(saved.error.message)}else setMessage('Photo uploaded.');await refresh();setBusy(false)}
 async function saveVideo(){if(!supabase||!guideId)return;if(!embedLink(video)){setMessage('Enter a valid YouTube video URL.');return}if(media.some(x=>x.video_url)){setMessage('Remove your existing welcome video first.');return}
 setBusy(true);const user=(await supabase.auth.getUser()).data.user;const {error}=await supabase.from('guide_media').insert({guide_id:guideId,owner_id:user?.id,video_url:video,caption:caption.slice(0,160)});setMessage(error?.message||'Welcome video saved.');await refresh();setBusy(false)}
 async function remove(item:Media){if(!supabase)return;setBusy(true);const {error}=await supabase.from('guide_media').delete().eq('id',item.id);if(!error&&item.photo_path)await supabase.storage.from('guide-photos').remove([item.photo_path]);setMessage(error?.message||'Media removed.');await refresh();setBusy(false)}
 const photos=media.filter(x=>x.photo_path),videos=media.filter(x=>x.video_url);
 return <section className="section captain-media"><h2>Photos &amp; welcome video</h2>
 {videos.map(m=>{const src=embedLink(m.video_url||'');return src?<div key={m.id} className="captain-video"><iframe src={src} title="Captain welcome video" loading="lazy" allowFullScreen allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"/>{m.caption&&<p>{m.caption}</p>}{owner&&<button disabled={busy} onClick={()=>remove(m)}>Remove video</button>}</div>:null})}
 {!!photos.length&&<div className="captain-gallery">{photos.map(m=><figure key={m.id}><img alt={m.caption||'Fishing guide gallery photo'} loading="lazy" src={supabase?.storage.from('guide-photos').getPublicUrl(m.photo_path!).data.publicUrl}/>{owner&&<button disabled={busy} onClick={()=>remove(m)}>Remove photo</button>}</figure>)}</div>}
 {!media.length&&<p className="muted">This captain has not added photos or a welcome video yet.</p>}
 {owner?<div className="media-editor"><h3>Manage your captain media</h3><label>Upload photo (JPEG, PNG, WebP; 5 MB maximum)<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void upload(e.target.files?.[0]||null);e.target.value=''}}/></label><label>Welcome video (YouTube link)<input disabled={busy} value={video} onChange={e=>setVideo(e.target.value)} placeholder="https://www.youtube.com/watch?v=..."/></label><label>Video caption (optional)<input maxLength={160} value={caption} onChange={e=>setCaption(e.target.value)}/></label><button disabled={busy||!video.trim()} onClick={()=>void saveVideo()}>Save welcome video</button><button disabled={busy} onClick={()=>void supabase?.auth.signOut()}>Sign out</button></div>:<div className="media-editor"><p className="muted">Only captains with an approved ownership claim can manage profile media.</p><details><summary>Already verified? Sign in to manage your photos</summary><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="captain@example.com"/></label><button disabled={busy||!email.includes('@')} onClick={()=>void signIn()}>Email me a sign-in link</button></details></div>}
 {message&&<p role="status">{message}</p>}
 </section>
}
