import records from './oregon-guides.json';
export type RegistryGuide=(typeof records)[number] & {preferredName?:string};

const preferredNames:Record<string,{registryName:string;preferredName:string}> = {
 'OG.0004049': {registryName:'Edwin Snyder', preferredName:'EJ Snyder'},
 'OG.0002193': {registryName:'Roderick Shulley', preferredName:'Rod Shulley'},
};

export const oregonGuides:RegistryGuide[]=records.map(guide=>{
 const preference=preferredNames[guide.registration];
 return preference?.registryName===guide.name ? {...guide,preferredName:preference.preferredName} : guide;
});
export function guideSlug(g:RegistryGuide){return g.registration.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')}
export function findGuide(slug:string){return oregonGuides.find(g=>guideSlug(g)===slug)}
export function areaMatch(g:RegistryGuide,slug:string){const mapping:Record<string,string[]>={'columbia-river-buoy-10':['Lower Columbia River'],'lower-willamette-sandy-clackamas':['Mid-Willamette','Upper Willamette'],'north-oregon-coast':['North Coast','Mid-Coast']};return (mapping[slug]||[]).some(a=>g.areas.includes(a))}
