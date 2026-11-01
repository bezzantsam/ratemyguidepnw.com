import records from './oregon-guides.json';
export type RegistryGuide=(typeof records)[number];
export const oregonGuides:RegistryGuide[]=records;
export function guideSlug(g:RegistryGuide){return g.registration.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')}
export function findGuide(slug:string){return oregonGuides.find(g=>guideSlug(g)===slug)}
export function areaMatch(g:RegistryGuide,slug:string){const mapping:Record<string,string[]>={'columbia-river-buoy-10':['Lower Columbia River'],'lower-willamette-sandy-clackamas':['Mid-Willamette','Upper Willamette'],'north-oregon-coast':['North Coast','Mid-Coast']};return (mapping[slug]||[]).some(a=>g.areas.includes(a))}
