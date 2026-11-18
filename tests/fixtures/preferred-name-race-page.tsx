'use client';
import {useState} from 'react';
import {PreferredNameHeading} from '@/components/launch/PreferredNameHeading';

/** Copied only into a disposable browser-test snapshot; never a production route. */
export default function PreferredNameRaceFixture(){
 const [guide,setGuide]=useState<'A'|'B'>('A');
 return <main><button onClick={()=>setGuide('B')}>Guide B</button><PreferredNameHeading enabled listed={guide==='A'?'Alice Example':'Bob Example'} source={{jurisdiction:'OR',sourceId:guide==='A'?'OG.0000001':'OG.0000002'}}/></main>;
}
