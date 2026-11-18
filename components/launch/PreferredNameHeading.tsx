'use client';
import type {GuideSource} from '@/lib/launch-client';
import {usePreferredName} from './usePreferredName';

export function PreferredNameHeading({source,listed,enabled}:{source:GuideSource;listed:string;enabled:boolean}){
 const {displayName,value}=usePreferredName(source,listed,enabled&&process.env.NEXT_PUBLIC_RMG_PREFERRED_NAMES_ENABLED==='true');
 return <><h1>{displayName}</h1>{displayName!==listed&&<p className="muted">Listed as {listed}</p>}{value&&<p className="muted">{value.provenance==='captain'?'Captain-declared name':'Editorially corrected name'}: {value.name}</p>}</>;
}
