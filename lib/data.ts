// Fictional fixtures for the pre-launch demo ONLY.
export type Guide={slug:string;name:string;outfit:string;waterway:string;waterwaySlug:string;quality:number;rebook:number;reviewCount:number;species:string[];tags:string[]};
export type Review={id:string;guideSlug:string;guideName:string;waterway:string;score:number;wouldBookAgain:boolean;body:string};
export const waterways=[{slug:"columbia-river-buoy-10",name:"Columbia River & Buoy 10",region:"Astoria · Hammond · Ilwaco · Portland",description:"Chinook, coho and sturgeon fishing from Portland to the mouth of the Columbia."},{slug:"lower-willamette-sandy-clackamas",name:"Willamette, Sandy & Clackamas",region:"Portland metro · Oregon City",description:"Spring Chinook and winter steelhead waters near Portland."},{slug:"north-oregon-coast",name:"North Oregon Coast",region:"Tillamook · Nehalem · Nestucca · Wilson",description:"Coastal salmon and steelhead, bay fisheries and offshore charters."}];
export const guides:Guide[]=[
{slug:"demo-river",name:"Captain River (demo)",outfit:"Lower Columbia Outfitters (demo)",waterway:"Columbia River & Buoy 10",waterwaySlug:"columbia-river-buoy-10",quality:4.7,rebook:92,reviewCount:12,species:["Chinook","Coho"],tags:["Patient teacher","Fishes hard"]},
{slug:"demo-coast",name:"Captain Coast (demo)",outfit:"North Coast Charters (demo)",waterway:"North Oregon Coast",waterwaySlug:"north-oregon-coast",quality:4.2,rebook:83,reviewCount:8,species:["Steelhead","Chinook"],tags:["Clean boat","Knows the water"]},
{slug:"demo-spring",name:"Captain Spring (demo)",outfit:"Metro Springers (demo)",waterway:"Willamette, Sandy & Clackamas",waterwaySlug:"lower-willamette-sandy-clackamas",quality:4.9,rebook:100,reviewCount:6,species:["Spring Chinook","Steelhead"],tags:["Great with kids","Patient teacher"]}
];
export const reviews:Review[]=[
{id:"demo1",guideSlug:"demo-river",guideName:"Captain River (demo)",waterway:"Columbia River & Buoy 10",score:5,wouldBookAgain:true,body:"Patient coaching and a great effort even when the bite slowed down. Fictional example only."},
{id:"demo2",guideSlug:"demo-coast",guideName:"Captain Coast (demo)",waterway:"North Oregon Coast",score:3,wouldBookAgain:false,body:"Knew the water but the trip felt rushed. Fictional example only."},
{id:"demo3",guideSlug:"demo-spring",guideName:"Captain Spring (demo)",waterway:"Willamette, Sandy & Clackamas",score:5,wouldBookAgain:true,body:"We got skunked, but the guide worked hard and treated new anglers with patience. Fictional example only."}
];