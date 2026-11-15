import {notFound} from 'next/navigation';
import ModeratorDiffPreview from '@/components/ModeratorDiffPreview';
import {reviewCaptainProposal} from '@/lib/moderation-review';
import type {CaptainFisheryDraft} from '@/lib/captain-fisheries';

export const metadata={title:'Moderation design preview | RateMyGuidePNW'};
export const dynamic='force-dynamic';

/**
 * Never show even fake moderation UI on production.
 * Real inbox will need server-authenticated admin role and audited DB actions.
 */
export default function InboxDesignPreview(){
 if(process.env.NODE_ENV!=='development')notFound();

 const before:CaptainFisheryDraft={
  vessels:[{id:'v1',label:'Example river sled',type:'Sled / jet boat',
    covered:true,heated:false,maxAnglers:5,fishCare:['Icing']}],
  offerings:[{id:'p1',title:'Example fall salmon',waterway:'Lower Columbia River',
    launchArea:'General marina area',species:['Chinook','Coho'],
    months:[8,9],vesselId:'v1',bookingStyle:'per_seat',duration:'full_day'}],
 };
 const proposed:CaptainFisheryDraft={
  vessels:[
   {...before.vessels[0],heated:true,maxAnglers:6},
   {id:'v2',label:'Example drift boat',type:'Drift boat',covered:false,
    heated:false,maxAnglers:3,fishCare:['Bleeding']},
  ],
  offerings:[
   {...before.offerings[0],months:[8,9,10]},
   {id:'p2',title:'Example winter steelhead',waterway:'North Coast River',
    launchArea:'General public launch',species:['Steelhead'],months:[1,2,3],
    vesselId:'v2',bookingStyle:'private_boat',duration:'full_day'},
  ],
 };
 const summary=reviewCaptainProposal(before,proposed,{ownership:'approved'});

 return <main className="moderation-preview-page">
   <p className="eyebrow">DEVELOPMENT ONLY · NOT AN ADMIN SERVICE</p>
   <h1>Moderation inbox design</h1>
   <p className="lead">See exactly what changed before approving a captain's seasonal fishing details. This page uses fabricated test data, never real claims or credentials.</p>
   <ModeratorDiffPreview summary={summary} profileLabel="Example Guide (fictional)"
     submittedLabel="Synthetic local preview"/>
 </main>;
}
