// Audit global local : aucune suppression de fiche ou licence ; critères douteux à part.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {applyFreeProductMetadata} from './free-products.mjs';
import {auditFeatureEvidence} from './feature-evidence.mjs';
import {applyColorationMetadata} from '../coloration.mjs';
import {labels} from './classify.mjs';
import {auditCategoryEvidence} from './category-evidence.mjs';
import {auditRecordType} from '../record-types.mjs';
import {applyProducerOverride, classificationMetadata, classificationReviewReason, materializeClassification} from './catalog-classification.mjs';
export async function auditCatalog(root=new URL('../',import.meta.url)) {
 const path=new URL('data/plugins.json',root);
 const data=JSON.parse(await readFile(path,'utf8'));
 const freeProducts = JSON.parse(await readFile(new URL('data/free-products.json', root), 'utf8'));
 const overrides=JSON.parse(await readFile(new URL('data/overrides.json',root),'utf8'));
 for(const p of data.plugins){
  const o=overrides[p.id];applyProducerOverride(p,o);applyFreeProductMetadata(p,freeProducts);
  auditCategoryEvidence(p,o);auditRecordType(p);applyColorationMetadata(p);auditFeatureEvidence(p);
  p.classification=materializeClassification(p,o);
  if(p.pricing&&(p.catalogStatus==='free'||(p.pricing.normal===0&&p.catalogStatus!=='free'))){p.unverifiedPricing={...p.pricing,reason:p.catalogStatus==='free'?'Price conflicts with documented free edition':'Zero shop placeholder is not a public price'};delete p.pricing;}
 }
 data.count=data.plugins.length;
 await writeFile(path,JSON.stringify(data,null,1));
 const metaPath=new URL('data/meta.json',root);const meta=JSON.parse(await readFile(metaPath,'utf8'));meta.labels=labels();meta.classification=classificationMetadata();meta.count=data.count;await writeFile(metaPath,JSON.stringify(meta,null,1));
 const byVendor={};for(const p of data.plugins){const v=byVendor[p.vendor]||={plugins:0,documentedCriteria:0,pendingCriteria:0,suspectLatency:0,documentedFamilies:0,pendingFamilies:0};v.plugins++;v.documentedFamilies+=Number(p.categoryEvidence?.status==='documented');v.pendingFamilies+=Number(p.category==='other');v.documentedCriteria+=p.tags.length;v.pendingCriteria+=p.unverifiedTags.length;v.suspectLatency+=Number(!!p.unverifiedLatencyInfo);}
 const summary={plugins:data.plugins.length,documentedFamilies:data.plugins.filter(p=>p.categoryEvidence?.status==='documented').length,pendingFamilies:data.plugins.filter(p=>p.category==='other').length,reclassifiedFamilies:data.plugins.filter(p=>p.category!=='other'&&p.categoryReview?.originalCategory!==p.category).length,documentedCriteria:data.plugins.reduce((n,p)=>n+p.tags.length,0),pendingCriteria:data.plugins.reduce((n,p)=>n+p.unverifiedTags.length,0),pluginsWithPendingCriteria:data.plugins.filter(p=>p.unverifiedTags.length).length,suspectLatency:data.plugins.filter(p=>p.unverifiedLatencyInfo).length};
 const classificationReviews=new Map(data.plugins.map(p=>[p.id,classificationReviewReason(p)]));
 const report={generatedAt:new Date().toISOString(),scope:'Audit des familles principales, critères techniques et extraits de latence contaminés. Les preuves textuelles ne constituent pas une vérification manuelle exhaustive ; prix et compatibilités sont hors de ce contrôle.',summary,byVendor,reviewQueue:data.plugins.filter(p=>classificationReviews.get(p.id)||p.category==='other'||p.unverifiedTags.length||p.unverifiedLatencyInfo).map(p=>({id:p.id,name:p.name,vendor:p.vendor,url:p.url,category:p.category,classificationReview:classificationReviews.get(p.id),categoryEvidence:p.categoryEvidence,categoryReview:p.categoryReview,criteria:p.unverifiedTags,...(p.unverifiedLatencyInfo?{suspectLatency:p.unverifiedLatencyInfo}: {})}))};
 await writeFile(new URL('data/quality-report.json',root),JSON.stringify(report,null,1));
 const md=['# Audit de fiabilité PluginLib','',report.scope,'',`- ${summary.plugins} fiches conservées.`,`- ${summary.documentedFamilies} familles appuyées par une fonction principale explicite ou une vérification de source.`,`- ${summary.pendingFamilies} familles à vérifier, écartées des familles précises dans les filtres.`,`- ${summary.reclassifiedFamilies} familles connues réattribuées depuis le classement initial.`,`- ${summary.documentedCriteria} critères avec une preuve propre au produit.`,`- ${summary.pendingCriteria} anciens critères retirés des filtres et mis à vérifier.`,`- ${summary.suspectLatency} extraits de latence contaminés écartés ; les tableaux officiels indépendants sont conservés.`,'','Une description éditeur constitue une source textuelle, pas une validation manuelle complète. Une fonction non confirmée n’est pas déclarée absente. Les cas restants sont conservés dans quality-report.json pour poursuivre la vérification par fabricant.','','| Fabricant | Familles renseignées | Familles à vérifier | Critères sourcés | Critères à vérifier |','|---|---:|---:|---:|---:|',...Object.entries(byVendor).sort((a,b)=>b[1].pendingCriteria-a[1].pendingCriteria).map(([name,v])=>`| ${name} | ${v.documentedFamilies} | ${v.pendingFamilies} | ${v.documentedCriteria} | ${v.pendingCriteria} |`)];
 await writeFile(new URL('data/quality-report.md',root),md.join('\n')+'\n');console.log(JSON.stringify(summary));
 return report;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 auditCatalog().catch(error=>{console.error(error);process.exitCode=1;});
}
