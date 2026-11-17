import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

// These checks supplement npm ci; they do not replace npm's dependency or
// tarball-integrity validation and are not a supply-chain security audit.
export const NODE_MAJOR = '22';
function requireCondition(condition,message){if(!condition)throw new Error(message)}
function read(root,name){
 try{return readFileSync(join(root,name),'utf8')}
 catch(error){if(error.code==='ENOENT')throw new Error(`Missing ${name}; restore the committed release inputs before installing or building.`);throw error}
}
function parse(text,name){
 try{return JSON.parse(text)}catch{throw new Error(`Invalid JSON in ${name}`)}
}
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function checkReleaseDependencies({root=process.cwd(),runtimeVersion=process.version}={}){
 const match=/^v?(\d+)\.\d+\.\d+(?:[-+].*)?$/.exec(runtimeVersion);
 requireCondition(match?.[1]===NODE_MAJOR,'This release requires Node 22.x; use the runtime declared in .nvmrc.');
 const pkg=parse(read(root,'package.json'),'package.json');
 const lockText=read(root,'package-lock.json');
 const lock=parse(lockText,'package-lock.json');
 requireCondition(object(pkg)&&pkg.engines?.node==='22.x','package.json must declare engines.node as 22.x.');
 requireCondition(read(root,'.nvmrc').trim()===NODE_MAJOR,'.nvmrc must match engines.node (22).');
 requireCondition(object(lock)&&lock.lockfileVersion===3,'A committed npm lockfile version 3 is required.');
 requireCondition(object(lock.packages)&&object(lock.packages['']),'The lockfile must contain its root package entry.');
 const base=lock.packages[''];
 for(const key of ['name','version']){
  requireCondition(typeof pkg[key]==='string'&&pkg[key]===lock[key]&&pkg[key]===base[key],`Lockfile ${key} does not match package.json.`);
 }
 for(const key of ['dependencies','devDependencies','optionalDependencies','peerDependencies','engines']){
  requireCondition(isDeepStrictEqual(pkg[key]??{},base[key]??{}),`Lockfile root ${key} differs from package.json; review and regenerate the lock deliberately.`);
 }
 let count=0;
 for(const [name,entry] of Object.entries(lock.packages)){
  if(name==='')continue;
  requireCondition(name.startsWith('node_modules/')&&!name.split('/').includes('..')&&object(entry)&&!entry.link,'Only registry package entries are supported by this release.');
  requireCondition(typeof entry.version==='string'&&/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(entry.version),'A dependency is missing an exact package version.');
  let url;try{url=new URL(entry.resolved)}catch{throw new Error('A dependency is missing a registry tarball URL.')}
  requireCondition(url.protocol==='https:'&&url.hostname==='registry.npmjs.org'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash,'Dependencies must resolve to credential-free HTTPS npm registry tarballs.');
  requireCondition(typeof entry.integrity==='string'&&/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity)&&Buffer.from(entry.integrity.slice(7),'base64').length===64,'A dependency is missing SHA-512 tarball integrity metadata.');
  count++;
 }
 requireCondition(count>0,'The release lockfile contains no dependencies.');
 for(const name of Object.keys({...pkg.dependencies,...pkg.devDependencies,...pkg.optionalDependencies})){
  requireCondition(object(lock.packages[`node_modules/${name}`]),'The lockfile is missing a declared direct dependency.');
 }
 return {schema:'rmg-release-dependencies/1',node:runtimeVersion,node_major:NODE_MAJOR,lockfile_version:lock.lockfileVersion,locked_packages:count,lock_sha256:createHash('sha256').update(lockText).digest('hex')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(checkReleaseDependencies(),null,2))}
 catch(error){console.error(`Release dependency check failed: ${error.message}`);process.exitCode=1}
}
