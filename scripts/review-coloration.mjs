// Réapplique uniquement la coloration et ses preuves ; conserve les autres données.
import {readFile,writeFile} from 'node:fs/promises';
import {applyColorationMetadata} from '../coloration.mjs';
import {labels} from './classify.mjs';
const root=new URL('../',import.meta.url);
const path=new URL('data/plugins.json',root),metaPath=new URL('data/meta.json',root);
const data=JSON.parse(await readFile(path,'utf8'));
const meta=JSON.parse(await readFile(metaPath,'utf8'));
const overrides=JSON.parse(await readFile(new URL('data/overrides.json',root),'utf8'));
let removed=0;
for(const p of data.plugins){
 if(p.tags?.includes('techno:digital')) removed++;
 if(overrides[p.id]?.colorationInfo) p.colorationInfo=overrides[p.id].colorationInfo;
 applyColorationMetadata(p);
}
meta.labels=labels();
await writeFile(path,JSON.stringify(data,null,1));await writeFile(metaPath,JSON.stringify(meta,null,1));
const counts={};for(const p of data.plugins)if(p.colorationInfo)counts[p.colorationInfo.kind]=(counts[p.colorationInfo.kind]||0)+1;
console.log(`${removed} anciennes étiquettes numérique/transparent retirées. Coloration : ${JSON.stringify(counts)}`);
