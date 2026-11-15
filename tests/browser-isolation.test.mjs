import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {withIsolatedWorkspace,openMockBackend,runIsolated,snapshotTree} from '../scripts/browser-isolation.mjs';

async function absent(path){try{await access(path);return false}catch(e){if(e.code==='ENOENT')return true;throw e}}

test('success and failure clean only owned workspaces and preserve original bytes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'isolation-test-'));try{
  const primary=join(root,'primary');await mkdir(join(primary,'.next'),{recursive:true});await mkdir(join(primary,'lib'));
  const source=join(primary,'lib/approved-guide-attributes.json'),build=join(primary,'.next/BUILD_ID');
  await writeFile(source,'original approved bytes');await writeFile(build,'ordinary build bytes');
  let work;
  await withIsolatedWorkspace(async dir=>{work=dir;await writeFile(join(dir,'fixture'),'synthetic');assert.notEqual(dir,primary)},{tempRoot:root});
  assert.ok(await absent(work));
  await assert.rejects(withIsolatedWorkspace(async dir=>{work=dir;await writeFile(join(dir,'fixture'),'synthetic');throw Error('expected failure')},{tempRoot:root}),/expected failure/);
  assert.ok(await absent(work));assert.equal(await readFile(source,'utf8'),'original approved bytes');assert.equal(await readFile(build,'utf8'),'ordinary build bytes');
 }finally{await rm(root,{recursive:true,force:true})}
});

test('concurrent invocations own separate workspaces, backend and app ports',async()=>{
 const workspaces=[],ports=[];let entered=0,release,browserEntered=0,releaseBrowser;
 const barrier=new Promise(resolve=>{release=resolve});
 const browserBarrier=new Promise(resolve=>{releaseBrowser=resolve});
 const hooks={
  snapshot:async(_repo,_tree,dir)=>{workspaces.push(dir);await writeFile(join(dir,'owner'),dir)},
  openBackend:async()=>{const server=await openMockBackend();ports.push(server.url);return server},
  launchApp:async()=>{const server=await openMockBackend();ports.push(server.url);return {url:server.url,stop:server.close}},
  command:async(_cmd,args,dir,env)=>{assert.equal(await readFile(join(dir,'owner'),'utf8'),dir);if(args.includes('build')){entered++;if(entered===2)release();await barrier}if(args.includes('--test')){assert.notEqual(env.TEST_BASE_URL,env.TEST_API_URL);browserEntered++;if(browserEntered===2)releaseBrowser();await browserBarrier}},
 };
 await Promise.all([0,1].map(()=>runIsolated({repo:'.',tree:'unused',mode:'ordinary',browser:'/fixture/browser',signal:new AbortController().signal,hooks})));
 assert.equal(new Set(workspaces).size,2);assert.equal(new Set(ports).size,4);
 for(const path of workspaces)assert.ok(await absent(path));
 for(const url of ports)await assert.rejects(fetch(url));
});

