// Listes officielles de produits gratuits, jamais déduites du préfixe d'un nom.
import {readFile,writeFile} from'node:fs/promises';import{pathToFileURL}from'node:url';import{decode,stripHtml,extractLinks}from'./parse.mjs';
export function parseMeldaFree(html,url){
 const products=[];for(const m of html.matchAll(/<h4\b[^>]*>\s*<a\b[^>]*href=["'](\/M[A-Za-z0-9]+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h4>/gi)){const name=stripHtml(m[2]);if(name!==m[1].slice(1))continue;products.push({name,url:new URL(m[1],url).href});}
 return [...new Map(products.map(p=>[p.url,p])).values()];
}
export function parseKhsFree(html,url){
 const products=[];for(const m of html.matchAll(/<ul\b[^>]*class=["'][^"']*\bgrid\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi)){
  for(const a of m[1].matchAll(/<a\b[^>]*href=["'](\/products\/[a-z0-9_]+)["'][^>]*>([\s\S]*?)<\/a>/gi)){const name=stripHtml(a[2]);if(name)products.push({name,url:new URL(a[1],url).href});}
 }
 return [...new Map(products.map(p=>[p.url,p])).values()];
}
const normalized=s=>{try{const u=new URL(s);return u.hostname.replace(/^www\./,'').toLowerCase()+u.pathname.replace(/\/$/,'').toLowerCase()}catch{return ''}};
export function applyFreeProductMetadata(plugin,catalog){
 for(const collection of catalog.collections||[]){if(plugin.vendor!==collection.vendor)continue;const member=collection.products.find(p=>normalized(p.url)===normalized(plugin.url));if(!member)continue;
  plugin.catalogStatus='free';plugin.freeLabel=collection.freeLabel;plugin.freeEditionInfo={collection:collection.id,noteFr:collection.noteFr,upgradeIncluded:false,url:collection.source};plugin.statusEvidence={method:'verified-free-catalog',url:collection.source,excerpt:`${member.name} — ${collection.name} : édition gratuite.`,checkedAt:collection.checkedAt};
  if(plugin.pricing){plugin.unverifiedPricing={...plugin.pricing,reason:'Paid upgrade or unrelated offer is not the free base edition'};delete plugin.pricing;}
  return plugin;
 }return plugin;
}
export async function refreshFreeProducts(){
 const {get}=await import('./update.mjs');const path=new URL('../data/free-products.json',import.meta.url);let previous={collections:[]};try{previous=JSON.parse(await readFile(path,'utf8'))}catch{}
 const specs=[{id:'kilohearts-free-effects',vendor:'Kilohearts',name:'Kilohearts Essentials / Free Effects',source:'https://kilohearts.com/products/kilohearts_essentials',parse:parseKhsFree,min:30,freeLabel:'Gratuit avec un compte',noteFr:'Effets gratuits, utilisables seuls ou comme Snapins. Les hôtes et effets Premium ne sont pas inclus.'},{id:'melda-free-fx',vendor:'MeldaProduction',name:'MFreeFXBundle',source:'https://www.meldaproduction.com/MFreeFXBundle',parse:parseMeldaFree,min:30,freeLabel:'Gratuit · mise à niveau optionnelle',noteFr:'Édition gratuite de MFreeFXBundle. La mise à niveau payante et ses fonctions supplémentaires ne sont pas déclarées acquises.'}];
 const collections=[];for(const spec of specs){const r=await get(spec.source,{tries:1});const products=r.status===200?spec.parse(r.text,r.url):[];if(products.length<spec.min){const old=previous.collections.find(c=>c.id===spec.id);if(!old)throw Error('Liste gratuite non reconnue : '+spec.vendor);collections.push(old);console.log(spec.vendor+' : liste précédente conservée.');continue;}const {parse,min,...info}=spec;collections.push({...info,checkedAt:new Date().toISOString(),products});console.log(`${spec.vendor} : ${products.length} produits gratuits référencés.`);}
 await writeFile(path,JSON.stringify({collections},null,1));
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)await refreshFreeProducts();
