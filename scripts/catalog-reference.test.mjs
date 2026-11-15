// Régressions sur les vrais produits signalés : vérifier aussi les fonctions présentes.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {defaultSelections,matchesPluginSelections} from '../filters.mjs';
import {shortDescription} from '../descriptions.mjs';
const {plugins}=JSON.parse(fs.readFileSync(new URL('../data/plugins.json',import.meta.url)));
const byId=new Map(plugins.map(p=>[p.id,p]));
test('références catalogue : bx_tuner et MicroShift ont leur fonction principale documentée',()=>{
 for(const [id,category] of [['plugin-alliance--bx-tuner','tuner'],['soundtoys--little-microshift','stereo'],['soundtoys--microshift','stereo']]){const p=byId.get(id);assert(p,`Produit manquant : ${id}`);assert.equal(p.category,category);assert.equal(p.categoryEvidence.method,'reviewed-source');assert(p.categoryEvidence.url);}
});
test('Pro-Q 4 est effectivement retrouvable parmi les EQ dynamiques',()=>{
 const p=byId.get('fabfilter--fabfilter-pro-q-4');assert(p);assert.equal(p.category,'eq');assert(p.tags.includes('eqtype:dynamique'));assert.equal(p.featureEvidence['eqtype:dynamique'].method,'reviewed-source');
 const selections=defaultSelections(['eqtype']);selections.family.include=['eq'];selections.eqtype.include=['eqtype:dynamique'];assert(matchesPluginSelections(p,selections));
 assert.match(shortDescription(p),/Égaliseur dynamique/);
});
test('CLA-2A reste optique sans Mid/Side ni entrée de side-chain externe',()=>{
 const p=byId.get('waves--cla-2a-compressor-limiter');assert(p);assert.equal(p.category,'comp');assert(p.tags.includes('techno:opto'));for(const t of ['techno:varimu','opt:ms','opt:sidechain'])assert(!p.tags.includes(t));
});
test('ZL Audio : cinq produits actuels gratuits et une version explicitement abandonnée',()=>{
 const zl=plugins.filter(p=>p.vendor==='ZL Audio');assert.equal(zl.length,6);
 const current=zl.filter(p=>p.catalogStatus==='free');assert.equal(current.length,5);
 for(const p of current){assert(p.categoryEvidence.url);assert.deepEqual(p.platforms,['macos','windows','linux']);}
 const old=byId.get('zl-audio--zl-equalizer-legacy');assert.equal(old.catalogStatus,'discontinued');
 const s=defaultSelections();assert(!matchesPluginSelections(old,s));
 for(const id of ['zl-audio--zl-equalizer-2','zl-audio--zl-spectrum-equalizer'])assert(byId.get(id).tags.includes('eqtype:dynamique'));
});
test('toute famille précise possède une source propre ; les familles non confirmées restent à vérifier',()=>{
 for(const p of plugins){if(p.category==='other')assert.equal(p.categoryEvidence.status,'unconfirmed');else{assert.equal(p.categoryEvidence.category,p.category);assert.equal(p.categoryEvidence.status,'documented');assert(p.categoryEvidence.url);assert(p.categoryEvidence.excerpt);}}
});
test('audit indépendant : aucun tarif payant sur les éditions gratuites TDR et Melda',()=>{for(const id of ['tokyo-dawn-records--tdr-molotok','tokyo-dawn-records--tdr-prism','tokyo-dawn-records--tdr-collector','meldaproduction--msoundfactoryplayer']){const p=byId.get(id);assert(p);assert.equal(p.catalogStatus,'free');assert.equal(p.pricing,undefined);assert.equal(p.statusEvidence.method,'reviewed-source');}});
test('les applications, instruments et modules restent archivés, exclus des effets par défaut',()=>{for(const [id,type] of [['tokyo-dawn-records--tdr-collector','application'],['universal-audio--luna-free','application'],['plugin-alliance--lion','instrument'],['eventide--generate','instrument'],['softube--intellijel-ufold-ii','module']]){const p=byId.get(id);assert(p);assert.equal(p.recordType,type);assert.equal(p.recordTypeEvidence.method,'reviewed-source');assert(!matchesPluginSelections(p,defaultSelections()));}});
test('les doublons Waves conservent les anciens identifiants et pointent vers une fiche unique',()=>{for(const suffix of ['mono2stereo','surround-downmix','surround-upmix']){const p=byId.get('waves--dts-neural-'+suffix),old=byId.get('waves--dts-neuraltm-'+suffix);assert(p&&old);assert.equal(old.duplicateOf,p.id);assert(p.legacyIds.includes(old.id));assert(p.url);}});
test('StandardCompressor : la bêta ne présente plus l’image de StandardCLIP',()=>{const p=byId.get('sir-audio-tools--standardcompressor');assert.equal(p.image,null);assert.equal(p.catalogStatus,'beta');assert(p.imageEvidence.url);});
test('HyperspaceCore et Urban Puncher : gratuité et publicité décrites sans ancien tarif fixe',()=>{for(const id of ['united-plugins--hyperspacecore','united-plugins--urban-puncher']){const p=byId.get(id);assert.equal(p.catalogStatus,'free');assert.equal(p.pricing,undefined);}assert.match(byId.get('united-plugins--urban-puncher').freeLabel,/publicité/);});
test('catalogue entier : identifiants uniques et critères actifs accompagnés de preuves',()=>{const ids=new Set();for(const p of plugins){assert(!ids.has(p.id),`Identifiant dupliqué : ${p.id}`);ids.add(p.id);for(const tag of p.tags){assert(p.featureEvidence?.[tag]?.url,`${p.id} : ${tag} sans source`);assert.equal(p.featureEvidence[tag].present,true);assert(!p.unverifiedTags.includes(tag));}for(const id of p.legacyIds||[])assert.equal(byId.get(id)?.duplicateOf,p.id);}});
