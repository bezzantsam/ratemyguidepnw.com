'use client';
import {useEffect,useState} from 'react';
import {Download, Smartphone} from 'lucide-react';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome:'accepted'|'dismissed'}>;
};

export default function AppInstall(){
 const [promptEvent,setPromptEvent]=useState<InstallEvent|null>(null);
 const [ios,setIos]=useState(false);
 const [showIosHelp,setShowIosHelp]=useState(false);
 const [installed,setInstalled]=useState(false);

 useEffect(()=>{
  const standalone=window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & {standalone?:boolean}).standalone===true;
  setInstalled(standalone);
  setIos(/iPad|iPhone|iPod/i.test(navigator.userAgent) && !standalone);
  function available(event:Event){
   event.preventDefault();
   setPromptEvent(event as InstallEvent);
  }
  function completed(){setPromptEvent(null);setInstalled(true);setShowIosHelp(false)}
  window.addEventListener('beforeinstallprompt',available);
  window.addEventListener('appinstalled',completed);
  return ()=>{
   window.removeEventListener('beforeinstallprompt',available);
   window.removeEventListener('appinstalled',completed);
  };
 },[]);

 async function install(){
  if(!promptEvent)return;
  const pending=promptEvent;
  setPromptEvent(null);
  try{
   await pending.prompt();
   const choice=await pending.userChoice;
   if(choice.outcome==='dismissed')setPromptEvent(null);
  }catch { /* Browser controls installation; no success claim. */ }
 }

 if(installed||(!promptEvent&&!ios))return null;
 return <aside className="app-install" aria-label="Install RateMyGuidePNW">
   <div className="app-install-copy"><Smartphone size={22} aria-hidden="true"/>
    <div><strong>Take the guide directory with you.</strong>
      <p>Open RateMyGuidePNW from your phone's Home Screen. Connection required for listings and reviews.</p>
    </div>
   </div>
   {promptEvent?<button type="button" onClick={()=>void install()}><Download size={17} aria-hidden="true"/> Install app</button>:
    <><button type="button" aria-expanded={showIosHelp} onClick={()=>setShowIosHelp(v=>!v)}>
      <Download size={17} aria-hidden="true"/> Add to Home Screen
    </button>{showIosHelp&&<p className="app-install-help">In Safari, tap Share, then Add to Home Screen. If that option is hidden, look under More Actions.</p>}</>}
 </aside>;
}
