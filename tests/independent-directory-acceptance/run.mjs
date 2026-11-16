/** Review an explicit git tree in a disposable workspace with a run-owned dummy backend. */
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {withIsolatedWorkspace,snapshotTree,openMockBackend,launchApp,command} from '../../scripts/browser-isolation.mjs';
const [tree]=process.argv.slice(2);const browser=process.env.BROWSER_EXECUTABLE;
if(!/^[a-f0-9]{40,64}$/.test(tree||'')||!browser)throw new Error('Usage: BROWSER_EXECUTABLE=/path/to/chrome node tests/independent-directory-acceptance/run.mjs <git-tree-id>');
const abort=new AbortController();process.once('SIGINT',()=>abort.abort());process.once('SIGTERM',()=>abort.abort());
await withIsolatedWorkspace(async dir=>{
 let backend,app;
 try{
  await snapshotTree(process.cwd(),tree,dir);backend=await openMockBackend();
  const user=join(dir,'.npm-user'),global=join(dir,'.npm-global');await writeFile(user,'');await writeFile(global,'');
  const env={PATH:process.env.PATH||'',HOME:dir,TMPDIR:dir,CI:'true',NEXT_TELEMETRY_DISABLED:'1',npm_config_cache:join(dir,'.npm-cache'),npm_config_userconfig:user,npm_config_globalconfig:global,NEXT_PUBLIC_SUPABASE_URL:backend.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-public-key',SUPABASE_SERVICE_ROLE_KEY:'release-private-marker-7e813f65',RC_SECRET_CANARY:'release-private-marker-7e813f65',BROWSER_EXECUTABLE:browser,TEST_API_URL:backend.url,REVIEW_SCREENSHOT_DIR:process.env.REVIEW_SCREENSHOT_DIR||'',BROWSER_SCREENSHOT_DIR:process.env.REVIEW_SCREENSHOT_DIR||''};
  for(const args of [['install','--no-audit','--no-fund'],['run','test:intel'],['run','test:mvp'],['run','typecheck'],['run','build']])await command('npm',args,dir,env,abort.signal);
  app=await launchApp(dir,env,abort.signal);env.TEST_BASE_URL=app.url;
  for(const test of ['tests/production-browser.test.mjs','tests/independent-directory-acceptance/browser.test.mjs'])await command('node',['--test',test],dir,env,abort.signal);
  if(backend.requests()!==0||backend.writes()!==0)throw new Error('Unexpected request to dummy backend');
  console.log('PASS explicit-tree production review; dummy backend requests:',backend.requests());
 }finally{try{if(app)await app.stop()}finally{if(backend)await backend.close()}}
});
