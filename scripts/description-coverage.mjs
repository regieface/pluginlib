import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),plugins=JSON.parse(await readFile(new URL('data/plugins.json',root),'utf8')).plugins.filter(p=>!p.exclude&&!p.duplicateOf),summaries=JSON.parse(await readFile(new URL('data/descriptions-fr.json',root),'utf8'));
const missing=plugins.filter(p=>!summaries[p.id]?.text||!summaries[p.id]?.sourceUrl||!summaries[p.id]?.sourceHash);
const reviewed=plugins.filter(p=>summaries[p.id]?.method==='reviewed-synthesis').length;
const sourceChanged=plugins.filter(p=>summaries[p.id]?.sourceHash&&p.presentationSource?.hash&&summaries[p.id].sourceHash!==p.presentationSource.hash);
const ref=p=>({id:p.id,name:p.name,vendor:p.vendor,url:p.url});
const report={generatedAt:new Date().toISOString(),summary:{visibleRecords:plugins.length,frenchPresentations:plugins.length-missing.length,individuallyWritten:reviewed,sourceAssisted:plugins.length-missing.length-reviewed,missing:missing.length,sourceChanged:sourceChanged.length},method:'Synthèses françaises fondées sur les présentations propres aux produits. Les textes assistés ne constituent pas une validation manuelle exhaustive. Aucune définition de famille ne remplace une source manquante.',missing:missing.map(ref),sourceChanged:sourceChanged.map(ref)};
await writeFile(new URL('data/description-coverage.json',root),JSON.stringify(report,null,1));console.log(report.summary);
