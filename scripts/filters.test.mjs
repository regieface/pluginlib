import test from 'node:test';import assert from 'node:assert/strict';
import {emptySelection,defaultSelections,changeSelection,matchesPluginSelections} from '../filters.mjs';
const plugin={vendor:'Waves',category:'comp',platforms:['macos','windows'],catalogStatus:'commercial',tags:['techno:fet','vitesse:rapide']};
test('plusieurs fabricants : inclure plusieurs choix ou afficher tous sauf les exclus',()=>{
 const s=defaultSelections();s.maker.include=['Waves','Eventide'];
 assert(matchesPluginSelections(plugin,s));assert(matchesPluginSelections({...plugin,vendor:'Eventide'},s));assert(!matchesPluginSelections({...plugin,vendor:'Softube'},s));
 s.maker={include:[],exclude:['Waves','Softube']};assert(!matchesPluginSelections(plugin,s));assert(matchesPluginSelections({...plugin,vendor:'McDSP'},s));
});
test('sélection et exclusion sont mutuellement exclusives ; décocher rétablit les résultats',()=>{
 let s=changeSelection(emptySelection(),'Waves','include',true);s=changeSelection(s,'Waves','exclude',true);
 assert.deepEqual(s,{include:[],exclude:['Waves']});assert.deepEqual(changeSelection(s,'Waves','exclude',false),emptySelection());
});
test('OU dans un critère, ET entre critères, exclusions prioritaires',()=>{
 const s=defaultSelections(['techno','vitesse']);s.techno.include=['techno:fet','techno:vca'];s.vitesse.include=['vitesse:rapide'];
 assert(matchesPluginSelections(plugin,s));assert(!matchesPluginSelections({...plugin,tags:['techno:fet','vitesse:lente']},s));
 s.techno.exclude=['techno:fet'];assert(!matchesPluginSelections(plugin,s));
});
test('plateformes : tous par défaut, compatibilités multiples et inconnues incluses',()=>{
 const s=defaultSelections();assert(matchesPluginSelections(plugin,s));assert(matchesPluginSelections({...plugin,platforms:[]},s));
 s.platform.include=['macos','linux'];assert(matchesPluginSelections(plugin,s));assert(!matchesPluginSelections({...plugin,platforms:['windows']},s));
 s.platform.exclude=['windows'];assert(!matchesPluginSelections(plugin,s));
});
test('anciens produits masqués par défaut, accessibles en retirant leur exclusion',()=>{
 const s=defaultSelections();assert(!matchesPluginSelections({...plugin,catalogStatus:'superseded'},s));s.catalogStatus.exclude=[];assert(matchesPluginSelections({...plugin,catalogStatus:'superseded'},s));
});
