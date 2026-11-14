'use client';
import {useEffect} from 'react';

/** Register only on a secure origin; no client data is stored by the worker. */
export default function PWARegistration(){
 useEffect(()=>{
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  void navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{
   // Installation/offline availability is optional, not required for directory browsing.
  });
 },[]);
 return null;
}
