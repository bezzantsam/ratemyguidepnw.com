import approved from './approved-guide-attributes.json';
import {approvedAttributes} from './guide-attributes';
import {oregonGuides} from './registry';
import {washingtonGuides} from './washington';

const known=new Set([...oregonGuides.map(g=>g.registration),...washingtonGuides.map(g=>g.id)]);
const safe=approvedAttributes(approved,known);
export function attributesFor(guideId:string){return safe.filter(a=>a.guide_id===guideId)}
