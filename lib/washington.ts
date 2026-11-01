import raw from './washington-raw.json';
import {reconciledWashingtonCaptains} from './washington-reconciled';
export type WashingtonGuide={id:string;name:string;business:string|null;source:string;notes:string|null};
const crossStateNames=new Set(['tony fisher','shane magnuson','casey weigel','marc bush','nicholas ney','daniel benowitz','jeffrey keightley sr.']);
export const washingtonGuides:WashingtonGuide[]=raw.filter(x=>!crossStateNames.has(x.name.toLowerCase())).map((x,i)=>({...x,id:'wa-'+String(i).padStart(3,'0')}));
export const oregonWashingtonMatches=reconciledWashingtonCaptains.filter(x=>!!x.oregonRegistration);
export function washingtonGuide(id:string){return washingtonGuides.find(g=>g.id===id)}
