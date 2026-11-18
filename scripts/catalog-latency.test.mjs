import { buildComparison } from '../comparison.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { hasDocumentedLatency, mergeCatalogLatency, mergeVendorProducts } from '../catalog.mjs';
import { normalizeClassification } from '../classification.mjs';
import { latencyIssueRates, latencyIssues, resolveCatalogLatency } from '../latency-resolution.mjs';
import { auditFeatureEvidence } from './feature-evidence.mjs';
import { parseWavesLatency, matchWaves } from './waves.mjs';
import { discardSyntheticLatency, extractPublishedLatency } from './product-facts.mjs';

const waves = 'https://www.waves.com/support/tech-specs/plugin-latency';
const manual = 'https://example.test/manual';
const another = 'https://example.test/another-manual';
const live = { label: 'Live', samples: 64 };
const studio = { label: 'Studio', samples: 512 };
const conditional = { samples: null, variants: [live, studio] };
const former = { source: waves, 48: { samples: 0 }, 96: { samples: 32 } };

test('le relevé officiel par mode remplace le zéro global courant et archive son origine', () => {
  const [row] = parseWavesLatency(JSON.stringify({
    latency: [{ documentName: 'Fixture', native48: 'Live: 64; Studio: 512' }]
  }));
  const [plugin] = [{ name: 'Fixture', category: 'comp', latency: former }];
  matchWaves([plugin], [row]);
  assert.equal(plugin.latency[48].samples, null); // Le badge global teste samples === 0.
  assert.deepEqual(plugin.latency[48].variants, [live, studio]);
  assert.deepEqual(plugin.latency[48].history, [{ source: waves, samples: 0 }]);
  assert.deepEqual(plugin.latency[96], former[96]);
  auditFeatureEvidence(plugin);
  assert.ok(!plugin.tags.includes('opt:zl'));
  assert.notEqual(plugin.featureEvidence['opt:zl']?.present, true);
  assert.deepEqual(mergeCatalogLatency(plugin.latency, row.latency), plugin.latency);
});

test('le même résultat conditionnel est conservé dans la fusion de fiches', () => {
  const id = 'test--plugin';
  const [plugin] = mergeVendorProducts([{ id, latency: former }], [
    { id, latency: { source: waves, 48: conditional } }
  ]);
  assert.deepEqual(plugin.latency[48].variants, [live, studio]);
  assert.equal(plugin.latency[48].samples, null);
  assert.deepEqual(plugin.latency[96], former[96]);
});

test('une valeur globale valide survit à un relevé incomplet', () => {
  assert.deepEqual(mergeCatalogLatency(former, { source: waves, 48: { samples: null }, 96: null }), former);
  assert.deepEqual(mergeCatalogLatency(former, { source: waves, 48: { samples: 0 } }), former);
});

test('un mode manquant reste inconnu et un relevé partiel ne détruit ni ne duplique les modes connus', () => {
  const previous = { source: waves, 48: conditional };
  const partial = { source: waves, 48: { samples: null, variants: [{ label: 'Live', samples: null }, { label: 'Eco' }] } };
  assert.deepEqual(mergeCatalogLatency(previous, partial), previous);
  const result = mergeCatalogLatency(previous, { source: waves, 48: { samples: null, variants: [live] } });
  assert.deepEqual(result, previous);
  const unknown = mergeCatalogLatency({ 48: null }, { 48: { samples: null }, 96: null });
  assert.equal(unknown[48].samples, null);
  assert.equal(hasDocumentedLatency({ latency: unknown }), false);
});

test('la preuve du tableau officiel prime sur un relevé non vérifié plus récent, par fréquence', () => {
  const previous = { ...former, 48: { samples: 12, checkedAt: '2026-01-01' } };
  const incoming = { source: manual, 48: { samples: 0, checkedAt: '2026-11-18' }, 88.2: { samples: 24 } };
  const merged = mergeCatalogLatency(previous, incoming);
  assert.equal(merged[48].samples, 12);
  assert.equal(merged[48].source, waves);
  assert.deepEqual(merged[48].history, [{ ...incoming[48], source: manual }]);
  assert.deepEqual(merged[96], { ...former[96], source: waves });
  assert.deepEqual(merged[88.2], { samples: 24, source: manual });
  assert.equal(merged.source, undefined);
  assert.deepEqual(mergeCatalogLatency(merged, incoming), merged);
});

