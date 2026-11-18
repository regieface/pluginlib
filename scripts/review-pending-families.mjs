// Reprend les fonctions principales non confirmées depuis la définition exacte du produit.
import {readFile,writeFile} from 'node:fs/promises';
import {get} from './update.mjs';
import {productStatement} from './source-statements.mjs';
import {extractPage} from './parse.mjs';
import {auditCategoryEvidence,inferFamily} from './category-evidence.mjs';
import {auditRecordType} from '../record-types.mjs';
import {applyProducerOverride} from './catalog-classification.mjs';
import {auditFeatureEvidence} from './feature-evidence.mjs';
const root=new URL('../',import.meta.url),path=new URL('data/plugins.json',root);
const data=JSON.parse(await readFile(path,'utf8'));
const overrides=JSON.parse(await readFile(new URL('data/overrides.json',root),'utf8'));
const pending=data.plugins.filter(p=>p.category==='other'&&p.url&&p.recordTypeEvidence?.method!=='reviewed-source');
const hosts=new Map();for(const p of pending){const host=new URL(p.url).host;if(!hosts.has(host))hosts.set(host,[]);hosts.get(host).push(p);}
const queue=[...hosts.values()],failures=[];let cursor=0,checked=0,successfulSources=0,corrected=0;
await Promise.all(Array.from({length:8},async()=>{while(cursor<queue.length){const items=queue[cursor++];let blocked=false;
 for(const p of items){if(blocked)continue;
  const r=await get(p.url,{tries:1,timeout:10000});checked++;
  if(r.status===429){blocked=true;failures.push({host:new URL(p.url).host,status:429,remaining:items.length-items.indexOf(p)});continue;}
  if(r.status!==200||new URL(r.url).pathname.replace(/\/$/,'')!==new URL(p.url).pathname.replace(/\/$/,''))continue;
  successfulSources++;
  let facts=productStatement(r.text,p);
  if(!facts){
   const page=extractPage(r.text,r.url,p.vendor);
   const proof=inferFamily({...p,description:page.description||''});
   if(page.description&&proof.method==='product-description'&&proof.category!=='other')facts={description:page.description,descriptionEvidence:{method:'product-meta-description',url:p.url,excerpt:page.description}};
  }
  if(!facts)continue;
  Object.assign(p,facts);const override=overrides[p.id];applyProducerOverride(p,override);auditCategoryEvidence(p,override);auditRecordType(p);auditFeatureEvidence(p);if(p.category!=='other')corrected++;
 }
 console.log(`${checked}/${pending.length} tentatives ; ${successfulSources} sources accessibles ; ${corrected} familles confirmées.`);
}}));
await writeFile(path,JSON.stringify(data,null,1));
await writeFile(new URL('data/family-source-review.json',root),JSON.stringify({generatedAt:new Date().toISOString(),mode:process.argv.includes('--offline')?'cached-sources':'live-with-cache',pending:pending.length,checked,successfulSources,corrected,failures},null,1));
