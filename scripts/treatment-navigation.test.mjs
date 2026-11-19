import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeClassification } from '../classification.mjs';
import { defaultSelections, matchesPluginSelections, contextualCounts, valuesForFilter } from '../filters.mjs';
import {
  CLASSIFICATION_OPTIONS, TREATMENT_OPTIONS, classificationSearchText, factStateLabel,
  navigationFacets, selectedTreatmentIds, sharedClassificationDetails, treatmentDetails
} from '../treatment-navigation.mjs';

const verified = { state: 'present', confidence: 'verified', evidence: [{ url: 'https://example.test/manual' }] };
const fact = id => ({ id, ...verified });
const modern = normalizeClassification({ id: 'test--multiple', classification: { version: 1, treatments: [
  { type: 'compressor', ...verified, families: [fact('opto')], architectures: [fact('multiband')],
    features: { externalSidechain: { ...verified, state: 'absent' } } },
  { type: 'saturation-distortion', ...verified, families: [fact('tape')], architectures: [fact('multiband')],
    features: { dryWet: { state: 'pending' }, midSide: { state: 'not-applicable' } } },
  { type: 'delay', ...verified, families: [fact('tape')] }
], formats: [fact('multi-effects')] } });
const facets = navigationFacets([modern]);
const selections = () => defaultSelections(['treatment', 'classificationStatus', 'format', ...Object.keys(facets)], 'owned');

test('la navigation reprend les 17 libellés et sépare les fiches à classer et le format', () => {
  assert.deepEqual(TREATMENT_OPTIONS.map(([, label]) => label), [
    'Compresseur', 'Limiteur', 'Gate / Expandeur', 'De-esser', 'Transient Shaper', 'Clipper',
    'Égaliseur', 'Saturation / Distorsion', 'Renforcement du grave', 'Réverbération', 'Delay / Écho',
    'Modulation', 'Image stéréo', 'Hauteur / Temps', 'Nettoyage / Restauration', 'Utilitaires audio', 'Channel Strip'
  ]);
  assert.deepEqual(CLASSIFICATION_OPTIONS[0], ['unclassified', 'À classer']);
  assert.deepEqual(valuesForFilter(modern, 'format'), ['multi-effects']);
  assert.equal(facets.treatmentFamily.for.includes('limiter'), false);
  assert.equal(facets.treatmentFamily.for.includes('channel-strip'), false);
  assert.ok(facets.treatmentFamily.options.some(([id]) => id === 'delay/tape'));
  assert.ok(facets.treatmentFamily.options.some(([id]) => id === 'saturation-distortion/tape'));
});

test('une fiche multitraitemements compte une fois par choix et les familles restent contextualisées', () => {
  const selection = selections();
  selection.treatment.include = ['delay', 'compressor', 'saturation-distortion'];
  assert.equal(contextualCounts([modern], selection, 'architecture', facets).get('multiband'), 1);
  assert.equal(contextualCounts([modern], selection, 'treatment', facets).get('compressor'), 1);
  selection.treatment.include = ['delay'];
  assert.deepEqual(selectedTreatmentIds(selection.treatment, true), ['delay']);
  assert.deepEqual(valuesForFilter(modern, 'treatmentFamily', selection), ['delay/tape']);
  selection.treatmentFamily.include = ['saturation-distortion/tape'];
  assert.equal(matchesPluginSelections(modern, selection), false);
  assert.deepEqual(selection.treatmentFamily.include, ['saturation-distortion/tape']);
  selection.treatmentFamily.include.push('delay/tape');
  assert.equal(matchesPluginSelections(modern, selection), true);
  selection.treatment.exclude = ['compressor'];
  assert.equal(matchesPluginSelections(modern, selection), false);
});

test('les incertitudes, absences documentées et critères sans objet gardent des états distincts', () => {
  const selection = selections();
  selection.treatment.include = ['saturation-distortion', 'compressor'];
  assert.deepEqual(valuesForFilter(modern, 'dryWet', selection), []);
  assert.deepEqual(valuesForFilter(modern, 'externalSidechain', selection), ['absent']);
  assert.deepEqual(valuesForFilter(modern, 'midSide', selection), ['not-applicable']);
  selection.externalSidechain.include = ['present'];
  assert.equal(matchesPluginSelections(modern, selection), false);
  selection.externalSidechain.include = ['absent'];
  assert.equal(matchesPluginSelections(modern, selection), true);
  const rows = treatmentDetails(modern, modern.classification.treatments[0]);
  assert.equal(rows.find(row => row.label === 'Attaque').fact.state, 'unknown');
  assert.equal(factStateLabel(rows.find(row => row.label === 'Sidechain externe').fact), 'Absence documentée');
  assert.equal(factStateLabel({ state: 'present', confidence: 'reported' }), 'Rapporté');
  assert.equal(factStateLabel({ state: 'unknown' }), 'Non renseigné');
  assert.equal(factStateLabel({ state: 'not-applicable' }), 'Sans objet');
});

const plugins = JSON.parse(readFileSync(new URL('../data/plugins.json', import.meta.url))).plugins;
const byId = new Map(plugins.map(plugin => [plugin.id, plugin]));
const view = id => normalizeClassification(byId.get(id));

test('les fiches historiques restent accessibles avec les seuls traitements documentés', () => {
  const cla = view('waves--cla-2a-compressor-limiter');
  const clip = view('sir-audio-tools--standardclip');
  const f6 = view('waves--f6-floating-band-dynamic-eq');
  const strip = view('eventide--echannel');
  const rack = view('blue-cat-audio--blue-cat-s-patchwork');
  assert.deepEqual([cla, clip, f6, strip, rack].map(p => valuesForFilter(p, 'treatment')), [
    ['compressor'], ['clipper'], ['equalizer'], ['channel-strip'], []
  ]);
  assert.deepEqual(valuesForFilter(rack, 'format'), ['multi-effects']);
  assert.match(classificationSearchText(rack), /À classer Multieffets/);
  assert.deepEqual(valuesForFilter(f6, 'treatmentFamily'), []);
  assert.ok(treatmentDetails(f6, f6.classification.treatments[0]).some(row => row.value === 'Dynamique' && row.fact.state === 'pending'));
  assert.equal(sharedClassificationDetails(cla).find(row => row.label === 'Mid/Side').fact.state, 'absent');
  assert.equal(clip.id, 'sir-audio-tools--standardclip');
  assert.equal(clip.image, byId.get(clip.id).image);
  assert.equal(clip.category, 'limiter'); // Le comparateur historique garde sa donnée d’entrée.
  const selection = selections();
  selection.classificationStatus.include = ['unclassified'];
  selection.format.include = ['multi-effects'];
  assert.equal(matchesPluginSelections(rack, selection), true);
  assert.equal(matchesPluginSelections(f6, selection), false);
  assert.equal(plugins.filter(p => !p.duplicateOf && !p.exclude && p.category === 'other')
    .filter(p => valuesForFilter(normalizeClassification(p), 'treatment').length).length, 0);
});