test('deux sources comparables en désaccord rendent la latence globale incertaine', () => {
  const old = { source: manual, 48: { samples: 0 }, 96: { samples: 20 } };
  const incoming = { source: another, 48: conditional };
  const merged = mergeCatalogLatency(old, incoming);
  assert.equal(merged[48].samples, null);
  assert.equal(merged[48].uncertain, true);
  assert.equal(merged[48].conflict, undefined);
  assert.deepEqual(merged[48].history, [{ ...old[48], source: manual }]);
  assert.deepEqual(merged[48].variants, [live, studio]);
  assert.equal(merged[96].samples, 20);
  assert.deepEqual(mergeCatalogLatency(merged, incoming), merged);
  const resolved = mergeCatalogLatency(merged, { source: waves, 48: conditional });
  assert.equal(resolved[48].conflict, undefined);
  assert.equal(resolved[48].uncertain, true);
  assert.deepEqual(resolved[48].variants, [live, studio]);
});

test('un désaccord entre modes laisse disponibles les modes non contestés', () => {
  const old = { source: manual, 48: conditional };
  const incoming = { source: another, 48: { samples: null,
    variants: [{ label: 'Live', samples: 0 }, studio, { label: 'Offline', samples: 256 }] } };
  const merged = mergeCatalogLatency(old, incoming);
  assert.equal(merged[48].conflict, true);
  assert.equal(merged[48].samples, null);
  assert.deepEqual(merged[48].variants.map(mode => mode.label), ['Offline', 'Studio']);
  assert.ok(merged[48].variants.every(mode => mode.samples > 0));
});

test('un zéro du tableau devient incertain si un autre document attribuable décrit des modes non nuls', () => {
  const incoming = { source: manual, 48: conditional };
  const merged = mergeCatalogLatency(former, incoming);
  assert.equal(merged[48].samples, null);
  assert.equal(merged[48].uncertain, true);
  assert.deepEqual(mergeCatalogLatency(merged, incoming), merged);
});

test('la date départage uniquement des relevés comparables de la même source', () => {
  const previous = { source: waves, 48: { samples: 18, checkedAt: '2026-11-18' } };
  const older = { source: waves, 48: { samples: 0, checkedAt: '2026-01-01' } };
  const result = mergeCatalogLatency(previous, older);
  assert.equal(result[48].samples, 18);
  assert.deepEqual(result[48].history, [{ ...older[48], source: waves }]);
  assert.deepEqual(mergeCatalogLatency(older, previous), result);
});

test('annonce, anciennes cellules synthétiques et mesures réelles restent séparées jusqu’au badge', () => {
  const claim = extractPublishedLatency('This plugin has zero latency.', manual, '2026-11-01');
  const id = 'test--marketing';
  const old = { id, name: 'Fixture', category: 'comp', ...claim, latency: { 48: { samples: 0 }, 96: { samples: 0 } } };
  discardSyntheticLatency(old);
  assert.equal(old.latency, undefined);
  assert.equal(old.latencyInfo.zero, true);
  const reported = extractPublishedLatency(
    'This plugin has zero latency. 64 samples Live / 512 samples Studio at 48 kHz. Latency: 96 samples at 96 kHz.', manual);
  const [plugin] = mergeVendorProducts([old], [{ id, ...reported }]);
  auditFeatureEvidence(plugin);
  assert.equal(plugin.latency[48].samples, null); // Le badge global teste samples === 0.
  assert.ok(plugin.latency[48].variants.every(mode => mode.samples !== 0));
  assert.equal(plugin.latency[96].samples, 96);
  assert.deepEqual(mergeCatalogLatency(plugin.latency, reported.latency), plugin.latency);
  const official = { ...claim, latency: { ...former, 96: { samples: 0 } } };
  discardSyntheticLatency(official);
  assert.equal(official.latency[48].samples, 0);
  assert.equal(official.latency[96].samples, 0);
  const explicit = { latencyInfo: { ...claim.latencyInfo, sampleRate: 48, values: [{ value: 0, unit: 'samples' }] },
    latency: { 48: { samples: 0 }, 96: { samples: 0 } } };
  discardSyntheticLatency(explicit);
  assert.deepEqual(explicit.latency, { 48: { samples: 0 } });
});

