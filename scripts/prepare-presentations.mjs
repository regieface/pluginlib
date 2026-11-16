import {readFile,writeFile} from 'node:fs/promises';
import {publisherPresentation} from './publisher-presentations.mjs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),file=new URL('data/plugins.json',root),data=JSON.parse(await readFile(file,'utf8'));
const cache=process.env.PLUGINLIB_HTTP_CACHE||(process.argv.includes('--cache')?process.argv[process.argv.indexOf('--cache')+1]:undefined);
const output=process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:undefined;
const inputs={};
let sourced=0,missing=0;
for(const p of data.plugins){
 if(p.duplicateOf)continue;let html='';
 if(cache&&p.url)try{const r=JSON.parse(await readFile(`${cache}/${Buffer.from(p.url).toString('base64url')}.json`,'utf8'));if(r.status===200&&new URL(r.url).pathname.replace(/\/$/,'')===new URL(p.url).pathname.replace(/\/$/,''))html=r.text;}catch{}
 const presentation=publisherPresentation(p,html);
 if(presentation?.url){inputs[p.id]={...presentation,id:p.id,name:p.name,vendor:p.vendor};if(html||!p.presentationSource)p.presentationSource={url:presentation.url,hash:createHash('sha256').update(presentation.text).digest('hex'),method:presentation.method,checkedAt:presentation.checkedAt};sourced++;}else{delete p.presentationSource;missing++;}
 delete p.publisherDescription;
}
if(output)await writeFile(output,JSON.stringify(inputs,null,1));
await writeFile(file,JSON.stringify(data,null,1));console.log({sourced,missing});
