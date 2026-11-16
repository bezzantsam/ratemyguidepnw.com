import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {snapshotTree,openMockBackend,launchApp,command} from './browser-isolation.mjs';

function replaceOnce(text,oldValue,newValue){if(!text.includes(oldValue)||text.indexOf(oldValue)!==text.lastIndexOf(oldValue))throw Error('Preview adapter no longer matches product source');return text.replace(oldValue,newValue)}
export async function preparePreview(dir,ordinaryUrl){
 const attrs=join(dir,'lib/guide-attributes-server.ts');let a=await readFile(attrs,'utf8');
 a="import previewData from './__editorial_visual__.json';\nimport type {EvidenceAttribute} from './guide-attributes';\n"+a;
 a=replaceOnce(a,"return safe.filter(a=>a.guide_id===guideId)","return [...safe.filter(a=>a.guide_id===guideId),...(previewData.attributes as unknown as EvidenceAttribute[]).filter(a=>a.guide_id===guideId)]");await writeFile(attrs,a);
 const enrichment=join(dir,'lib/guide-enrichment.ts');let e=await readFile(enrichment,'utf8');e="import previewData from './__editorial_visual__.json';\n"+e;
 const old=`  return Object.prototype.hasOwnProperty.call(source, registration)\n    ? source[registration]\n    : null;`;
 const next=`  const base = Object.prototype.hasOwnProperty.call(source, registration) ? source[registration] : null;\n  const additions = (previewData.waters as unknown as Record<string, AdvertisedWaterway[]>)[registration] ?? [];\n  return additions.length ? {...(base ?? {searchAliases: [], advertisedWaters: []}), advertisedWaters: [...(base?.advertisedWaters ?? []), ...additions]} : base;`;
 e=replaceOnce(e,old,next);await writeFile(enrichment,e);
 const layout=join(dir,'app/layout.tsx');let l=await readFile(layout,'utf8');
 l=replaceOnce(l,'        <div className="notice">',`        <div style={{background:'#fff0b9',color:'#513800',padding:'14px',fontWeight:700}}>Unapproved editorial preview · Source descriptions are not personal expertise, verified licensing, or current availability. <a href={${JSON.stringify(ordinaryUrl+'/guides')}}>View ordinary directory</a> · <a href="/editorial-changes">View changes</a></div>\n        <div className="notice">`);await writeFile(layout,l);
 const page=`import data from '@/lib/__editorial_visual__.json';\nimport Link from 'next/link';\nexport default function Page(){const rows=data.changes as Array<Record<string,unknown>>;return <main><p className="eyebrow">Unapproved editorial preview</p><h1>Proposed changes</h1><p>These are unapplied source-backed proposals. No personal expertise, identity, license or availability is established.</p><p>Mode: {data.mode} · {data.counts.guides} guides · {data.counts.attributes} attributes · {data.counts.waters} water citations · 0 removals. Reject and hold decisions do not remove existing facts.</p><Link href="/guides">Search preview directory</Link><ul>{rows.map((x,i)=><li key={i}><strong>{String(x.guide_id)}</strong> · Before: {x.before===undefined||x.before===null?'no addition':JSON.stringify(x.before)} · After: {JSON.stringify(x.after??x)}</li>)}</ul></main>}\n`;
 await mkdir(join(dir,'app/editorial-changes'),{recursive:true});await writeFile(join(dir,'app/editorial-changes/page.tsx'),page);
}
function opener(url){const cmd=process.platform==='darwin'?'open':'xdg-open';const child=spawn(cmd,[url],{stdio:'ignore'});child.on('error',()=>{});child.unref()}
export async function runVisual({repo,tree,decisions,test=false,screenshots,signal}){
 const root=await mkdtemp(join(tmpdir(),'ratemyguide-visual-'));let backend,ordinary,preview;
 try{
  const normalDir=join(root,'ordinary'),previewDir=join(root,'preview');await mkdir(normalDir);await mkdir(previewDir);
  await snapshotTree(repo,tree,normalDir);await snapshotTree(repo,tree,previewDir);
  const overlay=join(root,'overlay.json');const args=[join(repo,'scripts/editorial_visual_data.py'),'--output',overlay];if(decisions)args.push('--decisions',resolve(decisions));
  await command('python3',args,repo,{PATH:process.env.PATH||'',PYTHONDONTWRITEBYTECODE:'1'},signal);
  backend=await openMockBackend();const userConfig=join(root,'.npm-user-config'),globalConfig=join(root,'.npm-global-config');await writeFile(userConfig,'');await writeFile(globalConfig,'');
  const env={PATH:process.env.PATH||'',TMPDIR:root,CI:'true',NEXT_TELEMETRY_DISABLED:'1',npm_config_cache:join(root,'.npm-cache'),npm_config_userconfig:userConfig,npm_config_globalconfig:globalConfig,NEXT_PUBLIC_SUPABASE_URL:backend.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local-test-key',TEST_API_URL:backend.url};
  await command('npm',['install','--no-audit','--no-fund'],normalDir,env,signal);await command('npm',['run','build'],normalDir,env,signal);ordinary=await launchApp(normalDir,env,signal);
  await writeFile(join(previewDir,'lib/__editorial_visual__.json'),await readFile(overlay));await preparePreview(previewDir,ordinary.url);
  await command('npm',['install','--no-audit','--no-fund'],previewDir,env,signal);await command('npm',['run','build'],previewDir,env,signal);preview=await launchApp(previewDir,env,signal);
  console.log(`Ordinary directory: ${ordinary.url}/guides\nUnapproved editorial preview: ${preview.url}/guides\nChanges: ${preview.url}/editorial-changes`);
  if(test){const approvedHash=createHash('sha256').update(await readFile(join(normalDir,'lib/approved-guide-attributes.json'))).digest('hex');await command('node',['--test','tests/editorial-visual-browser.test.mjs'],previewDir,{...env,TEST_BASE_URL:preview.url,TEST_ORDINARY_URL:ordinary.url,TEST_APPROVED_SHA256:approvedHash,BROWSER_EXECUTABLE:process.env.BROWSER_EXECUTABLE||'',EDITORIAL_SCREENSHOTS:resolve(screenshots)},signal);if(backend.writes())throw Error('Mock backend received a write')}
  else {opener(ordinary.url+'/guides');opener(preview.url+'/guides');console.log('Press Ctrl+C to stop these owned preview servers.');await new Promise(resolve=>signal.aborted?resolve():signal.addEventListener('abort',resolve,{once:true}))}
 }finally{try{if(preview)await preview.stop()}finally{try{if(ordinary)await ordinary.stop()}finally{try{if(backend)await backend.close()}finally{await rm(root,{recursive:true,force:true})}}}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const argv=process.argv.slice(2);let decisions,screenshots=join(process.cwd(),'outputs/editorial-preview/screenshots'),test=false;
 for(let i=0;i<argv.length;i++){if(argv[i]==='--test')test=true;else if(argv[i]==='--decisions')decisions=argv[++i];else if(argv[i]==='--screenshots')screenshots=argv[++i];else throw Error('Unknown argument '+argv[i])}
 const repo=process.cwd();const tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:repo,encoding:'utf8'}).trim();
 if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:repo,encoding:'utf8'}).trim())throw Error('Commit or stash work before creating an exact preview snapshot');
 const controller=new AbortController();for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>controller.abort());
 try{await runVisual({repo,tree,decisions,test,screenshots,signal:controller.signal})}catch(e){console.error(e);process.exitCode=1}
}
