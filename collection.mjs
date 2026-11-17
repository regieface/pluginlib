// Les droits personnels restent dans le navigateur. Les listes de plans sont publiques.
import {resolveCollectionAliases} from './catalog.mjs';
export const VALID_LICENSE_STATUS=new Set(['unknown','owned','subscription','former','trial','wishlist','not_owned']);
const inactiveSubscriptionStatuses = new Set(['inactive', 'expired', 'cancelled', 'canceled', 'suspended']);
const key=s=>String(s||'').normalize('NFKD').replace(/[™®]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const url=s=>{try{const u=new URL(s);return u.origin.replace('://www.','://')+u.pathname.replace(/\/$/,'')}catch{return ''}};
export const subscriptionKey=s=>`${key(s.vendor)}:${key(s.plan)}`;
export function planFor(subscription,plans){return plans.find(p=>(subscription.id && p.id===subscription.id)||subscriptionKey(p)===subscriptionKey(subscription));}
const planIndexes=new WeakMap();
export function isPlanMember(plugin,plan){
 if(plugin.vendor!==plan.vendor)return false;
 if(!planIndexes.has(plan))planIndexes.set(plan,{urls:new Set(plan.products.map(p=>url(p.url)).filter(Boolean)),names:new Set(plan.products.map(p=>key(p.name)))});
 const index=planIndexes.get(plan);return index.urls.has(url(plugin.url))||[plugin.name,...(plugin.aliases||[])].some(n=>index.names.has(key(n)));
}
export function normalizeCollection(input,plugins,plans){
 if(!input||typeof input!=='object'||(!input.status&&!Array.isArray(input.owned)&&!Array.isArray(input.subscriptions)))throw Error('Fichier de collection non reconnu');
 const status=Object.fromEntries(Object.entries(input.status||{}).filter(([id,value])=>id.includes('--')&&VALID_LICENSE_STATUS.has(value)));
 for(const id of input.owned||[])if(typeof id==='string'&&id.includes('--')&&!status[id])status[id]='owned';
 const subscriptions=[...new Map((input.subscriptions||[]).filter(s=>s&&typeof s.vendor==='string'&&typeof s.plan==='string').map(s=>[subscriptionKey(s),{...s}])).values()];
 const normalized=resolveCollectionAliases(status,plugins);
 // L'export contient aussi les statuts calculés pour rester compatible avec v2.
 // Ils ne deviennent pas des licences permanentes indépendantes du plan.
 for(const s of subscriptions){const plan=planFor(s,plans);if(!plan)continue;for(const p of plugins)if(isPlanMember(p,plan)&&(normalized[p.id]==='subscription'&&s.status==='active'||normalized[p.id]==='former'&&inactiveSubscriptionStatuses.has(s.status)))delete normalized[p.id];}
 return {status:normalized,subscriptions,unmatchedLicenses:Array.isArray(input.unmatchedLicenses)?input.unmatchedLicenses:[],licenseDetails:input.licenseDetails&&typeof input.licenseDetails==='object'?input.licenseDetails:{}};
}
export function mergeCollection(current,incoming,plugins,plans){
 const next=normalizeCollection(incoming,plugins,plans);
 const subscriptionsByKey=new Map((current.subscriptions||[]).map(s=>[subscriptionKey(s),s]));
 for(const s of next.subscriptions){
  const id=subscriptionKey(s);
  subscriptionsByKey.set(id,{...subscriptionsByKey.get(id),...s});
 }
 const subscriptions=[...subscriptionsByKey.values()];
 const status={...current.status,...next.status};
 // Un ancien abonnement importé ne révoque pas une licence perpétuelle locale.
 for(const [id,value] of Object.entries(next.status))if(value==='former'&&current.status[id]==='owned')status[id]='owned';
 const importedStatus=resolveCollectionAliases(incoming.status||{},plugins);
 // Une nouvelle déclaration de plan remplace ses anciens statuts calculés.
 for(const s of next.subscriptions){const plan=planFor(s,plans);if(!plan)continue;for(const p of plugins)if(isPlanMember(p,plan)&&next.status[p.id]===undefined&&(status[p.id]==='subscription'||s.status==='active'&&importedStatus[p.id]==='subscription'&&status[p.id]!=='owned'))delete status[p.id];}
 return {status:resolveCollectionAliases(status,plugins),subscriptions,unmatchedLicenses:incoming.unmatchedLicenses===undefined?(current.unmatchedLicenses||[]):next.unmatchedLicenses,licenseDetails:{...current.licenseDetails,...next.licenseDetails}};
}
export function collectionStatus(plugin,collection,plans){
 const manual=collection.status[plugin.id];if(manual==='owned'||manual==='subscription')return manual;
 let former=manual==='former';for(const s of collection.subscriptions){const plan=planFor(s,plans);if(!plan||!isPlanMember(plugin,plan))continue;if(s.status==='active')return 'subscription';if(inactiveSubscriptionStatuses.has(s.status))former=true;}
 return former?'former':manual||'unknown';
}
export function matchesCollectionScope(status, scope) {
 const active=status==='owned'||status==='subscription';
 if(scope==='owned')return active;
 if(scope==='archives')return status==='former';
 if(scope==='wishlist')return status==='wishlist';
 if(scope==='discover')return !active&&status!=='former';
 return true;
}
export function exportCollection(collection,plugins,plans){
 const status={...collection.status};for(const p of plugins){const value=collectionStatus(p,collection,plans);if(value!=='unknown')status[p.id]=value;}
 return {app:'PluginLib',version:3,exportedAt:new Date().toISOString(),status,subscriptions:collection.subscriptions,unmatchedLicenses:collection.unmatchedLicenses||[],licenseDetails:collection.licenseDetails||{}};
}
