// Complète les listes gratuites officielles sans effacer de fiche ni confondre une mise à niveau avec l’édition gratuite.
import {readFile,writeFile} from 'node:fs/promises';
import {get} from './update.mjs';
import {extractPage,slug} from './parse.mjs';
import {inferCatalogMetadata} from '../catalog.mjs';
import {applyFreeProductMetadata} from './free-products.mjs';
import {auditCategoryEvidence} from './category-evidence.mjs';
import {auditRecordType} from '../record-types.mjs';
import {applyProducerOverride} from './catalog-classification.mjs';
import {auditFeatureEvidence} from './feature-evidence.mjs';
const root=new URL('../',import.meta.url);
const data=JSON.parse(await readFile(new URL('data/plugins.json',root),'utf8'));
const free=JSON.parse(await readFile(new URL('data/free-products.json',root),'utf8'));
const overrides=JSON.parse(await readFile(new URL('data/overrides.json',root),'utf8'));
const key=(url='')=>String(url||'').replace('://www.', '://').replace(/\/$/,'').toLowerCase();
let added=0;
for(const collection of free.collections)for(const member of collection.products){
 let p=data.plugins.find(p=>p.vendor===collection.vendor&&key(p.url)===key(member.url));
 if(!p){
  const r=await get(member.url,{tries:1});
  if(r.status!==200||key(r.url)!==key(member.url)){console.log(`Fiche non ajoutée : ${member.name} (${r.status}).`);continue;}
  const page=extractPage(r.text,r.url,collection.vendor),checkedAt=new Date().toISOString();
  const id=`${slug(collection.vendor)}--${slug(member.name)}`;
  if(data.plugins.some(p=>p.id===id))throw Error(`Identifiant déjà utilisé : ${id}`);
  p={id,name:member.name,vendor:collection.vendor,url:member.url,image:page.image,description:page.description||'',category:'other',tags:[],source:'liste gratuite officielle',checkedAt,...inferCatalogMetadata({text:page.metadataText,operatingSystem:page.operatingSystem,url:r.url,checkedAt,listed:true})};
  data.plugins.push(p);added++;
 }
 const override=overrides[p.id];applyProducerOverride(p,override);applyFreeProductMetadata(p,free);auditCategoryEvidence(p,override);auditRecordType(p);auditFeatureEvidence(p);
}
data.count=data.plugins.length;
await writeFile(new URL('data/plugins.json',root),JSON.stringify(data,null,1));
const metaPath=new URL('data/meta.json',root),meta=JSON.parse(await readFile(metaPath,'utf8'));meta.count=data.count;await writeFile(metaPath,JSON.stringify(meta,null,1));
console.log(`${added} fiches gratuites ajoutées ; métadonnées gratuites appliquées.`);
