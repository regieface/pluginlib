import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMeldaFree,parseKhsFree,applyFreeProductMetadata} from './free-products.mjs';
import {inferFamily} from './category-evidence.mjs';
import {productStatement} from './source-statements.mjs';
test('les listes gratuites ignorent les liens commerciaux hors de la liste',()=>{
 const khs=parseKhsFree('<nav><a href="/products/phase_plant">Phase Plant</a></nav><ul class="grid effects"><li><a href="/products/compactor">Compactor</a></li></ul>','https://kilohearts.com');
 assert.deepEqual(khs,[{name:'Compactor',url:'https://kilohearts.com/products/compactor'}]);
 assert.deepEqual(parseMeldaFree('<h4><a href="/MAnalyzer">MAnalyzer</a></h4><a href="/MCompare">MCompare</a>','https://www.meldaproduction.com'),[{name:'MAnalyzer',url:'https://www.meldaproduction.com/MAnalyzer'}]);
});
test('une édition gratuite ne reprend pas le prix de sa mise à niveau ni celui d’un autre plugin',()=>{
 const catalog={collections:[{id:'melda',vendor:'MeldaProduction',products:[{name:'MAnalyzer',url:'https://www.meldaproduction.com/MAnalyzer'}],source:'https://www.meldaproduction.com/MFreeFXBundle',freeLabel:'Gratuit · mise à niveau optionnelle'}]};
 const p={vendor:'MeldaProduction',url:'https://meldaproduction.com/MAnalyzer/',pricing:{normal:149},catalogStatus:'commercial'};
 applyFreeProductMetadata(p,catalog);assert.equal(p.catalogStatus,'free');assert.equal(p.pricing,undefined);assert.equal(p.freeEditionInfo.upgradeIncluded,false);
 const paid={vendor:'MeldaProduction',url:'https://www.meldaproduction.com/MCompare',catalogStatus:'commercial',pricing:{normal:59}};applyFreeProductMetadata(paid,catalog);assert.equal(paid.pricing.normal,59);assert.equal(paid.catalogStatus,'commercial');
});
test('la définition exacte après une accroche permet de classer les réverbes',()=>{
 assert.equal(inferFamily({name:'Valhalla Room',vendor:'Valhalla DSP',description:'A world of sound. ValhallaRoom is a stereo algorithmic reverb.'}).category,'reverb');
 assert.equal(inferFamily({name:'Valhalla Plate',description:'Bright and dense. ValhallaPlate is our algorithmic plate reverberation.'}).category,'reverb');
 assert.equal(inferFamily({name:'Opaque',description:'A world of sound. AnotherPlugin is a reverb.'}).category,'other');
 assert.equal(inferFamily({name:'Opaque',description:'A world of sound. Opaque works with a reverb.'}).category,'other');
 assert.equal(productStatement('<p>ValhallaRoom is a stereo algorithmic reverb.</p>',{name:'Valhalla Room',vendor:'Valhalla DSP'}).description,'ValhallaRoom is a stereo algorithmic reverb.');
});
test('les listes de plugins et les fonctions secondaires ne définissent pas une famille',()=>{
 assert.equal(inferFamily({name:'Mix Tape',description:'10 plug-ins included: Compressor, EQ and Channel Strip.'}).category,'other');
 assert.equal(inferFamily({name:'Srsly3',description:'Srsly3 is the same thing as Srsly2, with different filters.'}).category,'other');
 assert.equal(inferFamily({name:'Deconvolver',description:'Deconvolution software for impulse response recovery of reverbs.'}).category,'other');
 assert.equal(inferFamily({name:'Precision Multiband',description:'Five bands of compression, expansion and gating.'}).category,'multiband');
 assert.equal(inferFamily({name:'Opaque',description:'Rhythmic delays and reverbs.'}).category,'other');
});