test('interrupting a run removes its workspace and preserves unrelated resources',async()=>{
 const root=await mkdtemp(join(tmpdir(),'interrupt-test-'));const other=join(root,'unrelated');await mkdir(other);await writeFile(join(other,'keep'),'safe');
 const primary=join(root,'primary');await mkdir(join(primary,'lib'),{recursive:true});await mkdir(join(primary,'.next'));
 await writeFile(join(primary,'lib/approved-guide-attributes.json'),'[]\n');await writeFile(join(primary,'.next/BUILD_ID'),'ordinary build');
 const moduleUrl=pathToFileURL(join(process.cwd(),'scripts/browser-isolation.mjs')).href;
 const code=`import {runIsolated,command} from ${JSON.stringify(moduleUrl)}; const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());await runIsolated({repo:'.',tree:'unused',mode:'ordinary',browser:'fixture',signal:controller.signal,hooks:{snapshot:async(_r,_t,dir)=>console.log('WORKSPACE='+dir),command:async(_c,_a,dir,env,signal)=>command(process.execPath,['-e',"console.log('CHILD='+process.pid);setInterval(()=>{},1000)"],dir,env,signal)}}).catch(()=>process.exitCode=2);`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TMPDIR:root},stdio:['ignore','pipe','pipe']});
 try{
  const ready=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',chunk=>{text+=chunk;const dir=text.match(/WORKSPACE=([^\n]+)/),pid=text.match(/CHILD=(\d+)/);if(dir&&pid)resolve({dir:dir[1],pid:Number(pid[1])})});child.once('error',reject);child.once('exit',()=>reject(Error('child exited before readiness')))});
  child.kill('SIGTERM');const code=await new Promise(resolve=>child.once('exit',resolve));assert.equal(code,2);
  assert.throws(()=>process.kill(ready.pid,0),{code:'ESRCH'});assert.ok(await absent(ready.dir));assert.equal(await readFile(join(other,'keep'),'utf8'),'safe');
  assert.equal(await readFile(join(primary,'lib/approved-guide-attributes.json'),'utf8'),'[]\n');assert.equal(await readFile(join(primary,'.next/BUILD_ID'),'utf8'),'ordinary build');
 }finally{child.kill('SIGKILL');await rm(root,{recursive:true,force:true})}
});

test('a failed isolated build closes its backend and leaves the primary source and build intact',async()=>{
 const root=await mkdtemp(join(tmpdir(),'failure-test-'));const primary=join(root,'primary');
 await mkdir(join(primary,'lib'),{recursive:true});await mkdir(join(primary,'.next'));
 const approved=join(primary,'lib/approved-guide-attributes.json'),build=join(primary,'.next/BUILD_ID');
 await writeFile(approved,'[]\n');await writeFile(build,'ordinary build');let workspace,backendUrl;
 try{
  const hooks={snapshot:async(_repo,_tree,dir)=>{workspace=dir;await writeFile(join(dir,'fixture'),'owned')},
   openBackend:async()=>{const s=await openMockBackend();backendUrl=s.url;return s},
   command:async(_cmd,args)=>{if(args.includes('build'))throw new Error('build failed deliberately')}};
  await assert.rejects(runIsolated({repo:primary,tree:'unused',mode:'ordinary',browser:'fixture',signal:new AbortController().signal,hooks}),/build failed deliberately/);
  assert.ok(await absent(workspace));await assert.rejects(fetch(backendUrl));
  assert.equal(await readFile(approved,'utf8'),'[]\n');assert.equal(await readFile(build,'utf8'),'ordinary build');
 }finally{await rm(root,{recursive:true,force:true})}
});


test('explicit Git tree snapshots exclude environment files, outputs and untracked work',async()=>{
 const root=await mkdtemp(join(tmpdir(),'snapshot-test-'));const repo=join(root,'repo'),out=join(root,'out');
 try{
  await mkdir(repo);await mkdir(out);execFileSync('git',['init','-q',repo]);
  await writeFile(join(repo,'source.txt'),'tracked source');await writeFile(join(repo,'.env.local'),'secret');await writeFile(join(repo,'.npmrc'),'token');await writeFile(join(repo,'private.key'),'key');
  await mkdir(join(repo,'.next'));await writeFile(join(repo,'.next','BUILD_ID'),'existing build');
  await mkdir(join(repo,'node_modules'));await writeFile(join(repo,'node_modules','private'),'dependency');
  execFileSync('git',['-C',repo,'add','-f','source.txt','.env.local','.npmrc','private.key','.next/BUILD_ID','node_modules/private']);
  const tree=execFileSync('git',['-C',repo,'write-tree'],{encoding:'utf8'}).trim();
  await writeFile(join(repo,'untracked-secret'),'not in snapshot');
  await snapshotTree(repo,tree,out);
  assert.equal(await readFile(join(out,'source.txt'),'utf8'),'tracked source');
  for(const path of ['.env.local','.npmrc','private.key','.next','node_modules','untracked-secret','.git'])assert.ok(await absent(join(out,path)),path);
  assert.throws(()=>snapshotTree(repo,'HEAD',out),/explicit Git tree/);
 }finally{await rm(root,{recursive:true,force:true})}
});
