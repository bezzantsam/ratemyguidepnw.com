'use client';

import {useEffect,useId,useRef,useState} from 'react';
import speciesCatalog from '@/lib/guide-offerings/species.json';
import {canonicalFisheryLabel,normalizeGuideSearch} from '@/lib/directory-query';
import {fishingOptions} from '@/lib/captain-fishing/catalog.mjs';
import {FishingChoices} from './CaptainFishingChoices';
import styles from './captain-trips.module.css';

const booking = {
  call_to_confirm:'Contact me to confirm', per_seat:'Individual seats',
  private_boat:'Private boat', both:'Seats or private boat',
};
const duration = {unspecified:'Not specified',half_day:'Half day',full_day:'Full day',multi_day:'Multi-day'};
const vesselTypes = ['Sled / jet boat','Ocean charter boat','Drift boat','Raft','Surf-launched dory','Catamaran','Other / varies'];
const fishCare = ['Bleeding','Icing','Filleting','Bagging'];
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const places = {
  OR:{ports:['Astoria','Hammond','Garibaldi','Pacific City','Depoe Bay','Newport','Charleston','Bandon','Port Orford','Gold Beach','Brookings'],
    waters:['Buoy 10 / Columbia Estuary','Lower Columbia River','Willamette River','Multnomah Channel','Tillamook Bay','Nehalem Bay','Nestucca River','Lower Deschutes River','Pacific Ocean / Oregon Coast']},
  WA:{ports:['Ilwaco','Westport','La Push','Neah Bay','Port Angeles','Sekiu','Long Beach','Anacortes'],
    waters:['Buoy 10 / Columbia Estuary','Lower Columbia River','Cowlitz River','Kalama River','Lewis River','Drano Lake','Hanford Reach','Grays Harbor','Puget Sound','Strait of Juan de Fuca']},
};
const commonSpecies = new Set(['Chinook Salmon','Coho Salmon','Steelhead','Trout','Sturgeon','Lingcod','Rockfish','Albacore tuna','Halibut','Sablefish (black cod)','Walleye','Bass']);

export type Boat = {
  id:string; label:string; type:string; covered:boolean; heated:boolean; maxAnglers:number|null; fishCare:string[];
};
export type Trip = {
  id:string; title:string; jurisdiction:'OR'|'WA'; waterway:string; launchArea:string;
  species:string[]; months:number[]; methodIds:string[]; gearIds:string[]; vesselId:string|null;
  bookingStyle:keyof typeof booking; duration:keyof typeof duration;
};
export type TripPayload = {vessels:Boat[];offerings:Trip[]};

export function newTrip(id:string):Trip {
  return {id,title:'',jurisdiction:'OR',waterway:'',launchArea:'',species:[],months:[],
    methodIds:[],gearIds:[],vesselId:null,bookingStyle:'call_to_confirm',duration:'unspecified'};
}
export function newBoat(id:string):Boat {
  return {id,label:'',type:'Other / varies',covered:false,heated:false,maxAnglers:null,fishCare:[]};
}

function toggle<T>(values:T[], value:T, selected:boolean):T[] {
  return selected?[...values,value]:values.filter(item=>item!==value);
}

function Species({selected,onChange}:{selected:string[];onChange:(values:string[])=>void}){
  const [search,setSearch]=useState('');
  const [expanded,setExpanded]=useState(false);
  const query=normalizeGuideSearch(search);
  const canonical=query&&canonicalFisheryLabel(query);
  const choices=speciesCatalog.filter(value=>selected.includes(value)||
    (query?normalizeGuideSearch(value).includes(query)||value===canonical:expanded||commonSpecies.has(value)));
  return <fieldset>
    <legend>Target species</legend>
    <label>Find a species<input type="search" value={search} onChange={event=>setSearch(event.target.value)}/></label>
    <div className={styles.choices}>{choices.map(value=><label key={value}>
      <input type="checkbox" checked={selected.includes(value)} disabled={selected.length>=8&&!selected.includes(value)}
        onChange={event=>onChange(toggle(selected,value,event.target.checked))}/>{value}
    </label>)}</div>
    {!choices.length&&<p>No matching species.</p>}
    {!query&&<button type="button" onClick={()=>setExpanded(value=>!value)}>{expanded?'Show common species':'Show all species'}</button>}
  </fieldset>;
}

