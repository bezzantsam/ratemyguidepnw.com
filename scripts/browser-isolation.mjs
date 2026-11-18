import {mkdtemp,rm,writeFile,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';

/** Only delete the unique directory this invocation created. */
export async function withIsolatedWorkspace(work,{tempRoot=tmpdir()}={}){
 const dir=await mkdtemp(join(tempRoot,'ratemyguide-browser-'));
 try{return await work(dir)}finally{await rm(dir,{recursive:true,force:true})}
}
export async function openMockBackend(){
 let writes=0,requests=0;const requestSummary=[];
 const server=createServer((req,res)=>{requests++;if(requestSummary.length<20)requestSummary.push({method:req.method,path:(req.url||'').split('?')[0]});if(req.method!=='GET'){writes++;res.writeHead(403);res.end('writes forbidden');return}res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"backend unavailable"}')});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return {url:`http://127.0.0.1:${server.address().port}`,writes:()=>writes,requests:()=>requests,requestSummary:()=>requestSummary,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
function terminate(child){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 try{if(process.platform==='win32')child.kill('SIGTERM');else process.kill(-child.pid,'SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}
 const timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null){try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL')}catch(e){if(e.code!=='ESRCH')console.error(e)}}},2000);timer.unref();
}
function spawnOwned(command,args,options,signal){
 if(signal.aborted)throw new Error('Run interrupted');
 const child=spawn(command,args,{...options,detached:process.platform!=='win32'});
 const abort=()=>terminate(child);signal.addEventListener('abort',abort,{once:true});
 const done=new Promise((resolve,reject)=>{
  child.once('error',reject);
  child.once('exit',(code,sig)=>{signal.removeEventListener('abort',abort);if(code===0&&!signal.aborted)resolve();else reject(new Error(`${command} failed (${sig||code})`))});
 });
 return {child,done};
}
export async function command(cmd,args,dir,env,signal){
 const {done}=spawnOwned(cmd,args,{cwd:dir,env,stdio:'inherit'},signal);await done;
}
export function snapshotTree(repo,tree,dir){
 if(!/^[a-f0-9]{40,64}$/.test(tree)||execFileSync('git',['cat-file','-t',tree],{cwd:repo,encoding:'utf8'}).trim()!=='tree')throw new Error('Provide an explicit Git tree object ID');
 const entries=execFileSync('git',['ls-tree','-rz','--full-tree',tree],{cwd:repo,encoding:'utf8'}).split('\0').filter(Boolean);
 const paths=[];
 for(const entry of entries){
  const [meta,path]=entry.split('\t');
  if(meta.startsWith('120000 ')||meta.startsWith('160000 '))throw new Error(`Snapshot contains unsupported symlink or submodule: ${path}`);
  if(!path||path.split('/').some(part=>part.toLowerCase().startsWith('.env')||['.git','.next','node_modules','.vercel','.npmrc','.pypirc','.aws','.ssh','.codex','.agents'].includes(part.toLowerCase())||/^(credentials|secrets)(\.|$)/i.test(part)||/\.(pem|key|p12|pfx)$/i.test(part)))continue;
  paths.push(path);
 }
 if(!paths.length)throw new Error('Snapshot contains no eligible source files');
 const archive=join(dir,'snapshot.tar');
 execFileSync('git',['archive',`--output=${archive}`,tree,'--',...paths],{cwd:repo,stdio:'inherit'});
 execFileSync('tar',['-xf',archive,'-C',dir],{stdio:'inherit'});
 return rm(archive);
}
export async function launchApp(dir,env,signal){
 const {child,done}=spawnOwned(process.execPath,['scripts/isolated-test-server.mjs'],{cwd:dir,env,stdio:['ignore','pipe','inherit']},signal);
 // Attach a handler immediately so a failed server never becomes an unhandled rejection.
 const ended=done.then(()=>{throw new Error('Server exited before cleanup')},e=>{throw e});
 const ready=new Promise((resolve,reject)=>{
  let output='';const timer=setTimeout(()=>reject(new Error('Server startup timed out')),60000);
  child.stdout.on('data',chunk=>{const text=chunk.toString();process.stdout.write(text);output+=text;const match=output.match(/ISOLATED_PORT=(\d+)/);if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}`)}});
  child.once('error',e=>{clearTimeout(timer);reject(e)});
  child.once('exit',()=>clearTimeout(timer));
 });
 try{return {url:await Promise.race([ready,ended]),stop:async()=>{terminate(child);await done.catch(()=>{})}}}
 catch(e){terminate(child);await done.catch(()=>{});throw e}
}
/** The hooks exist to exercise failure, concurrency, and interruption without a build. */
export async function runIsolated({repo,tree,mode,browser,signal,hooks={}}){
 if(!['ordinary','synthetic'].includes(mode))throw new Error('Mode must be ordinary or synthetic');
 if(!browser)throw new Error('BROWSER_EXECUTABLE is required');
 return withIsolatedWorkspace(async dir=>{
  let backend,app;
  try{
   await (hooks.snapshot??snapshotTree)(repo,tree,dir);
   if(mode==='synthetic')await copyFile(join(dir,'tests/fixtures/discovery-attributes.json'),join(dir,'lib/approved-guide-attributes.json'));
   backend=await (hooks.openBackend??openMockBackend)();
   const userConfig=join(dir,'.npm-user-config'),globalConfig=join(dir,'.npm-global-config');
   await writeFile(userConfig,'');await writeFile(globalConfig,'');
   const env={PATH:process.env.PATH||'',TMPDIR:dir,CI:'true',NEXT_TELEMETRY_DISABLED:'1',npm_config_cache:join(dir,'.npm-cache'),npm_config_userconfig:userConfig,npm_config_globalconfig:globalConfig,NEXT_PUBLIC_SUPABASE_URL:backend.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local-test-key',RC_SECRET_CANARY:'rc-secret-canary-27f7bf9015',BROWSER_SCREENSHOT_DIR:process.env.BROWSER_SCREENSHOT_DIR||'',BROWSER_EXECUTABLE:browser,TEST_API_URL:backend.url};
   await (hooks.command??command)('npm',['ci','--no-audit','--no-fund'],dir,env,signal);
   await (hooks.command??command)('npm',['run','build'],dir,env,signal);
   app=await (hooks.launchApp??launchApp)(dir,env,signal);
   env.TEST_BASE_URL=app.url;
   if(mode==='ordinary')await (hooks.command??command)('node',['scripts/read-only-launch-smoke.mjs','--base-url',app.url],dir,env,signal);
   await (hooks.command??command)('node',['--test',mode==='synthetic'?'tests/mvp-browser.test.mjs':'tests/production-browser.test.mjs'],dir,env,signal);
   if(backend.writes())throw new Error('Mock backend received a write');
   if(backend.requests())throw new Error('Read-only directory unexpectedly contacted the unavailable backend');
  }finally{
   try{if(app)await app.stop()}finally{if(backend)await backend.close()}
  }
 });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode,tree]=process.argv.slice(2);const controller=new AbortController();
 const abort=()=>controller.abort();process.once('SIGINT',abort);process.once('SIGTERM',abort);
 try{await runIsolated({repo:process.cwd(),tree,mode,browser:process.env.BROWSER_EXECUTABLE,signal:controller.signal});console.log(`${mode} isolated browser run passed for ${tree}`)}
 catch(error){console.error(error);process.exitCode=1}
 finally{process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort)}
}
