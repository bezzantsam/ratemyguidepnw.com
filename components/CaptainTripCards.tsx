'use client';

import {useEffect,useState} from 'react';
import {fishingOptions} from '@/lib/captain-fishing/catalog.mjs';
import {captainTripKey,captainTripMonths,fetchCaptainTripsForProfile,type CaptainTripSource} from '@/lib/public-captain-trips';

const durations={unspecified:'',half_day:'Half day',full_day:'Full day',multi_day:'Multi-day'};
const bookingStyles={call_to_confirm:'Confirm with captain',per_seat:'Per seat',private_boat:'Private boat',both:'Per seat or private boat'};
const labels=new Map(fishingOptions.map(option=>[option.id,option.label]));

export default function CaptainTripCards({jurisdiction,sourceId}:CaptainTripSource) {
  const key=captainTripKey({jurisdiction,sourceId});
  const [attempt,setAttempt]=useState(0);
  const [state,setState]=useState<{
    key:string;profile:Awaited<ReturnType<typeof fetchCaptainTripsForProfile>>;
  }|{key:string;error:true}|null>(null);

  useEffect(()=>{
    const controller=new AbortController();
    void fetchCaptainTripsForProfile({jurisdiction,sourceId},controller.signal).then(profile=>{
      if(!controller.signal.aborted)setState({key,profile});
    }).catch(()=>{ if(!controller.signal.aborted)setState({key,error:true}); });
    return ()=>controller.abort();
  },[jurisdiction,sourceId,key,attempt]);

  if(state?.key===key && 'error' in state)return <section className="section launch-controls" aria-label="Guide trips">
    <p role="status">We couldn’t load this guide’s trips.</p>
    <button type="button" onClick={()=>{setState(null);setAttempt(value=>value+1);}}>Retry loading trips</button>
  </section>;
  const profile=state?.key===key && 'profile' in state?state.profile:null;
  if(!profile?.offerings.length)return null;
  return <section className="section" aria-labelledby="captain-trips-heading">
    <h2 id="captain-trips-heading">Captain-provided trips</h2>
    <ul className="captain-trip-list">
      {profile.offerings.map(trip=>{
        const vessel=profile.vessels.find(boat=>boat.id===trip.vesselId);
        const season=[...trip.months].sort((a,b)=>a-b).map(month=>captainTripMonths[month-1]);
        const methods=trip.methodIds.map(id=>labels.get(id));
        const gear=trip.gearIds.map(id=>labels.get(id));
        const booking=[durations[trip.duration],bookingStyles[trip.bookingStyle]].filter(Boolean).join(' · ');
        const location=trip.waterway===trip.launchArea?[trip.waterway]:[trip.waterway,trip.launchArea];
        return <li className="card captain-trip-card" key={trip.id}>
          <h3>{trip.title}</h3>
          <p>{location.join(' · ')} · {trip.jurisdiction==='OR'?'Oregon':'Washington'}</p>
          {trip.species.length>0&&<p><strong>Targets:</strong> {trip.species.join(', ')}</p>}
          {season.length>0&&<p><strong>Months:</strong> {season.join(', ')}</p>}
          {methods.length>0&&<p><strong>Methods:</strong> {methods.join(', ')}</p>}
          {gear.length>0&&<p><strong>Gear:</strong> {gear.join(', ')}</p>}
          {vessel&&<p><strong>Boat:</strong> {[
            vessel.label,vessel.maxAnglers&&`Up to ${vessel.maxAnglers} anglers`,vessel.covered&&'Covered',vessel.heated&&'Heated',
          ].filter(Boolean).join(' · ')}</p>}
          <p>{booking}</p>
        </li>;
      })}
    </ul>
  </section>;
}
