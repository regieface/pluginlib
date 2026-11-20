import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHAIN_COLOR_PRESETS, COLOR_CATEGORIES, COLOR_GROUPS, ROLE_DEFAULT_COLORS,
  suggestChainColor, normalizeChainLabel, validateColorAliases, colorForCategory } from '../lprep/lprep-chain-colors.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';
import { applySessionChainCount, createSessionDraft, planSessionChainCount } from '../lprep/lprep-session-draft.mjs';

const color = (name, role='insert', aliases=[]) => suggestChainColor(name,role,aliases);

test('palette V2 : neuf familles, Monitoring unique et LEAD blanc', () => {
  assert.equal(COLOR_GROUPS.length, 9);
  assert.deepEqual(COLOR_GROUPS.at(-1).entries.map(x=>x.key), ['monitoring']);
  assert.equal(COLOR_CATEGORIES.length, 25);
  assert.equal(color('LEAD'), '#ffffff');
  assert.equal(color('FX1','fx'), '#f95ad8');
  assert.equal(color('MON','monitoring'), '#00c4a1');
});

test('rythmique foncé vers clair : OH et SN comme DRUM, PERCUS, SPD', () => {
  for (const name of ['OH','OH1','OH-R','Overheads','SN TOP','KICK','BD','HH','TOM FLOOR','DRUM BUS']) {
    assert.equal(color(name),'#a42f3d', name);
  }
  for (const name of ['PERCUS','CONGAS','BONGO','SHAKER']) assert.equal(color(name),'#d6515f', name);
  for (const name of ['SPD','SPD-SX','SAMPLE PAD','SPD1']) assert.equal(color(name),'#f18c94', name);
  assert.notEqual(color('CHOEURS'),color('OH'));
  assert.equal(color('CHOEURS'),'#3657bc');
});

test('familles et nuances : basses, keys, guitares, cuivres, voix, FX', () => {
  const rows = [
    ['BASS','#b96120'], ['SYNTH BASS','#e68a33'],['SUB','#f4b16a'],
    ['KEYS','#378cb9'],['SYNTH','#79badd'],['SAMPLER','#b5daec'],
    ['GTR','#d4af00'],['AC GTR','#f5de32'],['BANJO','#ffeb83'],
    ['INSTRU','#407c4d'],['VIOLON','#669c65'],['MARIMBA','#a3d0a0'],
    ['TRUMPET','#762f42'],['SAX','#a65a6c'],['HARMONICA','#d597a5'],
    ['BV','#3657bc'],['VOIX FX','#8a9ce2']
  ];
  for(const [name,expected] of rows) assert.equal(color(name), expected, name);
  assert.equal(color('REV 1','fx'),'#bf3197');
  assert.equal(color('DLY 2','fx'),'#e64fc0');
  assert.equal(color('MONITORING','monitoring'),'#00c4a1');
});

test('le dictionnaire personnel est validé, prioritaire et n’altère pas les noms contenant OH', () => {
  const rules=validateColorAliases([{alias:'top sn',category:'drum'},{alias:'Cymb. extra',category:'percus'}]);
  assert.equal(normalizeChainLabel('chœurs'), 'CHOEURS');
  assert.equal(color('Cymb. extra - L','insert',rules), '#d6515f');
  assert.equal(color('TOP SN','insert',[{alias:'TOP SN',category:'percus'}]), '#d6515f');
  assert.throws(()=>validateColorAliases([{alias:'x',category:'drum'}]));
  assert.throws(()=>validateColorAliases([{alias:'OH',category:'unknown'}]));
  assert.deepEqual(validateColorAliases([{alias:'OH',category:'drum'},{alias:'oh',category:'percus'}]),
    [{alias:'OH',category:'percus'}]);
});

test('createChain applique les suggestions sans ignorer une couleur manuelle explicite', () => {
  const controller = new LPrepUIController({idFactory:createSequentialIdFactory('colors')});
  controller.createProject();
  assert.equal(controller.createChain({name:'OH L'}).status,'committed');
  assert.equal(controller.createChain({name:'FX2',role:'fx'}).status,'committed');
  assert.equal(controller.createChain({name:'MON',role:'monitoring'}).status,'committed');
  assert.equal(controller.createChain({name:'OH',color:'#123456'}).status,'committed');
  assert.deepEqual(controller.activeSession.chains.map(x=>x.color), ['#a42f3d','#f95ad8','#00c4a1','#123456']);
  const id=controller.activeSession.chains[0].chainId;
  assert.equal(controller.updateChainSettings(id,{name:'BASS'}).status,'committed');
  assert.equal(controller.activeSession.chains[0].color,'#a42f3d','un renommage ancien préserve sa couleur');
});

test('brouillons : Monitoring reçoit sa nouvelle teinte et les modifications de nombre restent stables',()=>{
  const idFactory=createSequentialIdFactory('colors-draft');
  let d=createSessionDraft({idFactory,environmentProfileId:'test'});
  d=applySessionChainCount(d,planSessionChainCount(d,'monitoring',1,idFactory));
  assert.equal(d.chains[0].color,ROLE_DEFAULT_COLORS.monitoring);
  assert.equal(colorForCategory('spd'),'#f18c94');
  assert.ok(CHAIN_COLOR_PRESETS.some(([label,value])=>label==='SPD' && value==='#f18c94'));
});

test('styles 25% / 40% et sans remplacement bleu des fonds', async()=>{
  const css=await readFile(new URL('../lprep/styles.css',import.meta.url),'utf8');
  assert.match(css,/L-Prep V2 : couleur conservée à la sélection/);
  assert.match(css,/chain-color, #6574d8\) 25%, white/);
  assert.match(css,/chain-color, #6574d8\) 40%, white/);
  assert.match(css,/chain-row\.selected/);
  assert.match(css,/3px solid var\(--blue\)/);
});
