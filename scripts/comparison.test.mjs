import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComparison, comparisonScrollState, hasComparisonDifference } from '../comparison.mjs';
import { collectionStatus } from '../collection.mjs';

const labels = {
  categories: { comp: 'Compresseur', eq: 'Égaliseur' },
  facets: {
    techno: { label: 'Technologie', for: ['comp'], values: { fet: 'FET', vca: 'VCA' } },
    coloration: { label: 'Coloration', for: ['comp', 'eq'], values: { colored: 'Coloré' } }
  },
  common: { sidechain: 'Side-chain externe', ms: 'Mid/Side' }
};
const proof = { present: true, method: 'reviewed-source', url: 'https://example.test/manual' };
const first = { id: 'test--first', category: 'comp', featureEvidence: { 'techno:fet': proof } };
const second = { id: 'test--second', category: 'comp' };
const third = { id: 'test--third', category: 'eq' };
const statusLabels = { owned: 'Licence perpétuelle', subscription: 'Abonnement actif', former: 'Ancien abonnement' };
const sections = (plugins, status = {}) => buildComparison(plugins, labels,
  plugin => collectionStatus(plugin, { status, subscriptions: [] }, []), statusLabels);
const row = (data, label) => data.flatMap(section => section.rows).find(row => row.label === label);

test('même famille : les facettes spécialisées gardent preuves et données manquantes', () => {
  const data = sections([first, second]);
  assert.deepEqual(row(data, 'Technologie').cells.map(([{ value, quality }]) => [value, quality]),
    [['FET', 'verified'], ['Non renseigné', 'unknown']]);
  assert.equal(row(data, 'Technologie').cells[0][0].source, proof.url);
  assert.ok(row(data, 'Coloration'));
});

test('familles différentes : seules les facettes communes et étayées sont proposées', () => {
  const data = sections([first, { ...third, unverifiedTags: ['coloration:colored'] }]);
  assert.equal(row(data, 'Technologie'), undefined);
  assert.equal(row(data, 'Coloration').cells[1][0].quality, 'pending');
  assert.ok(row(data, 'Side-chain externe'));
});

test('absence explicite, information inconnue et présence à confirmer restent distinctes', () => {
  const data = sections([
    { ...first, featureEvidence: { 'opt:sidechain': { ...proof, present: false } } },
    second,
    { ...third, unverifiedTags: ['opt:sidechain'] }
  ]);
  assert.deepEqual(row(data, 'Side-chain externe').cells.map(([{ value, quality }]) => [value, quality]), [
    ['Absence documentée', 'verified'], ['Non renseigné', 'unknown'], ['Présence à confirmer', 'pending']
  ]);
});

test('latences par mode, zéro, fréquence d’origine et preuves sont préservés', () => {
  const data = sections([{
    ...first, latency: { source: proof.url, 48: { variants: [{ label: 'Live', samples: 0 }, { label: 'Studio', samples: 32 }] }, 96: { samples: 0 } }
  }, {
    ...second, latencyInfo: { sampleRate: 44.1, conditional: true, modes: [{ label: 'Studio', samples: 100 }], url: proof.url }
  }]);
  assert.deepEqual(row(data, 'Latence à 48 kHz').cells.map(([{ quality }]) => quality), ['conditional', 'unknown']);
  assert.match(row(data, 'Latence à 48 kHz').cells[0][0].value, /Live · 0 échantillon \/ Studio · 32 échantillons/);
  assert.equal(row(data, 'Latence à 48 kHz').cells[0][0].source, proof.url);
  assert.equal(row(data, 'Latence à 96 kHz').cells[0][0].value, '0 échantillon');
  assert.match(row(data, 'Précisions publiées').cells[1][0].value, /44,1 kHz · Studio · 100/);
});

test('différences uniquement : une ligne disparaît seulement si ses valeurs fiables sont identiques', () => {
  const difference = (...qualities) => hasComparisonDifference({
    cells: qualities.map(quality => [{ value: 'Même valeur', quality }])
  });
  assert.equal(difference('verified', 'verified'), false);
  assert.equal(difference('collection', 'collection'), false);
  assert.equal(difference('verified', 'collection'), true);
  for (const quality of ['unknown', 'conditional', 'pending']) assert.equal(difference(quality, quality), true);
  assert.equal(hasComparisonDifference({ cells: [[{ value: 'FET', quality: 'verified' }], [{ value: 'VCA', quality: 'verified' }]] }), true);
});

test('la licence calculée distingue perpétuelle, abonnement actif et ancien abonnement', () => {
  const data = sections([first, second, third, { id: 'test--fourth', category: 'eq' }],
    { [first.id]: 'owned', [second.id]: 'subscription', [third.id]: 'former' });
  assert.deepEqual(row(data, 'Licence').cells.map(([{ value }]) => value),
    ['Licence perpétuelle', 'Abonnement actif', 'Ancien abonnement', 'Non renseigné']);
});

test('les commandes horizontales indiquent les colonnes hors écran à chaque extrémité', () => {
  const at = scrollLeft => comparisonScrollState({ scrollLeft, scrollWidth: 976, clientWidth: 374 });
  assert.deepEqual(at(0), { left: false, right: true });
  assert.deepEqual(at(172), { left: true, right: true });
  assert.deepEqual(at(601.5), { left: true, right: false });
  assert.deepEqual(at(-12), { left: false, right: true });
  assert.deepEqual(at(615), { left: true, right: false });
});

test('les commandes horizontales disparaissent si le tableau tient ou est masqué', () => {
  assert.deepEqual(comparisonScrollState({ scrollLeft: 0, scrollWidth: 588, clientWidth: 588 }),
    { left: false, right: false });
  assert.deepEqual(comparisonScrollState({ scrollLeft: 0, scrollWidth: 976, clientWidth: 0 }),
    { left: false, right: false });
});