const checkedAt = '2026-11-01';
const legacyPair = () => ({ 48: { samples: 0 }, 96: { samples: 0 } });
const announcement = () => extractPublishedLatency('This plugin has zero latency.', manual, checkedAt).latencyInfo;
const numericReport = (rate, samples = 0, source = manual) =>
  extractPublishedLatency(`Latency: ${samples} samples at ${rate} kHz.`, source, checkedAt).latencyInfo;

test('la matrice conserve chaque zéro numérique, quelle que soit sa position ou sa source', () => {
  for (const rate of [48, 96]) {
    const explicit = extractPublishedLatency(`0 samples at ${rate} kHz`, manual, checkedAt);
    const before = structuredClone(explicit);
    discardSyntheticLatency(explicit);
    assert.deepEqual(explicit, before);
    assert.deepEqual(explicit.latency, { [rate]: { samples: 0 } });

    const historical = { latency: legacyPair(), latencyInfo: { ...announcement(), reports: [numericReport(rate)] } };
    discardSyntheticLatency(historical);
    assert.deepEqual(historical.latency, explicit.latency);
    const cleaned = structuredClone(historical);
    discardSyntheticLatency(historical);
    assert.deepEqual(historical, cleaned);
  }

  const combined = extractPublishedLatency('Zero latency: 0 samples at 48 kHz. Latency: 0 samples at 96 kHz.', manual, checkedAt);
  const independent = { latency: legacyPair(), latencyInfo: {
    ...announcement(), reports: [numericReport(48), numericReport(96, 0, another)]
  } };
  for (const plugin of [combined, independent]) {
    const before = structuredClone(plugin);
    discardSyntheticLatency(plugin);
    discardSyntheticLatency(plugin);
    assert.deepEqual(plugin, before);
  }
});

test('le nettoyage distingue une ancienne annonce d’une paire dont la provenance est incomplète', () => {
  const legacy = { latency: legacyPair(), latencyInfo: announcement() };
  discardSyntheticLatency(legacy);
  assert.equal(legacy.latency, undefined);
  assert.deepEqual(legacy.latencyInfo, announcement());

  for (const latencyInfo of [undefined, { zero: true, conditional: false }]) {
    const incomplete = { latency: legacyPair(), latencyInfo };
    discardSyntheticLatency(incomplete);
    for (const rate of [48, 96]) {
      assert.equal(incomplete.latency[rate].samples, null);
      assert.equal(incomplete.latency[rate].conflict, true);
      assert.deepEqual(incomplete.latency[rate].history, [{ samples: 0 }]);
    }
    const pending = structuredClone(incomplete);
    discardSyntheticLatency(incomplete);
    assert.deepEqual(incomplete, pending);
  }
});

