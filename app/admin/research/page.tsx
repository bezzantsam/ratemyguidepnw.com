import {notFound} from 'next/navigation';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import ResearchWorkbench from '@/components/ResearchWorkbench';
import type {ResearchQueue} from '@/lib/research-workbench';

export const dynamic='force-dynamic';
export const metadata={title:'Guide research workbench | RateMyGuidePNW',robots:{index:false,follow:false}};

export default async function ResearchPage(){
 // Development-only until server-authenticated admin access is implemented/tested.
 // Do not statically import the real research queue into a client bundle.
 if(process.env.NODE_ENV!=='development')notFound();
 const queue:ResearchQueue=JSON.parse(await readFile(path.join(process.cwd(),'docs/research/requested-launch-review.json'),'utf8'));
 return <ResearchWorkbench queue={queue}/>;
}
