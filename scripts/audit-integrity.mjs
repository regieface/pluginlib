// Contrôles indépendants de cohérence sur toutes les fiches et leurs sources publiques.
import {readFile,writeFile} from 'node:fs/promises';
import {get,isHome} from './update.mjs';import {extractPage,stripHtml} from './parse.mjs';
import {latencyIssues} from '../latency-resolution.mjs';
import {classificationReviewReason} from './catalog-classification.mjs';
const root=new URL('../',import.meta.url),data=JSON.parse(await readFile(new URL('data/plugins.json',root),'utf8'));
const cache=process.env.PLUGINLIB_HTTP_CACHE||(process.argv.includes('--cache')?process.argv[process.argv.indexOf('--cache')+1]:undefined);
const fetchMissing=process.argv.includes('--fetch-missing');
const key=s=>(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const memo=new Map(),hostBusy=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function pageFor(url){
 if(!url)return null;const request=new URL(url);request.hash='';const u=request.href;
 if(!memo.has(u))memo.set(u,(async()=>{
  if(cache)for(const candidate of new Set([u,u.replace(/\/$/,''),u.replace(/\/$/,'')+'/']))try{return {...JSON.parse(await readFile(`${cache}/${Buffer.from(candidate).toString('base64url')}.json`,'utf8')),verification:'cached-response'};}catch{}
  if(!fetchMissing)return {status:0,url:u,text:'',verification:'not-fetched'};
  const host=request.hostname;while((hostBusy.get(host)||0)>=2)await sleep(40);hostBusy.set(host,(hostBusy.get(host)||0)+1);
  try{return {...await get(u,{tries:1,timeout:12000}),verification:'live-response'};}finally{hostBusy.set(host,hostBusy.get(host)-1);}
 })());return memo.get(u);
}
const checks=[],findings=[];let cursor=0;
const add=(p,field,severity,reason,detail={})=>findings.push({id:p.id,name:p.name,vendor:p.vendor,field,severity,reason,...detail});
const seenIds=new Set();for(const p of data.plugins){if(seenIds.has(p.id))add(p,'identity','confirmed','duplicate-identifier');seenIds.add(p.id);}
await Promise.all(Array.from({length:6},async()=>{while(cursor<data.plugins.length){const p=data.plugins[cursor++];const row={id:p.id,fieldsChecked:['identity','family','criteria','latency','status','platforms','pricing','image','scope','description'],source:'not-available'};
 if(!p.url)add(p,'url','unverified','missing-product-source');
 const classificationReview=classificationReviewReason(p);
 if(classificationReview)add(p,'classification','unverified',classificationReview);
 if(p.category==='other')add(p,'family','unverified','primary-function-unconfirmed');
 if(p.unverifiedTags?.length)add(p,'criteria','unverified','unsupported-technical-criteria',{tags:p.unverifiedTags});
 const issues=latencyIssues(p);
 if(issues.length)add(p,'latency','unverified','latency-conflict',{rates:issues.map(issue=>issue.rate),issues});
 if(p.unverifiedLatencyInfo)add(p,'latency','confirmed','catalog-contamination-quarantined');
 if(p.pricing){const q=p.pricing;if(!q.url||!q.currency||!q.checkedAt||![q.normal,q.promo].some(Number.isFinite))add(p,'pricing','confirmed','incomplete-price-record');if(q.normal!=null&&q.promo!=null&&q.promo>=q.normal)add(p,'pricing','confirmed','invalid-discount');if(p.catalogStatus==='free'&&(q.normal>0||q.promo>0))add(p,'pricing','conflict','free-status-with-paid-price',{pricing:q});}
 if(p.platforms?.length&&/documentUrlPath|skuInStoreFrom|subscriptionPlans|\\u00|\\"/.test(p.platformEvidence?.excerpt||''))add(p,'platforms','unverified','embedded-data-used-as-platform-proof',{evidence:p.platformEvidence});
 if(p.image&&/\/(?:icons?|cart|logos?)\//i.test(p.image))add(p,'image','unverified','icon-or-related-product-image',{url:p.image});
 if(/^(?:get the best music loops|discover .{0,30}range of|pro-grade audio software|vst3, audio unit, aax)/i.test(p.description||''))add(p,'description','unverified','generic-publisher-description');
 if(!p.recordTypeEvidence?.method?.startsWith('reviewed-')&&/synthesi[sz]er|virtual instrument|dual.oscillator synth|single.oscillator|multisampler|sample player|waveform generator/i.test(p.name+' '+p.description))add(p,'scope','unverified','possible-instrument-or-module');
 if(p.name.length>60)add(p,'identity','unverified','marketing-sentence-in-product-name');
 const r=await pageFor(p.url);if(r){row.source=r.verification;row.httpStatus=r.status;row.finalURL=r.url;
  if(r.status===404||r.status===410)add(p,'url','confirmed','product-source-not-found',{status:r.status,url:r.url});
  else if(r.status!==200)add(p,'url','unverified','source-unavailable',{status:r.status,url:r.url});
  else if(isHome(r.url)&&!isHome(p.url))add(p,'url','conflict','product-redirects-to-home',{url:r.url});
  if(r.status===200&&p.pricing?.sourceType!=='retailer'&&p.pricing){
   const page=extractPage(r.text,r.url,p.vendor);const actual=page.pricing?.promo??page.pricing?.normal;
   const stored=p.pricing.promo??p.pricing.normal;
   if(actual==null)add(p,'pricing','unverified','stored-price-not-reproduced-in-scoped-page',{stored:p.pricing});
   else if(page.pricing.currency!==p.pricing.currency||actual!==stored)add(p,'pricing','conflict','source-price-differs',{stored:p.pricing,parsed:page.pricing});
  }
 }
 checks.push(row);if(checks.length%100===0)console.log(`${checks.length}/${data.plugins.length} fiches contrôlées, ${findings.length} constats.`);
}}));
const severity={};const fields={};for(const f of findings){severity[f.severity]=(severity[f.severity]||0)+1;fields[f.field]=(fields[f.field]||0)+1;}
for(const f of findings) f.state=f.reason==='catalog-contamination-quarantined'?'quarantined':'pending';
const report={generatedAt:new Date().toISOString(),scope:'Contrôles de cohérence des champs et accès aux sources pour toutes les fiches. Ne constitue pas une validation humaine exhaustive des fonctions ou visuels.',summary:{recordsChecked:checks.length,uniqueDisplayedRecords:data.plugins.filter(p=>!p.duplicateOf&&!p.exclude).length,quarantinedLatency:findings.filter(f=>f.state==='quarantined').length,sourceChecks:checks.filter(c=>c.httpStatus===200).length,live:checks.filter(c=>c.source==='live-response').length,cached:checks.filter(c=>c.source==='cached-response').length,severity,fields},checks,findings};
await writeFile(new URL('data/integrity-report.json',root),JSON.stringify(report,null,1));
const md=['# Contrôle global des données PluginLib','',report.scope,'',`${checks.length} fiches contrôlées sur les champs listés. Les constats « non vérifiés » ne sont pas des erreurs confirmées.`,'','| Champ | Constats |','|---|---:|',...Object.entries(fields).map(([f,n])=>`| ${f} | ${n} |`),'','Le détail complet, les statuts HTTP et les provenances (cache ou requête actuelle) sont dans integrity-report.json.'];
await writeFile(new URL('data/integrity-report.md',root),md.join('\n')+'\n');console.log(JSON.stringify(report.summary));
// Une panne éditeur reste un constat. Une incohérence structurelle empêche
// en revanche la publication automatique de tarifs ou identifiants invalides.
if(findings.some(f=>['duplicate-identifier','incomplete-price-record','invalid-discount','free-status-with-paid-price'].includes(f.reason)))process.exitCode=1;
