/* Independent 05 browser -> actual Next -> disposable local Auth/PostgREST. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
let stage='safety';let app,browser;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function safeUrl(raw,scheme='http:'){const u=new URL(raw);assert.equal(u.protocol,scheme);assert.equal(u.hostname,'127.0.0.1');assert.ok(u.port);assert.equal(u.username,'');assert.equal(u.password,'');return u}
function fail(label){throw Error(label)}
async function main(){
 const project=process.env.RMG_LOCAL_PROJECT,runid=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT;
 assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');assert.match(runid,/^\d+$/);assert.match(attempt,/^\d+$/);assert.equal(project,'rmgqa'+runid+attempt);
 const temp=fs.realpathSync(process.env.RUNNER_TEMP),statusFile=fs.realpathSync(process.env.RMG_LOCAL_STATUS_FILE);
 assert.ok(statusFile.startsWith(temp+path.sep));assert.equal(fs.statSync(statusFile).mode&0o077,0);
 const status=JSON.parse(fs.readFileSync(statusFile,'utf8')),api=safeUrl(status.API_URL),mail=safeUrl(status.MAILPIT_URL);assert.notEqual(api.port,mail.port);
 const db=new URL(status.DB_URL);assert.ok(['postgres:','postgresql:'].includes(db.protocol));assert.equal(db.hostname,'127.0.0.1');assert.ok(db.port);
 const anon=status.ANON_KEY||status.PUBLISHABLE_KEY;assert.ok(typeof anon==='string'&&anon.length>0);
 const root=fs.realpathSync(process.env.GITHUB_WORKSPACE),web='http://127.0.0.1:3000',localRequire=createRequire(path.join(root,'package.json'));
 const expected={app:'814c2c7ee1b17766468efc6eb021947e9e9e4dcc',components:'443bdeda7e88a80d1b22da7bbe59da304f459d27',data:'6f190ca914bc456134ecd0820c1cc456fd565e0f',lib:'1a298f6c03f0e167aa662c504568a8e9a6c500bc',public:'743aa53fd9e79bdb210e6568075b8e82044d793f','next-env.d.ts':'6080addc2d9595896fa4440b16cf51a41bfcfef8','next.config.ts':'0df1bc0ec36b8fb15331f0c0d8d37a6b50245d87','package.json':'081ebd23f16534246a484aba12b5b801e4502f1b','package-lock.json':'9dd8ebb5ecf1b505d8dc95c8320a0def9f3e6dac','tsconfig.json':'2304b92ee9bee5785628aea900b01d1466a424bc'};
 for(const [name,hash] of Object.entries(expected)){assert.equal(cp.execFileSync('git',['rev-parse','HEAD:'+name],{cwd:root,encoding:'utf8'}).trim(),hash);cp.execFileSync('git',['diff','--quiet','HEAD','--',name],{cwd:root});}
 const {chromium}=localRequire('playwright-core');const fake=crypto.randomBytes(6).toString('hex');
 function sql(q){const r=cp.spawnSync('docker',['exec','-i','supabase_db_'+project,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input:q,encoding:'utf8',timeout:20000});if(r.status!==0)fail('synthetic database setup');return r.stdout.trim()}
 stage='synthetic fixture';assert.equal(sql("SELECT count(*) FROM public.guides;"),'2');assert.equal(sql("SELECT count(*) FROM public.reviews;"),'0');
 sql("UPDATE rmg_private.guide_identity_map SET source_id='OG.0002254' WHERE jurisdiction='OR' AND source_id='fixture-one' AND guide_id='10000000-0000-0000-0000-000000000001'; UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;");
 assert.equal(sql("SELECT count(*) FROM rmg_private.guide_identity_map WHERE jurisdiction='OR' AND source_id='OG.0002254' AND guide_id='10000000-0000-0000-0000-000000000001';"),'1');
 const appEnv={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:temp,CI:'true',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:api.origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:anon,NEXT_PUBLIC_RMG_LAUNCH_ENABLED:'true',RMG_LAUNCH_ENABLED:'true'};
 stage='exact source build';let built=cp.spawnSync('npm',['run','build'],{cwd:root,env:appEnv,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});assert.equal(built.status,0);
 stage='local Next server';app=cp.spawn('node',['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3000'],{cwd:root,env:appEnv,stdio:'ignore'});
 let ready=false;for(let i=0;i<80;i++){if(app.exitCode!==null)break;try{let r=await fetch(web,{signal:AbortSignal.timeout(1500),redirect:'manual'});if(r.status===200){ready=true;break}}catch{}await pause(500)}assert.ok(ready);
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
 const apiOps=[];
 async function newContext(width=1280){const ctx=await browser.newContext({viewport:{width,height:840}});await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===web||u.origin===api.origin||u.protocol==='data:'||u.protocol==='blob:')return route.continue();return route.abort()});ctx.on('response',r=>{try{if(new URL(r.url()).origin===web&&new URL(r.url()).pathname==='/api/launch'){const x=r.request().postDataJSON();apiOps.push({operation:x.operation,status:r.status()})}}catch{}});return ctx}
 async function latestMail(email){for(let i=0;i<40;i++){let listing=await (await fetch(mail.origin+'/api/v1/messages',{redirect:'error'})).json();for(const m of listing.messages||[]){if((m.To||[]).some(t=>String(t.Address||'').toLowerCase()===email)){assert.match(m.ID,/^[A-Za-z0-9_-]+$/);let detail=await (await fetch(mail.origin+'/api/v1/message/'+encodeURIComponent(m.ID),{redirect:'error'})).json();let links=[...(detail.HTML||'').matchAll(/href=["']([^"']+)["']/gi)].map(x=>x[1].replaceAll('&amp;','&'));for(const value of links){let u;try{u=safeUrl(value)}catch{continue}if(u.origin===api.origin&&u.pathname.endsWith('/verify'))return u.href}}}await pause(500)}fail('local mail missing')}
 async function signIn(page,email){await page.getByLabel('Email',{exact:true}).fill(email);await page.getByRole('button',{name:'Email me a sign-in link'}).click();await page.getByText('Check your email for the sign-in link.').waitFor();const link=await latestMail(email);await page.goto(link,{waitUntil:'domcontentloaded'});await page.getByText('Signed in as',{exact:false}).waitFor({timeout:30000})}
 stage='reviewer sign-in and return';const reviewer='qa-'+fake+'-reviewer@example.invalid',reviewCtx=await newContext(390),page=await reviewCtx.newPage();page.setDefaultTimeout(20000);
 await page.goto(web+'/guides/og-0002254?intent=review#write-review',{waitUntil:'domcontentloaded'});await page.getByText('No published reviews yet.').waitFor();await signIn(page,reviewer);
 await page.waitForURL(u=>u.origin===web&&u.pathname==='/guides/og-0002254'&&u.search==='?intent=review'&&u.hash==='#write-review',{timeout:30000});
 stage='real Next review submission';await page.getByLabel('Overall quality').selectOption('5');await page.getByLabel('Your relationship to this guide or business').selectOption('none');await page.getByLabel('Your experience').fill('Synthetic independent browser review.');await page.getByLabel('I personally took this trip.').check();await page.getByRole('button',{name:'Submit review'}).click();await page.getByText('Your review is pending. It is not on the public page.').waitFor();
 assert.equal(sql("SELECT count(*) FROM public.reviews WHERE guide_id='10000000-0000-0000-0000-000000000001' AND body='Synthetic independent browser review.' AND status='pending';"),'1');
 assert.equal(sql("SELECT count(*) FROM public.public_angler_reviews WHERE body='Synthetic independent browser review.';"),'0');
 await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Your review is awaiting review and is not public.').waitFor();
 stage='operator sign-in and real moderation';const operator='qa-'+fake+'-operator@example.invalid',adminCtx=await newContext(),admin=await adminCtx.newPage();admin.setDefaultTimeout(20000);await admin.goto(web+'/admin',{waitUntil:'domcontentloaded'});await signIn(admin,operator);
 const uid=sql("SELECT id FROM auth.users WHERE email='"+operator+"';");assert.match(uid,/^[0-9a-f-]{36}$/);sql("INSERT INTO public.site_admins(user_id) VALUES ('"+uid+"'::uuid);");await admin.reload({waitUntil:'domcontentloaded'});
 await admin.getByText('Synthetic independent browser review.').waitFor();await admin.getByLabel('Decision note').fill('Synthetic browser moderator evidence reviewed.');await admin.getByRole('button',{name:'Approve'}).click();await admin.getByText('Decision confirmed: published.').waitFor();
 assert.equal(sql("SELECT count(*) FROM public.reviews WHERE guide_id='10000000-0000-0000-0000-000000000001' AND body='Synthetic independent browser review.' AND status='published';"),'1');
 await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Synthetic independent browser review.').waitFor();await page.getByText('5.0 / 5',{exact:false}).waitFor();
 assert.ok(apiOps.some(x=>x.operation==='submit_review'&&x.status===200));assert.ok(apiOps.some(x=>x.operation==='operator_decide'&&x.status===200));
 console.log('PASS independent synthetic browser -> actual Next -> local Auth/PostgREST: email link return, pending persistence, published-only moderation and rating');
 await adminCtx.close();await reviewCtx.close();
}
(async()=>{try{await main()}catch{console.error('FAIL independent browser/local integration at '+stage+' (details withheld)');process.exitCode=1}finally{if(browser)await browser.close().catch(()=>{});if(app&&app.exitCode===null){app.kill('SIGTERM');await Promise.race([new Promise(r=>app.once('exit',r)),pause(3000)])}}})();
