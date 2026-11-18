import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {withIsolatedWorkspace,snapshotTree,openMockBackend,command,launchApp} from './browser-isolation.mjs';

/** Exercise an explicitly pinned build with only intercepted, synthetic accounts and records. */
export async function runLaunchJourney({repo,tree,browser,signal}){
 if(!browser)throw Error('BROWSER_EXECUTABLE is required');
 return withIsolatedWorkspace(async dir=>{
  let backend,app;
  try{
   await snapshotTree(repo,tree,dir);backend=await openMockBackend();
   const userConfig=join(dir,'.npm-user-config'),globalConfig=join(dir,'.npm-global-config');await writeFile(userConfig,'');await writeFile(globalConfig,'');
   const env={PATH:process.env.PATH||'',TMPDIR:dir,CI:'true',NEXT_TELEMETRY_DISABLED:'1',npm_config_cache:join(dir,'.npm-cache'),npm_config_userconfig:userConfig,npm_config_globalconfig:globalConfig,NEXT_PUBLIC_SUPABASE_URL:backend.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local-test-key',NEXT_PUBLIC_RMG_LAUNCH_ENABLED:'true',RMG_LAUNCH_ENABLED:'false',BROWSER_EXECUTABLE:browser,BROWSER_SCREENSHOT_DIR:process.env.BROWSER_SCREENSHOT_DIR||'',TEST_API_URL:backend.url};
   await command('npm',['ci','--no-audit','--no-fund'],dir,env,signal);
   await command('npm',['run','build'],dir,env,signal);
   app=await launchApp(dir,env,signal);env.TEST_BASE_URL=app.url;
   await command('node',['--test','tests/launch-journey-browser.test.mjs'],dir,env,signal);
   if(backend.requests()||backend.writes())throw Error(`Synthetic browser unexpectedly reached the mock backend server: ${JSON.stringify(backend.requestSummary())}`);
  }finally{try{if(app)await app.stop()}finally{if(backend)await backend.close()}}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const controller=new AbortController(),abort=()=>controller.abort();process.once('SIGINT',abort);process.once('SIGTERM',abort);
 try{await runLaunchJourney({repo:process.cwd(),tree:process.argv[2],browser:process.env.BROWSER_EXECUTABLE,signal:controller.signal});console.log('Synthetic launch browser journey passed')}
 catch(error){console.error(error);process.exitCode=1}finally{process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort)}
}
