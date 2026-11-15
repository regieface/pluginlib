import test from 'node:test';
import assert from 'node:assert/strict';
import {isPriceStale} from '../catalog.mjs';
import {parseRetailerPricing,collectRetailerPrice,needsRetailerPrice,findManufacturerCatalog,findRetailerLinks,retailerProductMatches,selectPriceCandidates} from './retailer-prices.mjs';
const plugin={id:'eventide--sp2016-reverb',vendor:'Eventide',name:'SP2016 Reverb'};
const url='https://www.pluginboutique.com/products/4747-SP2016-Reverb';
const page=(price=52,regular=99) => `<h1>SP2016 Reverb</h1><div data-product-purchase-options-target="otpPrice"><div><span>€${price}</span>${regular ? `<span class="line-through">€${regular}</span>` : ''}</div></div><div class="recommendations"><span class="line-through">€999</span></div><div data-event='${JSON.stringify({event:'view_item',ecommerce:{items:[{item_id:'4747',item_brand:'Eventide',item_name:'SP2016 Reverb',currency:'EUR',price,discount:47}]}})}'></div>`;
const registry={retailers:[{name:'Thomann',hosts:['www.thomann.de']},{name:'Plugin Boutique',hosts:['www.pluginboutique.com']}],products:{[plugin.id]:['https://www.thomann.de/fr/sp2016.htm',url]}};

test('Plugin Boutique : prix normal et promo du produit exact, devise conservée',()=>{
 const pricing=parseRetailerPricing(plugin,page(),url,'Plugin Boutique');
 assert.equal(pricing.normal,99);assert.equal(pricing.promo,52);assert.equal(pricing.currency,'EUR');
 assert.equal(parseRetailerPricing(plugin,page(),url.replace('4747-','9999-'),'Plugin Boutique'),null);
 assert.equal(parseRetailerPricing({...plugin,name:'Blackhole'},page(),url,'Plugin Boutique'),null);
 assert.equal(parseRetailerPricing(plugin,page(52,null),url,'Plugin Boutique').normal,null);
});

test('correspondance exacte : rejeter upgrades, variantes et numéros de version voisins',()=>{
 for(const title of ['Eventide SP2016 Reverb Upgrade','Eventide SP2016 Reverb Immersive','Eventide SP2016 Reverb 2','Eventide SP2016 Reverb Bundle']) assert.equal(retailerProductMatches(plugin,title),false);
 assert.equal(retailerProductMatches({vendor:'FabFilter',name:'Pro-Q 4'},'FabFilter Pro-Q 40'),false);
});

test('annuaire et catalogue : marque exacte puis lien du produit, sans offre différente',()=>{
 const index='<a aria-label="Brand Eventide" href="/manufacturers/186-Eventide">Logo</a><a aria-label="Brand Eventide Extras" href="/manufacturers/999-Extras">Logo</a>';
 assert.equal(findManufacturerCatalog('Eventide',index,'https://www.pluginboutique.com/manufacturers'),'https://www.pluginboutique.com/manufacturers/186-Eventide');
 const html='<a aria-label="View SP2016 Reverb" href="/products/4747-SP2016-Reverb">Image</a><a aria-label="View SP2016 Reverb Upgrade" href="/products/4748-Upgrade">Image</a>';
 assert.deepEqual(findRetailerLinks(plugin,html,'https://www.pluginboutique.com/manufacturers/186-Eventide','Eventide'),[url]);
 const branded='<a aria-label="View FabFilter Pro-Q 4" href="/products/999-Pro-Q-4">Image</a>';
 assert.deepEqual(findRetailerLinks({vendor:'FabFilter',name:'FabFilter Pro-Q 4'},branded,'https://www.pluginboutique.com/manufacturers/1-FabFilter','FabFilter'),['https://www.pluginboutique.com/products/999-Pro-Q-4']);
});

test('revendeur de secours après une erreur ; le lien vérifié est réutilisé directement',async()=>{
 const requests=[];
 const fetchPage=async(u)=>{requests.push(u);return {url:u,status:u.includes('thomann')?403:200,text:page()};};
 const result=await collectRetailerPrice(plugin,registry,{fetchPage});
 assert.equal(result.pricing.sourceName,'Plugin Boutique');assert.equal(result.pricing.normal,99);assert.equal(result.pricing.promo,52);
 assert.deepEqual(requests,registry.products[plugin.id]);assert(result.links.includes(url));
});

test('panne des revendeurs : conserver montants, source et date du dernier relevé',async()=>{
 const old={normal:99,promo:39,currency:'EUR',sourceType:'retailer',sourceName:'Thomann',url:registry.products[plugin.id][0],checkedAt:'2026-11-01T12:00:00Z'};
 const result=await collectRetailerPrice({...plugin,pricing:old},registry,{fetchPage:async(u)=>({url:u,status:503,text:''}),now:'2026-11-15T12:00:00Z'});
 assert.equal(result.pricing.normal,99);assert.equal(result.pricing.promo,39);assert.equal(result.pricing.checkedAt,old.checkedAt);assert.equal(result.pricing.sourceName,'Thomann');assert.equal(result.pricing.stale,true);
});

test('priorité éditeur et vieillissement après quatorze jours ou expiration',()=>{
 const now=Date.parse('2026-11-15T12:00:00Z');const price={checkedAt:'2026-11-15T10:00:00Z',normal:99};
 assert.equal(needsRetailerPrice({...plugin,pricing:price},now),false);
 assert.equal(needsRetailerPrice({...plugin,pricing:{...price,stale:true}},now),true);
 assert.equal(isPriceStale(price,now),false);
 assert.equal(isPriceStale({...price,checkedAt:'2026-11-01T12:00:00Z'},now),true);
 assert.equal(isPriceStale({...price,validUntil:'2026-11-14T12:00:00Z'},now),true);
 assert.equal(needsRetailerPrice({...plugin,catalogStatus:'superseded'},now),false);
});

test('découverte : conserver le lien uniquement après validation de sa fiche produit',async()=>{
 const catalog='https://www.pluginboutique.com/manufacturers/186-Eventide';
 const config={retailers:[{name:'Plugin Boutique',hosts:['www.pluginboutique.com'],catalogs:{Eventide:catalog}}],products:{}};
 const listing='<a aria-label="View SP2016 Reverb" href="/products/4747-SP2016-Reverb">Image</a>';
 const fetchPage=async(u)=>({url:u,status:200,text:u===catalog?listing:page()});
 const result=await collectRetailerPrice(plugin,config,{fetchPage});assert(result.links.includes(url));
 const failed=await collectRetailerPrice(plugin,config,{fetchPage:async(u)=>({url:u,status:200,text:u===catalog?listing:'<h1>Other product</h1>'})});
 assert.deepEqual(failed.links,[]);assert.equal(failed.pricing,undefined);
});

test('quota : revérifier tous les liens connus et faire tourner seulement les découvertes',()=>{
 const list=[{id:'new'},{id:'old',retailerPriceCheck:{checkedAt:'2026-11-01'}},{id:'known1'},{id:'known2'}];
 assert.deepEqual(selectPriceCandidates(list,{products:{known1:['https://shop.test/1'],known2:['https://shop.test/2']}},1).map(p=>p.id),['known1','known2','new']);
});
