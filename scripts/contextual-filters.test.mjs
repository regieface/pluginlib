import test from 'node:test';import assert from 'node:assert/strict';
import {defaultSelections,contextualCounts,clearIrrelevantFacets,matchesPluginSelections} from '../filters.mjs';
const facets={techno:{for:['comp','limiter']},vitesse:{for:['comp','limiter','transient']},espace:{for:['delay','reverb']}};
const data=[
 {id:'c1',vendor:'A',category:'comp',catalogStatus:'commercial',tags:['techno:fet','vitesse:rapide']},
 {id:'c2',vendor:'B',category:'comp',catalogStatus:'commercial',tags:['techno:vca','vitesse:lente']},
 {id:'d1',vendor:'A',category:'delay',catalogStatus:'commercial',tags:['espace:bande']},
 {id:'d2',vendor:'C',category:'delay',catalogStatus:'commercial',tags:['espace:algorithmique']},
 {id:'r1',vendor:'C',category:'reverb',catalogStatus:'commercial',tags:['espace:plate']}
];
test('délai/écho : pas d’attaque ni de technologie de compresseur ; types d’espace pertinents',()=>{
 const s=defaultSelections(Object.keys(facets));s.family.include=['delay'];
 assert.equal(contextualCounts(data,s,'vitesse',facets).size,0);assert.equal(contextualCounts(data,s,'techno',facets).size,0);
 assert.deepEqual([...contextualCounts(data,s,'espace',facets).keys()],['espace:bande','espace:algorithmique']);
});
test('passer de compresseur à délai retire les inclusions et exclusions d’attaque',()=>{
 const s=defaultSelections(Object.keys(facets));s.family.include=['delay'];s.vitesse={include:['vitesse:rapide'],exclude:['vitesse:lente']};s.techno.include=['techno:fet'];
 assert.deepEqual(clearIrrelevantFacets(data,s,facets),['techno','vitesse']);assert.deepEqual(s.vitesse,{include:[],exclude:[]});assert.equal(data.filter(p=>matchesPluginSelections(p,s)).length,2);
});
test('une sélection mult famille conserve un critère pertinent pour l’une des familles',()=>{
 const s=defaultSelections(Object.keys(facets));s.family.include=['delay','comp'];s.vitesse.include=['vitesse:rapide'];
 assert.deepEqual(clearIrrelevantFacets(data,s,facets),[]);assert.equal(contextualCounts(data,s,'vitesse',facets).get('vitesse:rapide'),1);
});
test('fabricants et compteurs changent selon la famille et les critères sélectionnés',()=>{
 const s=defaultSelections(Object.keys(facets));s.family.include=['comp'];s.techno.include=['techno:fet'];
 assert.deepEqual([...contextualCounts(data,s,'maker',facets)],[['A',1]]);
});
test('le menu courant ignore sa propre sélection pour permettre plusieurs choix avec OU',()=>{
 const s=defaultSelections(Object.keys(facets));s.family.include=['comp'];s.maker.include=['A'];
 assert.deepEqual([...contextualCounts(data,s,'maker',facets)],[['A',1],['B',1]]);
});
test('les familles restent modifiables malgré un critère d’attaque actif',()=>{
 const s=defaultSelections(Object.keys(facets));s.family.include=['comp'];s.vitesse.include=['vitesse:rapide'];
 assert.equal(contextualCounts(data,s,'family',facets).get('delay'),2);
});
test('des tags d’une autre dimension ne rendent pas un critère disponible',()=>{
 const s=defaultSelections(Object.keys(facets));
 assert.equal(contextualCounts([{...data[0],tags:['opt:zl']}],s,'vitesse',facets).size,0);
});
