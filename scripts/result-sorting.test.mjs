import assert from 'node:assert/strict';
import test from 'node:test';
import { documentedLatency, rankResults, sortOptions, sortValue } from '../result-sorting.mjs';

const source = 'https://example.test/manual';
const now = Date.parse('2026-11-18T00:00:00Z');
const plugin = (id, fields = {}) => ({ id, name: id, ...fields });
const official = 'https://www.waves.com/support/tech-specs/plugin-latency';
const ranking = (plugins, criterion, direction, type) => rankResults(plugins, criterion, direction, type, now)
  .map(item => item.plugin.id);

test('la latence comparable est globale et sourcée à 48 kHz, le zéro inconnu reste exclu', () => {
  const zero = plugin('B', { latency: { 48: { samples: 0 }, source: official } });
  const small = plugin('C', { latency: { 48: { samples: 20 }, source: official } });
  const claim = plugin('A', { latency: { 48: { samples: 0 }, 96: { samples: 0 } },
    latencyInfo: { zero: true, url: source, values: [], sampleRate: null } });
  const mode = plugin('D', { latency: { source: official, 48: { variants: [{ label: 'Live', samples: 0 }] } } });
  const conflict = plugin('E', { latency: { source: official, 48: { conflict: true, samples: null } } });
  const wrongRate = plugin('F', { latency: { source: official, 96: { samples: 0 } } });
  const records = [claim, small, zero, conflict, mode, wrongRate];
  for (const missing of [claim, mode, conflict, wrongRate]) assert.equal(documentedLatency(missing), null);
  assert.deepEqual(ranking(records, 'latency', 1), ['B', 'C', 'A', 'D', 'E', 'F']);
  assert.deepEqual(ranking(records, 'latency', -1), ['C', 'B', 'A', 'D', 'E', 'F']);
  assert.equal(sortValue(zero, 'latency').url, official);
});

test('les plages d’attaque réellement comparables alimentent un tri contextuel', () => {
  const reading = { state: 'present', value: { min: 0.1, max: 3, unit: 'ms' }, evidence: [{ url: source }] };
  const synth = (id, fact) => plugin(id, { classification: { treatments: [
    { type: 'compressor', state: 'present', measurements: { attack: [fact] } }
  ] } });
  const records = [synth('B', reading), synth('A', { ...reading, conditions: { mode: 'Live' } }), synth('C', {
    ...reading, value: { min: 0.2, max: 3, unit: 'ms' }
  })];
  assert.deepEqual(ranking(records, 'attack', -1, 'compressor'), ['C', 'B', 'A']);
  assert.deepEqual(sortOptions('compressor', records, now).find(([id]) => id === 'attack'), ['attack', 'Attaque minimale', true]);
  assert.ok(!sortOptions('reverb', records, now).some(([id]) => id === 'attack'));
  assert.equal(sortOptions('compressor', records, now).find(([id]) => id === 'cpu')[2], false);
});

test('le tri prix ignore abonnements, devises, tarifs périmés et gratuités non confirmées', () => {
  const offer = { normal: 39, currency: 'EUR', url: source, checkedAt: '2026-11-15', sourceName: 'Example' };
  const paid = plugin('F', { pricing: offer });
  const gratis = plugin('E', { catalogStatus: 'free', statusEvidence: { url: source } });
  const bad = [
    plugin('A', { catalogStatus: 'free' }),
    plugin('B', { pricing: { ...offer, currency: 'USD' } }),
    plugin('C', { pricing: { ...offer, checkedAt: '2026-10-01' } }),
    plugin('D', { pricing: { ...offer, licenseType: 'subscription' } })
  ];
  assert.deepEqual(ranking([paid, ...bad, gratis], 'price', 1), ['E', 'F', 'A', 'B', 'C', 'D']);
  assert.deepEqual(ranking([paid, ...bad, gratis], 'price', -1), ['F', 'E', 'A', 'B', 'C', 'D']);
  assert.match(sortValue(paid, 'price', undefined, now).text, /15\/11\/2026/);
});

test('la fréquence et le fabricant utilisent le tri commun sans déplacer les données d’origine', () => {
  const plugins = [
    plugin('Alpha', { vendor: 'Zeta', latency: { source: official, 48: { samples: 0 }, 96: { samples: 22 } } }),
    plugin('Zed', { vendor: 'Beta', latency: { source: official, 48: { samples: 15 }, 96: { samples: 0 } } }),
    plugin('Inconnu', { vendor: 'Beta' })
  ];
  const ids = (key, rate) => rankResults(plugins, key, 1, null, now, rate).map(item => item.plugin.id);
  assert.deepEqual(ids('latency', 48), ['Alpha', 'Zed', 'Inconnu']);
  assert.deepEqual(ids('latency', 96), ['Zed', 'Alpha', 'Inconnu']);
  assert.deepEqual(ids('latency', null), ['Alpha', 'Inconnu', 'Zed']);
  assert.deepEqual(ids('vendor', 48), ['Inconnu', 'Zed', 'Alpha']);
  assert.deepEqual(plugins.map(plugin => plugin.id), ['Alpha', 'Zed', 'Inconnu']);
  assert.equal(documentedLatency(plugins[0], 96).text, '22 éch. · 96 kHz');
});
