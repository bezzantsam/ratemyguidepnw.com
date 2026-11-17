import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkReleaseDependencies} from '../scripts/check-release-dependencies.mjs';

const checker=join(process.cwd(),'scripts/check-release-dependencies.mjs');
function fixture(work){
 const root=mkdtempSync(join(tmpdir(),'rmg-dependency-test-'));
 const pkg={name:'fixture-only',version:'1.0.0',engines:{node:'22.x'},dependencies:{example:'^1.0.0'},devDependencies:{'example-test':'^2.0.0'}};
 const entry=(name,version)=>({version,resolved:`https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,integrity:'sha512-'+Buffer.alloc(64).toString('base64')});
 const lock={name:pkg.name,version:pkg.version,lockfileVersion:3,packages:{'':structuredClone(pkg),'node_modules/example':entry('example','1.0.0'),'node_modules/example-test':entry('example-test','2.0.0')}};
 const save=()=>{writeFileSync(join(root,'package.json'),JSON.stringify(pkg));writeFileSync(join(root,'package-lock.json'),JSON.stringify(lock))};
 save();writeFileSync(join(root,'.nvmrc'),'22\n');
 try{return work({root,pkg,lock,save})}finally{rmSync(root,{recursive:true,force:true})}
}
const run=root=>checkReleaseDependencies({root,runtimeVersion:'v22.16.0'});

test('committed real lock and Node contract agree',()=>{const result=checkReleaseDependencies();assert.equal(result.node_major,'22');assert.ok(result.locked_packages>0);assert.match(result.lock_sha256,/^[0-9a-f]{64}$/)});
test('valid fixture passes without mutating the lock',()=>fixture(({root})=>{const before=readFileSync(join(root,'package-lock.json'));assert.equal(run(root).locked_packages,2);assert.deepEqual(readFileSync(join(root,'package-lock.json')),before)}));
test('Node 20, 24, 26 and invalid runtime strings are rejected',()=>fixture(({root})=>{for(const runtimeVersion of ['v20.19.4','v24.0.0','v26.0.0','22','not-a-version'])assert.throws(()=>checkReleaseDependencies({root,runtimeVersion}),/requires Node 22/)}));
test('missing lock fails closed',()=>fixture(({root})=>{unlinkSync(join(root,'package-lock.json'));assert.throws(()=>run(root),/Missing package-lock/)}));
test('invalid lock JSON is refused',()=>fixture(({root})=>{writeFileSync(join(root,'package-lock.json'),'{broken');assert.throws(()=>run(root),/Invalid JSON/)}));
test('unsupported lock format is refused',()=>fixture(({root,lock,save})=>{lock.lockfileVersion=2;save();assert.throws(()=>run(root),/version 3/)}));
test('runtime declarations must agree',()=>fixture(({root,pkg,save})=>{writeFileSync(join(root,'.nvmrc'),'26\n');assert.throws(()=>run(root),/nvmrc/);writeFileSync(join(root,'.nvmrc'),'22\n');pkg.engines.node='>=22';save();assert.throws(()=>run(root),/engines.node/)}));
test('root identity and version must agree',()=>fixture(({root,lock,save})=>{lock.name='other';save();assert.throws(()=>run(root),/name does not match/);lock.name='fixture-only';lock.packages[''].version='2.0.0';save();assert.throws(()=>run(root),/version does not match/)}));
test('changed production dependency declarations are refused',()=>fixture(({root,pkg,save})=>{pkg.dependencies.example='^3.0.0';save();assert.throws(()=>run(root),/root dependencies differs/)}));
test('changed development dependencies are refused',()=>fixture(({root,pkg,save})=>{pkg.devDependencies['example-test']='^3.0.0';save();assert.throws(()=>run(root),/devDependencies/)}));
test('changed root engine metadata is refused',()=>fixture(({root,lock,save})=>{lock.packages[''].engines.node='26.x';save();assert.throws(()=>run(root),/root engines/)}));
test('missing direct resolution is refused',()=>fixture(({root,lock,save})=>{delete lock.packages['node_modules/example'];save();assert.throws(()=>run(root),/missing a declared direct dependency/)}));
test('unversioned and local linked entries are refused',()=>fixture(({root,lock,save})=>{const e=lock.packages['node_modules/example'];e.version='latest';save();assert.throws(()=>run(root),/exact package version/);e.version='1.0.0';e.link=true;save();assert.throws(()=>run(root),/Only registry/)}));
test('insecure, credentialed, local and alternate registries are refused',()=>fixture(({root,lock,save})=>{for(const url of ['http://registry.npmjs.org/a.tgz','https://example.test/a.tgz','file:../package','https://user:pass@registry.npmjs.org/a.tgz','https://registry.npmjs.org/a.tgz?token=synthetic']){lock.packages['node_modules/example'].resolved=url;save();assert.throws(()=>run(root),/credential-free HTTPS/);}}));
test('missing or malformed integrity metadata is refused',()=>fixture(({root,lock,save})=>{for(const integrity of [undefined,'sha1-aaaa','sha512-YQ==']){lock.packages['node_modules/example'].integrity=integrity;save();assert.throws(()=>run(root),/SHA-512/);}}));
test('CLI succeeds offline and fails on missing lock without writing it',()=>fixture(({root})=>{let result=spawnSync(process.execPath,[checker],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).locked_packages,2);unlinkSync(join(root,'package-lock.json'));result=spawnSync(process.execPath,[checker],{cwd:root,encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/Missing package-lock/)}));
test('CI, Vercel and both snapshot modes use the frozen install contract',()=>{
 const read=p=>readFileSync(p,'utf8');const pkg=JSON.parse(read('package.json'));const config=JSON.parse(read('vercel.json'));
 assert.equal(pkg.scripts.prebuild,'node scripts/check-release-dependencies.mjs');
 assert.match(config.installCommand,/npm ci/);assert.doesNotMatch(config.installCommand,/npm install/);
 assert.equal(config.git.deploymentEnabled['coordinator/rmg-launch-prep'],false);
 assert.equal(config.git.deploymentEnabled['codex/directory-identity-copy-fix'],false);
 const workflow=read('.github/workflows/site-build.yml');assert.match(workflow,/node-version-file: .nvmrc/);assert.match(workflow,/npm ci --no-audit --no-fund/);assert.doesNotMatch(workflow,/npm install/);
 for(const p of ['scripts/browser-isolation.mjs','scripts/editorial-visual.mjs']){const source=read(p);assert.match(source,/\['ci','--no-audit','--no-fund'\]/);assert.doesNotMatch(source,/\['install'/);}
});
