// Seul le nom et la description du produit précis peuvent confirmer un critère.
// Les textes globaux de boutique ne sont jamais utilisés ici.
import { presentLatencyInfo, resolveCatalogLatency } from '../latency-resolution.mjs';
import { discardSyntheticLatency } from './product-facts.mjs';
import {FACETS,COMMON} from './classify.mjs';

const strict = {
 'techno:varimu':[/\bvari[- ]?mu\b/i,/\bvariable[- ](?:mu|bias)\b/i],
 'techno:vca':[/\bvca\b/i],
 'techno:opto':[/\belectro[- ]optical\b/i,/\boptical (?:compressor|compression|attenuator)\b/i,/\bopto(?:[- ](?:compressor|compression))?\b/i],
 'techno:fet':[/\bfet\b/i],
 'techno:diode':[/\bdiode[- ]bridge\b/i],
 'vitesse:rapide':[/\b(?:fast|ultra[- ]fast|lightning[- ]fast) attack\b/i],
 'vitesse:lente':[/\bslow attack\b/i],
 'eqtype:dynamique':[/\bdynamic (?:eq|equali[sz](?:er|ation))\b/i],
 'eqtype:resonance':[/\bresonance (?:suppression|suppressor|control|tamer)\b/i,/\bresonan(?:ces|t) (?:taming|tamer)\b/i],
 'opt:sidechain':[/\bexternal (?:side[- ]?chain|key)(?: input)?\b/i,/\bside[- ]?chain input\b/i,/\bkey input\b/i],
 'opt:live':[/\blive (?:mode|version)\b/i,/\b(?:mode|version) live\b/i]
};
const knownTags = new Set([
 ...Object.entries(FACETS).flatMap(([facet, definition]) => Object.keys(definition.values).map(value => `${facet}:${value}`)),
 ...Object.keys(COMMON).map(value => `opt:${value}`)
]);
const isNegated=(text,index)=>/\b(?:no|not|without|doesn.t (?:have|support)|does not (?:have|support))\b[^.!?\n]{0,45}$/i.test(text.slice(Math.max(0,index-65),index));
export function auditFeatureEvidence(plugin) {
 discardSyntheticLatency(plugin);
 const resolvedLatency = resolveCatalogLatency(plugin);
 for (const [rate, cell] of Object.entries(resolvedLatency)) {
  if (!cell?.conflict && !cell?.uncertain) continue;
  const { source, ...current } = cell;
  plugin.latency = { ...plugin.latency, [rate]: source && source !== plugin.latency?.source ? cell : current };
 }
 if (plugin.latencyInfo && (plugin.latencyInfo.reports || Object.values(resolvedLatency).some(cell=>cell?.conflict||cell?.uncertain))) {
  plugin.latencyInfo = presentLatencyInfo(plugin.latencyInfo, resolvedLatency);
 }
 const raw=[...(plugin.unverifiedTags||[]),...(plugin.tags||[])].filter(t=>t!=='techno:digital');
 const previous=plugin.featureEvidence||{};
 const reviewed=Object.fromEntries(Object.entries(previous).filter(([tag,e])=>knownTags.has(tag)&&e?.method==='reviewed-source'&&typeof e.present==='boolean'&&e.url));
 const source=`${plugin.name}\n${plugin.description||''}`;
 const evidence={...Object.fromEntries(Object.entries(previous).filter(([tag])=>!knownTags.has(tag)&&tag!=='techno:digital')),...reviewed},tags=[];
 const add=(tag,proof)=>{
  if(evidence[tag]?.present===false)return;
  tags.push(tag);
  const old=previous[tag];
  const same=old?.method===proof.method&&old?.url===proof.url&&old?.excerpt===proof.excerpt&&old?.present===proof.present;
  evidence[tag]=evidence[tag]||(same?{...old,...proof}:proof);
 };
 for(const [fid,facet] of Object.entries(FACETS)){
  if(fid==='coloration'||!facet.for.includes(plugin.category))continue;
  for(const [vid,[,patterns]] of Object.entries(facet.values)){
   const tag=`${fid}:${vid}`;
   for(const pattern of strict[tag]||patterns){
    const match=pattern.exec(source);if(!match||isNegated(source,match.index)||!plugin.url)continue;
    add(tag,{present:true,method:'product-description',url:plugin.url,excerpt:source.slice(Math.max(0,match.index-60),match.index+100).trim(),checkedAt:plugin.checkedAt});break;
   }
  }
 }
 for(const [key,[,patterns]] of Object.entries(COMMON)){
  const tag=`opt:${key}`;
  for(const pattern of strict[tag]||patterns){
   const match=pattern.exec(source);if(!match||isNegated(source,match.index)||!plugin.url)continue;
   add(tag,{present:true,method:'product-description',url:plugin.url,excerpt:source.slice(Math.max(0,match.index-60),match.index+100).trim(),checkedAt:plugin.checkedAt});break;
  }
 }
 const color=plugin.colorationInfo;
 if(color?.url&&color.kind){const tag=`coloration:${color.kind}`;add(tag,{present:true,method:color.method,url:color.url,excerpt:color.noteFr,checkedAt:color.checkedAt});}
 // La source chiffrée officielle reste une preuve indépendante du texte commercial.
 const zero=Object.values(plugin.latency||{}).some(v=>v&&typeof v==='object'&&(v.samples===0||v.variants?.some(x=>x.samples===0)));
 if(zero&&plugin.latency?.source) add('opt:zl',{present:true,method:'latency-table',url:plugin.latency.source,excerpt:'Au moins un mode ou une fréquence possède une latence nulle dans le tableau officiel.',checkedAt:plugin.checkedAt});
 for(const [tag,proof] of Object.entries(reviewed))if(proof.present)add(tag,proof);
 plugin.tags=[...new Set(tags)];
 plugin.featureEvidence=evidence;
 // Keep displaced evidence outside the active lookup used by the site.
 const displaced=Object.entries(previous).filter(([tag, fact])=>knownTags.has(tag)&&fact&&!evidence[tag]);
 if(displaced.length) {
  const history={...plugin.unverifiedFeatureEvidence};
  for(const [tag, fact] of displaced) {
   const entries=history[tag]||[];
   if(!entries.some(entry=>JSON.stringify(entry)===JSON.stringify(fact))) history[tag]=[...entries,fact];
  }
  plugin.unverifiedFeatureEvidence=history;
 }
 plugin.unverifiedTags=[...new Set(raw)].filter(tag=>!plugin.tags.includes(tag)&&!reviewed[tag]);
 // Les extraits de catalogue masqué ne décrivent pas le plugin consulté.
 if(plugin.latencyInfo&&/document(?:Name|UrlPath|PageDescription)|subscriptionPlans|skuInStoreFrom|isLow["\\]/i.test(plugin.latencyInfo.excerpt||'')){
  plugin.unverifiedLatencyInfo=plugin.latencyInfo;delete plugin.latencyInfo;
  if(!plugin.latency?.source) delete plugin.latency;
 } else if(plugin.latencyInfo) delete plugin.unverifiedLatencyInfo;
 plugin.featureReview={version:1,method:'product-scoped-evidence',pending:plugin.unverifiedTags.length};
 return plugin;
}
