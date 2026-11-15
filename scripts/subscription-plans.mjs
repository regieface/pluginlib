// Périmètre d'abonnement public, indépendant de la collection personnelle.
import {readFile,writeFile} from'node:fs/promises';import{pathToFileURL}from'node:url';import{get}from'./update.mjs';import{stripHtml,decode}from'./parse.mjs';
export function parseWavesUltimate(html){
 html=decode(html);
 for(const match of html.matchAll(/"products"\s*:\s*\[/g)){
  const start=html.indexOf('[',match.index);let depth=0,quoted=false,escaped=false;
  for(let i=start;i<html.length;i++){const c=html[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;else if(c==='[')depth++;else if(c===']'&&!--depth){try{const rows=JSON.parse(html.slice(start,i+1));const products=rows.filter(p=>Number(p.isHigh)===1&&/^\/plugins\/[a-z0-9-]+$/.test(p.documentUrlPath||'')).map(p=>({name:stripHtml(p.documentName),url:new URL(p.documentUrlPath,'https://www.waves.com').href}));if(products.length)return [...new Map(products.map(p=>[p.url,p])).values()];}catch{}break;}}
 }
 return [];
}
export async function refreshSubscriptionPlans(){const path=new URL('../data/subscriptions.json',import.meta.url);let previous={plans:[]};try{previous=JSON.parse(await readFile(path,'utf8'))}catch{}const url='https://www.waves.com/subscriptions/ultimate',r=await get(url,{tries:1});const products=r.status===200?parseWavesUltimate(r.text):[];if(products.length<200){if(previous.plans.length){console.log('Waves Ultimate : source indisponible, périmètre antérieur conservé.');return;}throw Error('Liste officielle Waves Ultimate non reconnue');}const plan={id:'waves-ultimate',vendor:'Waves',plan:'Ultimate',source:url,checkedAt:new Date().toISOString(),products};await writeFile(path,JSON.stringify({plans:[...previous.plans.filter(p=>p.id!==plan.id),plan]},null,1));console.log(`Waves Ultimate : ${products.length} références officielles.`);}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)await refreshSubscriptionPlans();