test('un zéro de mode ou une source contradictoire ne corrobore pas un zéro global', () => {
  const modeReport = extractPublishedLatency('0 samples Live / 512 samples Studio at 48 kHz.', manual, checkedAt).latencyInfo;
  const plugin = { name: 'Fixture', latency: { ...legacyPair(), 88.2: { samples: 16 }, 44.1: { samples: null, variants: [live] } },
    latencyInfo: { ...numericReport(96), reports: [modeReport, numericReport(96), numericReport(96, 32, another)] } };
  const reports = structuredClone(plugin.latencyInfo.reports);
  auditFeatureEvidence(plugin);
  assert.equal(plugin.latency[48].uncertain, true);
  assert.equal(plugin.latency[96].conflict, true);
  assert.equal(plugin.latency[48].samples, null);
  assert.equal(plugin.latency[96].samples, null);
  assert.deepEqual(plugin.latency[88.2], { samples: 16 });
  assert.deepEqual(plugin.latency[44.1].variants, [live]);
  assert.deepEqual(new Set(plugin.latencyInfo.reports), new Set(reports));
  assert.equal(normalizeClassification(plugin).classification.measurements.latency96, undefined);
  const before = structuredClone(plugin);
  discardSyntheticLatency(plugin);
  assert.deepEqual(plugin, before);
});

test('la chaîne complète conserve le zéro secondaire documenté à 96 kHz', () => {
  const id = 'test--documented';
  const data = extractPublishedLatency('Zero latency: 0 samples at 48 kHz. Latency: 0 samples at 96 kHz.', manual, checkedAt);
  discardSyntheticLatency(data);
  const incoming = { id, name: 'Fixture', ...data };
  const [plugin] = mergeVendorProducts([{ id }], [incoming]);
  auditFeatureEvidence(plugin);
  assert.deepEqual(plugin.latency, legacyPair()); // Chaque cellule alimente le badge à sa fréquence.
  assert.deepEqual(plugin.latencyInfo.reports, data.latencyInfo.reports);
  const before = structuredClone(plugin);
  auditFeatureEvidence(plugin);
  assert.deepEqual(plugin, before);
});

test('un conflit entre deux relevés explicites survit sans cellule initiale, dans les deux ordres', () => {
  const zero = numericReport(48);
  const sixtyFour = numericReport(48, 64);
  const outcomes = [];
  for (const reports of [[zero, sixtyFour], [sixtyFour, zero], [zero, { ...sixtyFour, url: another }]]) {
    const plugin = { name: 'Fixture', latencyInfo: { ...reports[0], reports } };
    assert.equal(plugin.latency, undefined);
    assert.deepEqual(latencyIssueRates(plugin), [48]);
    assert.equal(normalizeClassification(plugin).classification.measurements.latency48, undefined);
    auditFeatureEvidence(plugin);
    assert.equal(plugin.latency[48].samples, null);
    assert.equal(plugin.latency[48].conflict, true);
    assert.deepEqual(latencyIssueRates(plugin), [48]);
    assert.equal(normalizeClassification(plugin).classification.measurements.latency48, undefined);
    const before = structuredClone(plugin);
    auditFeatureEvidence(plugin);
    assert.deepEqual(plugin, before);
    outcomes.push(resolveCatalogLatency(plugin)[48]);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[0].history.map(cell => cell.samples).sort((a, b) => a - b), [0, 64]);
});

test('la résolution de l’extraction conserve le conflit et ses preuves après fusion et audit', () => {
  const text = 'Latency: 0 samples at 48 kHz. Latency: 64 samples at 48 kHz. Latency: 32 samples at 96 kHz.';
  const incoming = { id: 'test--conflict', name: 'Fixture', ...extractPublishedLatency(text, manual, checkedAt) };
  assert.deepEqual(extractPublishedLatency(text, manual, checkedAt).latency, incoming.latency);
  const [plugin] = mergeVendorProducts([{ id: incoming.id }], [incoming]);
  auditFeatureEvidence(plugin);
  assert.equal(plugin.latency[48].samples, null);
  assert.equal(plugin.latency[48].conflict, true);
  assert.equal(plugin.latency[96].samples, 32);
  assert.equal(plugin.latencyInfo.reports.length, 3);
  const measurements = normalizeClassification(plugin).classification.measurements;
  assert.equal(measurements.latency48, undefined);
  assert.deepEqual(measurements.latency96.map(fact => fact.value.value), [32]);
  const [again] = mergeVendorProducts([plugin], [incoming]);
  auditFeatureEvidence(again);
  assert.deepEqual(again, plugin);
});

