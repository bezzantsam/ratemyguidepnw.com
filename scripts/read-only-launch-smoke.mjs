import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// GET-only release smoke test. This is deliberately not an authorization scanner.
export const ROUTES = Object.freeze([
  {path:'/', status:200, text:'Find a fishing guide.', directory:true},
  {path:'/guides', status:200, text:'Find your fishing guide.', directory:true},
  {path:'/reviews', status:200, text:'Reviews are currently unavailable', unavailable:true},
  {path:'/admin', status:200, text:'Moderation unavailable', unavailable:true},
  {path:'/claim/OG.0000047', status:200, text:'Profile claims are currently unavailable.', unavailable:true},
  {path:'/guides/og-9999999', status:404},
  {path:'/editorial-changes', status:404},
]);
const forbidden = /Shared captains appear once|Pending Secret Species|Rejected Secret Method|Fixture Source Outfit|Synthetic Captain Alias|Unapproved editorial preview|__editorial_visual__|rc-secret-canary-27f7bf9015/i;
const MAX_BYTES = 4 * 1024 * 1024;

export function validateTarget(value, allowRemote=false) {
  let target;
  try { target = new URL(value); } catch { throw new Error('A valid absolute base URL is required'); }
  if (target.username || target.password || target.search || target.hash || target.pathname !== '/') {
    throw new Error('Use an origin only, without credentials, path, query or fragment');
  }
  const loopback = ['127.0.0.1','[::1]'].includes(target.hostname);
  if (loopback && !['http:','https:'].includes(target.protocol)) throw new Error('Loopback requires HTTP or HTTPS');
  if (!loopback && (!allowRemote || target.protocol !== 'https:')) {
    throw new Error('Remote checks require explicit --allow-remote and an authorized HTTPS origin');
  }
  return target.origin;
}

function renderedMarkup(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}
function textContent(html) {
  return renderedMarkup(html).replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|#160);/gi,' ').replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ').trim();
}

async function boundedText(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) { await response.body?.cancel(); throw new Error('response_too_large'); }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size=0, content='';
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('response_too_large'); }
      content += decoder.decode(value,{stream:true});
    }
    return content + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function runSmoke(baseUrl, {allowRemote=false, timeoutMs=15000, maxBytes=MAX_BYTES, fetchImpl=fetch}={}) {
  const origin = validateTarget(baseUrl, allowRemote);
  if (!Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>60000) throw new Error('timeoutMs must be 1–60000');
  if (!Number.isInteger(maxBytes) || maxBytes<1 || maxBytes>MAX_BYTES) throw new Error('maxBytes must be 1–4194304');
  const results=[];
  for (const route of ROUTES) {
    const result={path:route.path,method:'GET',expectedStatus:route.status,status:null,passed:false,failures:[]};
    try {
      const response=await fetchImpl(new URL(route.path,origin),{
        method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',
        signal:AbortSignal.timeout(timeoutMs),headers:{accept:'text/html'},
      });
      result.status=response.status;
      if (response.status!==route.status) result.failures.push('unexpected_status');
      if (!/^text\/html(?:;|$)/i.test(response.headers.get('content-type')||'')) result.failures.push('unexpected_content_type');
      // Redirects, authentication challenges and upstream errors are not followed or called a pass.
      if (response.status!==route.status) { await response.body?.cancel(); }
      else {
        const body=await boundedText(response,maxBytes);
        const markup=renderedMarkup(body);
        if (!/<(?:html|main)\b/i.test(markup)) result.failures.push('missing_html_document');
        if (route.text && !textContent(body).includes(route.text)) result.failures.push('missing_expected_content');
        if (forbidden.test(body)) result.failures.push('forbidden_public_marker');
        if (route.directory && /<a\b[^>]*\bhref\s*=\s*["']\/intel(?:\/|["'])/i.test(markup)) result.failures.push('research_promotion_in_directory');
        if (route.unavailable && /<(?:form|input|textarea)\b/i.test(markup)) result.failures.push('unexpected_submission_control');
      }
    } catch (error) {
      // Never retain response bodies, redirect locations, tokens or arbitrary exception messages.
      result.failures.push(['AbortError','TimeoutError'].includes(error?.name)?'request_timeout':error?.message==='response_too_large'?'response_too_large':'request_failed');
    }
    result.passed=result.failures.length===0;
    results.push(result);
  }
  return {
    schemaVersion:1,checkedAt:new Date().toISOString(),origin,scope:'GET-only read-only directory smoke',
    passed:results.every(r=>r.passed),results,
    limitations:[
      'No JavaScript execution, authenticated requests or write-method testing.',
      'No hosted database, Storage, identity, licensing or source-truth assurance.',
      'Targeted response checks are not an exhaustive data-leak test.',
      'The served commit is not verified by this tool; match it through the hosting release record.',
      'No deployment, publication approval or authorization changes are performed.',
    ],
  };
}

export async function main(args) {
  let base, output, allowRemote=false;
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--base-url' || arg==='--output') {
      const value=args[++i];
      if(!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if(arg==='--base-url') { if(base) throw new Error('Duplicate --base-url'); base=value; }
      else { if(output) throw new Error('Duplicate --output'); output=value; }
    } else if(arg==='--allow-remote') allowRemote=true;
    else throw new Error('Use --base-url ORIGIN [--allow-remote] [--output NEW_FILE.json]');
  }
  if(!base) throw new Error('--base-url is required; no live target is assumed');
  const report=await runSmoke(base,{allowRemote});
  const json=JSON.stringify(report,null,2)+'\n';
  if(output) await writeFile(output,json,{flag:'wx',mode:0o600});
  console.log(json);
  return report.passed?0:1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { process.exitCode=await main(process.argv.slice(2)); }
  catch(error) { console.error(error.code==='EEXIST'?'Refusing to overwrite an existing smoke report':error.message); process.exitCode=2; }
}