export function TripFields({trip,boats,onChange,onDone}:{trip:Trip;boats:Boat[];onChange:(patch:Partial<Trip>)=>void;onDone:()=>void}){
  const id=useId();
  const name=useRef<HTMLInputElement>(null);
  useEffect(()=>{name.current?.focus();},[]);
  const suggestions=places[trip.jurisdiction];
  return <fieldset className={styles.panel}>
    <legend>{trip.title.trim()?'Edit trip':'Add trip'}</legend>
    <label>Trip name<input ref={name} maxLength={80} value={trip.title} onChange={event=>onChange({title:event.target.value})}/></label>
    <div className={styles.fields}>
      <label>State<select value={trip.jurisdiction} onChange={event=>onChange({jurisdiction:event.target.value as Trip['jurisdiction']})}>
        <option value="OR">Oregon</option><option value="WA">Washington</option>
      </select></label>
      <label>Waterway<input maxLength={80} list={id+'-waters'} value={trip.waterway} onChange={event=>onChange({waterway:event.target.value})}/></label>
      <label>Launch town or port<input maxLength={80} list={id+'-ports'} value={trip.launchArea} onChange={event=>onChange({launchArea:event.target.value})}/></label>
      <datalist id={id+'-waters'}>{suggestions.waters.map(value=><option key={value} value={value}/>)}</datalist>
      <datalist id={id+'-ports'}>{suggestions.ports.map(value=><option key={value} value={value}/>)}</datalist>
    </div>
    <Species selected={trip.species} onChange={species=>onChange({species})}/>
    <details>
      <summary>Season, methods and gear</summary>
      <div>
        <fieldset><legend>Operating months (optional)</legend>
          <div className={styles.choices}>{months.map((month,index)=>{
            const selected=trip.months.includes(index+1);
            return <button key={month} type="button" aria-pressed={selected} className={selected?styles.selected:undefined}
              onClick={()=>onChange({months:toggle(trip.months,index+1,!selected).sort((a,b)=>a-b)})}>{month}</button>;
          })}</div>
        </fieldset>
        <FishingChoices kind="method" ids={trip.methodIds} disabled={false}
          onToggle={(value,checked)=>onChange({methodIds:toggle(trip.methodIds,value,checked)})}/>
        <FishingChoices kind="gear" ids={trip.gearIds} disabled={false}
          onToggle={(value,checked)=>onChange({gearIds:toggle(trip.gearIds,value,checked)})}/>
      </div>
    </details>
    <details>
      <summary>Boat, duration and booking</summary>
      <div className={styles.fields}>
        <label>Boat (optional)<select value={trip.vesselId??''} onChange={event=>onChange({vesselId:event.target.value||null})}>
          <option value="">No boat selected</option>{boats.map(boat=><option key={boat.id} value={boat.id}>{boat.label.trim()||'Unnamed boat'}</option>)}
        </select></label>
        <label>Duration<select value={trip.duration} onChange={event=>onChange({duration:event.target.value as Trip['duration']})}>
          {Object.entries(duration).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Booking style<select value={trip.bookingStyle} onChange={event=>onChange({bookingStyle:event.target.value as Trip['bookingStyle']})}>
          {Object.entries(booking).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
      </div>
    </details>
    <div className={styles.actions}><button type="button" onClick={onDone}>Done editing trip</button></div>
  </fieldset>;
}

export function BoatFields({boat,used,onChange,onRemove}:{boat:Boat;used:boolean;onChange:(patch:Partial<Boat>)=>void;onRemove:()=>void}){
  return <fieldset className={styles.panel}>
    <legend>{boat.label.trim()||'Unnamed boat'}</legend>
    <div className={styles.fields}>
      <label>Boat name<input maxLength={80} value={boat.label} onChange={event=>onChange({label:event.target.value})}/></label>
      <label>Boat style<select value={boat.type} onChange={event=>onChange({type:event.target.value})}>
        {vesselTypes.map(type=><option key={type}>{type}</option>)}
      </select></label>
      <label>Maximum anglers (optional)<input type="number" min="1" max="30" value={boat.maxAnglers??''}
        onChange={event=>onChange({maxAnglers:event.target.value===''?null:Number(event.target.value)})}/></label>
    </div>
    <div className={styles.choices}>
      <label><input type="checkbox" checked={boat.covered} onChange={event=>onChange({covered:event.target.checked})}/>Covered</label>
      <label><input type="checkbox" checked={boat.heated} onChange={event=>onChange({heated:event.target.checked})}/>Heated</label>
    </div>
    <fieldset><legend>Fish care (optional)</legend>
      <div className={styles.choices}>{fishCare.map(value=><label key={value}>
        <input type="checkbox" checked={boat.fishCare.includes(value)}
          onChange={event=>onChange({fishCare:toggle(boat.fishCare,value,event.target.checked)})}/>{value}
      </label>)}</div>
    </fieldset>
    {used?<p>Remove this boat from its trips before deleting it.</p>:<div className={styles.actions}>
      <button type="button" onClick={onRemove}>Remove boat</button>
    </div>}
  </fieldset>;
}

export function tripLocation(trip:Trip){
  return [trip.waterway.trim(),trip.launchArea.trim(),trip.jurisdiction==='OR'?'Oregon':'Washington'].filter(Boolean).join(' · ');
}

export function TripPreview({trip,boat}:{trip:Trip;boat?:Boat}){
  const choices=fishingOptions.filter(option=>(option.kind==='method'?trip.methodIds:trip.gearIds).includes(option.id));
  return <li className={styles.trip}>
    <div>
      <strong>{trip.title}</strong>
      <p>{tripLocation(trip)}</p>
      <p>{trip.species.join(', ')}</p>
      {trip.months.length>0&&<p>{trip.months.map(month=>months[month-1]).join(', ')}</p>}
      {choices.length>0&&<p>{choices.map(option=>option.label).join(' · ')}</p>}
      {boat&&<p>{[boat.label,boat.type,boat.maxAnglers&&`${boat.maxAnglers} anglers`,boat.covered&&'Covered',
        boat.heated&&'Heated',...boat.fishCare].filter(Boolean).join(' · ')}</p>}
      <p>{[trip.duration!=='unspecified'&&duration[trip.duration],booking[trip.bookingStyle]].filter(Boolean).join(' · ')}</p>
    </div>
  </li>;
}
