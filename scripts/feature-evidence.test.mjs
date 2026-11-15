import test from 'node:test';import assert from 'node:assert/strict';
import {extractPage} from './parse.mjs';import {auditFeatureEvidence} from './feature-evidence.mjs';
const url='https://www.waves.com/plugins/cla-2a-compressor-limiter';
test('la div masquée du catalogue Waves ne contamine plus la fiche consultée',()=>{
 const page=extractPage('<title>CLA-2A</title><div id=subscriptions-popup-data class=hidden>{"documentName":"Another Plugin","description":"Mid/side, external sidechain, zero latency"}</div><main><h1>CLA-2A</h1><p>Electro-optical tube compressor</p></main>',url,'Waves');
 assert(!/Mid\/side|Another Plugin|documentName|zero latency/i.test(page.metadataText));assert.match(page.metadataText,/Electro-optical/);
 const noMain=extractPage('<div class=hidden>External sidechain</div><div>CLA-2A optical compressor</div>',url,'Waves');assert(!/external sidechain/i.test(noMain.metadataText));
});
test('sidechain interne et tube ne signifient ni entrée externe ni Vari-Mu',()=>{
 const p=auditFeatureEvidence({name:'CLA-2A Compressor',description:'Electro-optical tube compressor with internal sidechain.',url,category:'comp',tags:['opt:ms','opt:sidechain','techno:varimu']});
 assert(p.tags.includes('techno:opto'));assert(!p.tags.includes('techno:varimu'));assert(!p.tags.includes('opt:sidechain'));assert(!p.tags.includes('opt:ms'));assert(p.unverifiedTags.includes('opt:sidechain'));
});
test('preuves positives explicites et négations par fonction',()=>{
 const p=auditFeatureEvidence({name:'Compressor',description:'External sidechain input. Mid/side operation. No variable-mu stage.',url,category:'comp',tags:[]});
 assert(p.tags.includes('opt:sidechain'));assert(p.tags.includes('opt:ms'));assert(!p.tags.includes('techno:varimu'));assert.equal(p.featureEvidence['opt:ms'].url,url);
});
test('une absence vérifiée prévaut et ne reste pas dans les fonctions à vérifier',()=>{
 const p=auditFeatureEvidence({name:'Compressor',description:'External sidechain input.',url,category:'comp',tags:['opt:sidechain'],featureEvidence:{'opt:sidechain':{present:false,method:'reviewed-source',url,excerpt:'No external input.'}}});
 assert(!p.tags.includes('opt:sidechain'));assert(!p.unverifiedTags.includes('opt:sidechain'));assert.equal(p.featureEvidence['opt:sidechain'].present,false);
});
test('latence contaminée retirée mais tableau officiel indépendant préservé',()=>{
 const p=auditFeatureEvidence({name:'CLA-2A',url,category:'comp',tags:[],latencyInfo:{excerpt:'Vocal Bender zero latency documentUrlPath'},latency:{48:{samples:0},source:'https://www.waves.com/support/tech-specs/plugin-latency'}});
 assert(!p.latencyInfo);assert(p.unverifiedLatencyInfo);assert(p.latency);assert(p.tags.includes('opt:zl'));
});
test('audit idempotent : les critères douteux restent isolés lors des mises à jour',()=>{
 const p=auditFeatureEvidence({name:'Compressor',description:'Tube compressor',url,category:'comp',tags:['techno:varimu','opt:sidechain']});const before=structuredClone(p);auditFeatureEvidence(p);assert.deepEqual(p,before);
});

test('une nouvelle latence propre résout le signalement de contamination précédent',()=>{
 const p=auditFeatureEvidence({name:'Compressor',url,category:'comp',tags:[],latencyInfo:{excerpt:'Latency of 64 samples at 48 kHz.',url},unverifiedLatencyInfo:{excerpt:'documentName Other Plugin'}});
 assert(p.latencyInfo);assert(!p.unverifiedLatencyInfo);
});
