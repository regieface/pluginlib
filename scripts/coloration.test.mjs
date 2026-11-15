import test from 'node:test';import assert from 'node:assert/strict';
import {classify,labels} from './classify.mjs';import {applyColorationMetadata} from '../coloration.mjs';
const base={name:'Compressor',url:'https://vendor.test/product',tags:['techno:digital','opt:sidechain']};
const reviewed=(kind)=>({kind,method:'reviewed-source',url:base.url,noteFr:'Comportement vérifié dans le manuel.'});
test('clean, transparent et look-ahead ne sont plus une preuve automatique de neutralité',()=>{
 const c=classify({name:'Tube Compressor',text:'Clean gain and transparent compression curve with look-ahead and harmonic distortion.'});
 assert(!c.tags.includes('techno:digital'));assert(!c.tags.includes('coloration:transparent'));assert(!labels().facets.techno.values.digital);
 const p=applyColorationMetadata({...base,description:'Clean look-ahead compression.'});assert(!p.tags.includes('techno:digital'));assert(!p.colorationInfo);
});
test('CLA-3A : la mention transparent ne masque pas la distorsion harmonique',()=>{
 const p=applyColorationMetadata({...base,description:'Transparent compression curve with subtle harmonic distortion.'});
 assert(p.tags.includes('coloration:colored'));assert(!p.tags.includes('coloration:transparent'));assert(p.tags.includes('opt:sidechain'));
});
test('absence de distorsion, anti-aliasing et oversampling ne prouvent pas une coloration ou une transparence',()=>{
 for(const description of ['Clean compressor without harmonic distortion.','Oversampling and low aliasing.','No saturation stage.'])assert(!applyColorationMetadata({...base,description}).colorationInfo);
});
test('mode neutre et saturation optionnelle : catégorie mixte exclusivement',()=>{
 const p=applyColorationMetadata({...base,description:'Clean compression and tube saturation.',colorationInfo:reviewed('mixed')});
 assert(p.tags.includes('coloration:mixed'));assert(!p.tags.includes('coloration:transparent'));assert(!p.tags.includes('coloration:colored'));
});
test('la transparence exige une source vérifiée et reste stable lors des mises à jour',()=>{
 const p=applyColorationMetadata({...base,colorationInfo:reviewed('transparent')});const copy=structuredClone(p);applyColorationMetadata(p);
 assert.deepEqual(p,copy);assert(p.tags.includes('coloration:transparent'));assert.equal(p.colorationInfo.url,base.url);
 assert(!applyColorationMetadata({...base,colorationInfo:{kind:'transparent',method:'description'}}).tags.includes('coloration:transparent'));
});
test('clipper ou saturation : ne jamais les faire entrer automatiquement dans transparent',()=>{
 for(const name of ['Master Clipper','Saturator','Waveshaper']){
  const p=applyColorationMetadata({...base,name,description:'Transparent sound with clean processing.'});assert(p.tags.includes('coloration:colored'));assert(!p.tags.includes('coloration:transparent'));
 }
});
