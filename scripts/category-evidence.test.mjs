import test from 'node:test';import assert from 'node:assert/strict';
import {inferFamily,auditCategoryEvidence} from './category-evidence.mjs';import {shortDescription} from '../descriptions.mjs';import {extractLinks} from './parse.mjs';
test('accordeur : bx_tuner ne devient ni écho ni correcteur de hauteur',()=>{
 const result=inferFamily({name:'bx_tuner',description:'Accurate tuning for guitar & bass.'});assert.equal(result.category,'tuner');assert.match(shortDescription({name:'bx_tuner',category:result.category}),/reste à compléter/);
});
test('multibande : une bande de focus ou un filtre multibande ne signifie pas compresseur',()=>{
 assert.notEqual(inferFamily({name:'Little MicroShift',description:'Massive Vocal Stereo Width. Includes a multiband focus control.'}).category,'multiband');
 assert.equal(inferFamily({name:'ZL Equalizer 2',description:'Multiband dynamic equalizer.'}).category,'eq');
 assert.equal(inferFamily({name:'FabFilter Saturn 2',vendor:'FabFilter',description:'FabFilter Saturn 2 is a multiband distortion and saturation plugin.'}).category,'saturation');
 assert.equal(inferFamily({name:'Multiband Compressor'}).category,'multiband');
});
test('la marque FabFilter ne classe pas tous ses produits comme filtres',()=>{
 assert.equal(inferFamily({name:'FabFilter Timeless 3',vendor:'FabFilter',description:'FabFilter Timeless 3 is a vintage sounding tape delay plug-in with many modulation options.'}).category,'delay');
 assert.equal(inferFamily({name:'FabFilter Pro-Q 4',vendor:'FabFilter',description:'FabFilter Pro-Q 4 is a high quality equalizer plug-in.'}).category,'eq');
});
test('une compensation de latence ou un alignement temporel ne sont pas un écho créatif',()=>{
 for(const name of ['Latency Delay','Compensation Delay','Precision Time Align'])assert.equal(inferFamily({name}).category,'utility');
 assert.equal(inferFamily({name:'Stereo Delay'}).category,'delay');
});
test('la source d’un circuit, les comparaisons et les mots de navigation ne définissent pas la famille',()=>{
 assert.equal(inferFamily({name:'TapeFat',description:'TapeFat is the tone control from TapeDelay.'}).category,'other');
 assert.equal(inferFamily({name:'Opaque',description:'Our range of delay products.'}).category,'other');
 assert.equal(inferFamily({name:'Opaque',description:'Home EQ Compressor Delay Reverb'}).category,'other');
});
test('echo chamber est une réverbération et les fonctions secondaires ne volent pas la famille',()=>{
 assert.equal(inferFamily({name:'Abbey Road Chambers',description:'Reverberating sounds of an echo chamber, complete with delay cascades.'}).category,'reverb');
 assert.equal(inferFamily({name:'Compressor',description:'Compressor with EQ, metering, and saturation.'}).category,'comp');
});
test('une ancienne famille sans preuve est mise à vérifier durablement, avec un résumé neutre',()=>{
 const p={name:'Opaque',description:'Audio software for professional musicians.',url:'https://v.test/product',category:'delay'};
 auditCategoryEvidence(p);assert.equal(p.category,'other');assert.equal(p.categoryReview.originalCategory,'delay');
 const copy=structuredClone(p);auditCategoryEvidence(p);assert.deepEqual(p,copy);
 assert(!/écho|délai/i.test(shortDescription({...p,description:'Old tape delay feature unclear'})));
});
test('une famille vérifiée conserve sa source lorsque la description courte omet la fonction',()=>{
 const p={name:'MicroShift',description:'Make it wide.',url:'https://soundtoys.test',category:'multiband'};
 const proof={category:'stereo',method:'reviewed-source',url:'https://soundtoys.test/manual',excerpt:'Stereo widening.'};
 auditCategoryEvidence(p,{categoryEvidence:proof});assert.equal(p.category,'stereo');auditCategoryEvidence(p);assert.equal(p.category,'stereo');
});
test('liens HTML minifiés ZL Audio : les href sans guillemets sont collectés',()=>{
 assert.deepEqual(extractLinks('<a href=/plugins/zlequalizer2/>EQ</a><a href="/plugins/zlcompressor/">Comp</a><a href=#top>Top</a>','https://zl-audio.github.io/plugins/'),['https://zl-audio.github.io/plugins/zlequalizer2','https://zl-audio.github.io/plugins/zlcompressor']);
});