test('la comparaison se fait par fréquence, mode, unité et provenance', () => {
  const modes = (...values) => values.map(([label, samples]) => ({ label, samples }));
  const at48 = (variants, source = manual) => ({ source, 48: { samples: null, variants } });
  const conflictingModes = [at48(modes(['Live', 0], ['Studio', 512])), at48(modes(['live', 64]))];
  const modeResult = mergeCatalogLatency(...conflictingModes);
  assert.equal(modeResult[48].conflict, true);
  assert.deepEqual(modeResult[48].variants.map(mode => mode.label), ['Studio']);
  assert.deepEqual(mergeCatalogLatency(...conflictingModes.toReversed()), modeResult);
  const rawRepeatedMode = { latency: at48(modes(['Live', 0], ['Live', 64], ['Studio', 512])) };
  assert.deepEqual(latencyIssueRates(rawRepeatedMode), [48]);
  assert.deepEqual(resolveCatalogLatency(rawRepeatedMode)[48].variants.map(mode => mode.label), ['Studio']);
  const documented = { ...numericReport(48, 64), method: 'reviewed-source' };
  const automatic = { ...numericReport(48, 0, another), confidence: 'unverified' };
  const cases = [
    { reports: [documented, automatic], rate: 48, samples: 64 },
    { reports: [numericReport(48), numericReport(48)], rate: 48, samples: 0 },
    { reports: [numericReport(48), numericReport(96, 64)], rate: 96, samples: 64 },
    { reports: [numericReport(96)], rate: 96, samples: 0 },
    { reports: [numericReport(48), { sampleRate: 48, values: [] }], rate: 48, samples: 0 }
  ];
  for (const { reports, rate, samples } of cases) {
    const read = values => ({ latencyInfo: { reports: values } });
    const actual = resolveCatalogLatency(read(reports));
    assert.equal(actual[rate].samples, samples);
    assert.deepEqual(latencyIssueRates(read(reports)), []);
    assert.deepEqual(resolveCatalogLatency(read(reports.toReversed())), actual);
  }
  const incomparable = { latencyInfo: { reports: [
    numericReport(48),
    { ...numericReport(48), values: [{ value: 2, unit: 'ms' }] }
  ] } };
  assert.equal(resolveCatalogLatency(incomparable)[48].samples, null);
  assert.equal(resolveCatalogLatency(incomparable)[48].conflict, undefined);
  assert.deepEqual(latencyIssueRates(incomparable), [48]);
});

const modeTable = (source, ...modes) => ({
  source, 48: { samples: null, variants: modes.map(([label, samples]) => ({ label, samples })) }
});

test('les six ordres de la fixture préservent le conflit Live, Studio et Offline', () => {
  const a = modeTable(manual, ['Live', 0], ['Studio', 512]);
  const b = modeTable(another, ['Live', 64]);
  const c = modeTable(waves, ['Offline', 256]);
  const orders = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
  const first = orders[0].reduce(mergeCatalogLatency);
  assert.equal(first[48].samples, null);
  assert.deepEqual(first[48].variants.map(({ label, samples, source }) => [label, samples, source]), [
    ['Offline', 256, waves], ['Studio', 512, manual]
  ]);
  assert.deepEqual(latencyIssues({ latency: first }), [{ rate: 48, status: 'conflict', modes: ['Live'] }]);
  assert.deepEqual(first[48].history.map(entry => [entry.source, entry.variants[0].samples]), [[another, 64], [manual, 0]]);
  for (const order of orders) {
    const actual = order.reduce(mergeCatalogLatency);
    assert.deepEqual(actual, first);
    assert.deepEqual(order.reduce(mergeCatalogLatency, actual), first);
  }
  const otherRate = { source: waves, 96: { samples: 96 } };
  const latency = mergeCatalogLatency(first, otherRate);
  assert.equal(latency[96].samples, 96);
  assert.deepEqual(latency[48], first[48]);
  assert.deepEqual(latencyIssueRates({ latency }), [48]);
});

