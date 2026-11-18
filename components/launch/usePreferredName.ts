'use client';
import {useEffect,useMemo,useState} from 'react';
import {createLaunchClient,type GuideSource,type PreferredName} from '@/lib/launch-client';
import {preferredDisplayName} from '@/lib/preferred-name';

/** Unavailable or unmapped data falls back to the unchanged source name. */
export function usePreferredName(source:GuideSource,listed:string,enabled=true){
 const api=useMemo(()=>createLaunchClient({enabled,getAccessToken:async()=>null}),[enabled]);
 const key=`${source.jurisdiction}:${source.sourceId}`;
 const [state,setState]=useState<{key:string;value:PreferredName|null;available:boolean}>({key,value:null,available:false});
 useEffect(()=>{
  let active=true,generation=0;
  setState({key,value:null,available:false});
  if(!enabled)return;
  async function load(){const current=++generation;try{const names=await api.profileNames(source.jurisdiction,[source.sourceId]);if(active&&current===generation)setState({key,value:names[0]??null,available:true})}catch{if(active&&current===generation)setState({key,value:null,available:false})}}
  function changed(event:Event){const detail=(event as CustomEvent<GuideSource>).detail;if(detail?.jurisdiction===source.jurisdiction&&detail.sourceId===source.sourceId)void load()}
  void load();window.addEventListener('rmg-preferred-name-changed',changed);
  return()=>{active=false;generation++;window.removeEventListener('rmg-preferred-name-changed',changed)};
 },[api,enabled,key,source.jurisdiction,source.sourceId]);
 const value=enabled&&state.key===key?state.value:null;
 return {value,available:enabled&&state.key===key&&state.available,displayName:preferredDisplayName(listed,value?.name)};
}
