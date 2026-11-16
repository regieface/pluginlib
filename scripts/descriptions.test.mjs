import test from 'node:test';import assert from 'node:assert/strict';
import {productDescription} from '../descriptions.mjs';
import {publisherPresentation,synthesisSource} from './publisher-presentations.mjs';
test('deux EQ affichent leurs particularités sourcées plutôt qu’une définition identique',()=>{
 const summaries={a:{text:'Modélisation du Neumann W495 à trois bandes.',sourceUrl:'https://manufacturer.test/a',sourceHash:'proof'},b:{text:'Bandes dynamiques dessinées dans le spectre.',sourceUrl:'https://manufacturer.test/b',sourceHash:'proof'}};
 assert.notEqual(productDescription({id:'a',category:'eq'},summaries).text,productDescription({id:'b',category:'eq'},summaries).text);
 assert.equal(productDescription({id:'a'},summaries).url,summaries.a.sourceUrl);
 assert.equal(productDescription({id:'a'},summaries).language,'fr');
});
test('une famille seule ou une synthèse sans source ne fabrique pas de descriptif',()=>{
 assert.equal(productDescription({id:'a',category:'eq',description:'Our entire range of products.'},{a:{text:'Invented'}}).kind,'missing');
});
test('la collecte de présentation ignore témoignages, menus et produits voisins',()=>{
 const p={name:'UniqueComp',url:'https://manufacturer.test/unique',description:''};
 const source=publisherPresentation(p,'<nav><p>UniqueComp has a magic filter.</p></nav><blockquote><p>UniqueComp is my favorite effect.</p></blockquote><p>UniqueComp combines optical compression with an external sidechain.</p><p>OtherEQ has 24 bands.</p>');
 assert.match(source.text,/external sidechain/);assert.doesNotMatch(source.text,/magic filter|favorite|OtherEQ/);
});
test('la synthèse conserve les fonctions distinctives plutôt que l’accroche commerciale',()=>{
 const text=synthesisSource('The best of the best. UniqueComp is a studio processor. It offers RMS and peak detection, an external sidechain and parallel compression.');
 assert.match(text,/RMS and peak/);assert.doesNotMatch(text,/best of the best/);
});