test('une mesure officielle tranche exclusivement les modes que sa portée atteste', () => {
  const unresolved = mergeCatalogLatency(
    modeTable(manual, ['Live', 0], ['Studio', 0], ['Independent', 11]),
    modeTable(another, ['Live', 64], ['Studio', 64])
  );
  const reading = { source: waves, 48: { samples: 16, conditions: { modes: ['Live', 'Studio'] } } };
  const resolved = mergeCatalogLatency(unresolved, reading);
  assert.equal(resolved[48].samples, null);
  assert.deepEqual(latencyIssues({ latency: resolved }), []);
  assert.deepEqual(resolved[48].variants.map(({ label, samples }) => [label, samples]), [
    ['Independent', 11], ['Live', 16], ['Studio', 16]
  ]);
  assert.equal(resolved[48].history.length, 4);
  assert.deepEqual(mergeCatalogLatency(reading, unresolved), resolved);

  const unknown = { source: waves, 48: { samples: 256, conditions: { conditional: true } } };
  const unresolvedAfter = mergeCatalogLatency(unresolved, unknown);
  assert.deepEqual(unresolvedAfter[48].conflictingModes, ['Live', 'Studio']);
  assert.deepEqual(unresolvedAfter[48].variants.map(mode => mode.label), ['Independent']);
  assert.equal(unresolvedAfter[48].samples, null);
});

test('des modes distincts de même valeur ne fusionnent pas leur portée', () => {
  const latency = mergeCatalogLatency(
    modeTable(manual, ['Live', 64]),
    modeTable(waves, ['Studio', 64], ['Offline', 64])
  );
  assert.equal(latency[48].samples, null);
  assert.deepEqual(latency[48].variants.map(mode => mode.label), ['Live', 'Offline', 'Studio']);
  assert.deepEqual(latencyIssues({ latency }), []);
});


test('le relevé principal ne réintroduit aucun résultat quand un conflit affecte la seule fréquence', () => {
  const id = 'test--primary';
  const records = [0, 64].map(samples => ({
    id, name: 'Fixture', category: 'other',
    ...extractPublishedLatency(`Latency: ${samples} samples at 48 kHz.`, manual, checkedAt)
  }));
  const run = ([first, second]) => {
    const [plugin] = mergeVendorProducts([first], [second]);
    auditFeatureEvidence(plugin);
    const sections = buildComparison([plugin], { categories: {}, facets: {}, common: {} }, () => 'unknown', {});
    const rows = sections.find(section => section.title === 'Latence').rows;
    const rate = rows.find(row => row.label.includes('48 kHz')).cells[0][0];
    assert.equal(rate.quality, 'pending');
    assert.equal(plugin.latency[48].samples, null);
    assert.equal(plugin.latencyInfo.zero, false);
    assert.deepEqual(plugin.latencyInfo.values, []);
    assert.match(plugin.latencyInfo.noteFr, /relevés contradictoires/);
    assert.equal(normalizeClassification(plugin).classification.measurements.latency48, undefined);
    assert.deepEqual(latencyIssueRates(plugin), [48]);
    const before = structuredClone(plugin);
    auditFeatureEvidence(plugin);
    assert.deepEqual(plugin, before);
    return { info: plugin.latencyInfo, rate };
  };
  assert.deepEqual(run(records), run(records.toReversed()));
});

test('un relevé résolu à une autre fréquence reste éligible comme relevé principal', () => {
  const data = extractPublishedLatency(
    'Latency: 0 samples at 48 kHz. Latency: 64 samples at 48 kHz. Latency: 32 samples at 96 kHz.',
    manual, checkedAt);
  assert.equal(data.latency[48].samples, null);
  assert.equal(data.latencyInfo.sampleRate, 96);
  assert.deepEqual(data.latencyInfo.values, [{ value: 32, unit: 'samples' }]);
  assert.equal(data.latencyInfo.reports.length, 3);
});
