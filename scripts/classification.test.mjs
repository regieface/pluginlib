import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FACT_STATES, UNKNOWN_FACT, normalizeClassification, validateClassification } from '../classification.mjs';
import { COMPARISON_CRITERIA, CRITERIA, TREATMENTS } from '../treatment-taxonomy.mjs';

const proof = { url: 'https://example.test/manual', method: 'reviewed-source', excerpt: 'Documentation de test' };
const present = { state: 'present', confidence: 'verified', evidence: [proof] };
const fixture = treatments => ({ version: 1, treatments });
const treatment = (type, values = {}) => ({ type, ...present, ...values });
const assertion = id => ({ id, ...present });

test('les 17 traitements et leurs critères essentiels correspondent à la nomenclature', () => {
  assert.deepEqual(Object.values(TREATMENTS).map(type => type.label), [
    'Compresseur', 'Limiteur', 'Gate / Expandeur', 'De-esser', 'Transient Shaper', 'Clipper',
    'Égaliseur', 'Saturation / Distorsion', 'Renforcement du grave', 'Réverbération', 'Delay / Écho',
    'Modulation', 'Image stéréo', 'Hauteur / Temps', 'Nettoyage / Restauration', 'Utilitaires audio', 'Channel Strip'
  ]);
  const performance = ['latency48', 'latency96', 'cpu'];
  assert.deepEqual(COMPARISON_CRITERIA, {
    compressor: ['family', 'attack', 'release', 'ratio', 'externalSidechain', 'sidechainProcessing', ...performance],
    limiter: performance,
    'gate-expander': ['family', 'externalSidechain', 'sidechainProcessing', 'attenuation', ...performance],
    'de-esser': performance, 'transient-shaper': performance,
    clipper: ['clippingCurve', ...performance],
    equalizer: ['family', 'dynamicProcessing', 'externalSidechain', 'sidechainProcessing', 'midSide', 'phaseType', ...performance],
    'saturation-distortion': ['family', 'technology', 'distortionType', 'multiband', 'midSide', 'dryWet', ...performance],
    'bass-enhancement': ['subharmonics', 'upperHarmonics', ...performance],
    reverb: ['family', 'technology', ...performance], delay: ['family', 'technology', ...performance],
    modulation: ['family', 'technology', ...performance],
    'stereo-image': ['family', ...performance], 'pitch-time': ['family', ...performance],
    'cleanup-restoration': ['family', ...performance], 'audio-utility': ['family', 'cpu'],
    'channel-strip': ['integratedModules', 'design', ...performance]
  });
  for (const keys of Object.values(COMPARISON_CRITERIA)) {
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(keys.every(key => Object.hasOwn(CRITERIA, key)));
  }
});

test('chaque famille validée appartient à un traitement et reste facultative', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(TREATMENTS)
    .filter(([, type]) => type.families)
    .map(([id, type]) => [id, Object.values(type.families)])), {
    compressor: ['FET', 'VCA', 'Opto', 'Vari-Mu', 'Diode Bridge', 'PWM', 'Numérique'],
    'gate-expander': ['Gate', 'Expandeur descendant', 'Expandeur montant'],
    equalizer: ['Paramétrique', 'Graphique', 'Pultec', 'Dynamique'],
    'saturation-distortion': ['Tape', 'Tube', 'Transistor', 'Transformateur', 'Diode', 'Bitcrusher'],
    reverb: ['Plate', 'Hall', 'Room', 'Chamber', 'Spring', 'Ambience'],
    delay: ['Tape', 'Analog', 'Digital', 'Multi-tap', 'Ping-pong'],
    modulation: ['Chorus', 'Flanger', 'Phaser', 'Tremolo', 'Rotary', 'Auto-pan'],
    'stereo-image': ['Élargissement', 'Stéréoïsation', 'Positionnement'],
    'pitch-time': ['Correction de hauteur', 'Pitch Shifting', 'Harmonisation', 'Time Stretching', 'Varispeed'],
    'cleanup-restoration': ['Denoise', 'De-feedback', 'De-hum', 'De-click', 'De-reverb', 'Réparation spectrale'],
    'audio-utility': ['Gain / Niveau', 'Phase / Alignement', 'Canaux / Routage', 'Analyse / Mesure', 'Format / Livraison']
  });
  for (const [id, { families = {} }] of Object.entries(TREATMENTS)) {
    validateClassification(fixture([treatment(id)]));
    for (const family of Object.keys(families)) {
      validateClassification(fixture([treatment(id, { families: [assertion(family)] })]));
    }
  }
  assert.throws(() => validateClassification(fixture([treatment('limiter', { families: [assertion('opto')] })])), /families/);
  assert.throws(() => validateClassification(fixture([treatment('equalizer', { families: [assertion('hall')] })])), /families/);
});

test('une fiche garde son ID et plusieurs traitements distincts avec leurs propres propriétés', () => {
  const compressor = treatment('compressor', {
    families: [assertion('opto'), assertion('digital')],
    technologies: [assertion('opto')],
    architectures: [assertion('multiband')],
    features: { externalSidechain: present }
  });
  const saturation = treatment('saturation-distortion', {
    processes: [assertion('waveshaping')],
    features: { dryWet: present }
  });
  const plugin = { id: 'test--rack', category: 'multi', classification: {
    ...fixture([compressor, saturation]), formats: [assertion('multi-effects')]
  } };
  assert.strictEqual(normalizeClassification(plugin), plugin);
  assert.deepEqual(plugin.classification.treatments.map(item => item.type), ['compressor', 'saturation-distortion']);
  assert.throws(() => validateClassification(fixture([compressor, compressor])), /distincts/);
  for (const id of ['multiband', 'waveshaping']) {
    assert.throws(() => validateClassification(fixture([treatment('saturation-distortion', { families: [assertion(id)] })])), /families/);
    assert.throws(() => validateClassification(fixture([treatment('compressor', { technologies: [assertion(id)] })])), /technologies/);
  }
  assert.throws(() => validateClassification(fixture([treatment('multi-effects')])), /treatments/);
  assert.throws(() => normalizeClassification({ ...plugin, classification: { version: 2 } }), /version/);
});

test('les états et les mesures distinguent absence, inconnu, non applicable et estimation', () => {
  assert.deepEqual(FACT_STATES, ['present', 'absent', 'unknown', 'not-applicable', 'pending', 'estimated']);
  const absence = { ...present, state: 'absent' };
  const compressor = treatment('compressor', {
    features: {
      externalSidechain: absence, sidechainProcessing: { state: 'not-applicable' },
      dryWet: UNKNOWN_FACT, midSide: { state: 'pending' }
    },
    measurements: {
      attack: [{ ...present, value: { min: 0.1, max: 30, unit: 'ms' } }],
      release: [UNKNOWN_FACT],
      cpu: [{ state: 'estimated', confidence: 'estimated', value: { value: 3, unit: '%' },
        conditions: { sampleRateKHz: 48, host: 'Hôte de test' } }]
    }
  });
  assert.deepEqual(validateClassification(fixture([compressor])).treatments[0], compressor);
  for (const fact of [{ state: 'absent' }, { ...absence, value: false }, { ...UNKNOWN_FACT, value: 0 }]) {
    assert.throws(() => validateClassification(fixture([
      treatment('compressor', { features: { externalSidechain: fact } })
    ])), /externalSidechain/);
  }
  for (const value of [{ min: 30, max: 0.1, unit: 'ms' }, { value: 10, unit: 'samples' }, { min: 0, unit: 'ms' }]) {
    assert.throws(() => validateClassification(fixture([
      treatment('compressor', { measurements: { attack: [{ ...present, value }] } })
    ])), /attack/);
  }
  const latency = { ...present, value: { value: 0, unit: 'samples' }, conditions: { sampleRateKHz: 96 } };
  assert.throws(() => validateClassification(fixture([
    treatment('compressor', { measurements: { latency48: [latency] } })
  ])), /latency48/);
});

const catalogue = JSON.parse(readFileSync(new URL('../data/plugins.json', import.meta.url), 'utf8')).plugins;
const byId = new Map(catalogue.map(plugin => [plugin.id, plugin]));
const classify = id => normalizeClassification(byId.get(id)).classification;

test('la lecture de tout le catalogue conserve les IDs et les données originales', () => {
  const result = catalogue.map(plugin => {
    Object.freeze(plugin);
    const { classification, ...original } = normalizeClassification(plugin);
    assert.deepEqual(original, plugin, plugin.id);
    assert.strictEqual(validateClassification(classification), classification);
    return original.id;
  });
  assert.deepEqual(result, catalogue.map(plugin => plugin.id));
});

test('LA-2A conserve la preuve Opto et les absences documentées, sans déduire un limiteur', () => {
  const id = 'waves--cla-2a-compressor-limiter';
  const { treatments, features, measurements } = classify(id);
  assert.deepEqual(treatments.map(item => item.type), ['compressor']);
  const [compressor] = treatments;
  assert.equal(compressor.confidence, 'reported');
  assert.equal(compressor.families.find(item => item.id === 'opto').confidence, 'verified');
  assert.equal(compressor.technologies.find(item => item.id === 'vari-mu').state, 'absent');
  for (const [key, tag] of [['externalSidechain', 'opt:sidechain'], ['midSide', 'opt:ms']]) {
    assert.equal(features[key].state, 'absent');
    assert.equal(features[key].confidence, 'verified');
    assert.deepEqual(features[key].evidence, [byId.get(id).featureEvidence[tag]]);
  }
  assert.deepEqual(measurements.latency96[0].value, { value: 0, unit: 'samples' });
});

test('StandardCLIP est un clipper sur déclaration explicite et F6 reste un EQ', () => {
  const clip = classify('sir-audio-tools--standardclip');
  assert.deepEqual(clip.treatments.map(item => item.type), ['clipper']);
  assert.equal(clip.treatments[0].origin.field, 'description');
  assert.equal(clip.treatments[0].confidence, 'reported');
  assert.equal(clip.treatments[0].features?.clippingCurve, undefined);
  const eq = classify('waves--f6-floating-band-dynamic-eq');
  assert.deepEqual(eq.treatments.map(item => item.type), ['equalizer']);
  assert.deepEqual(eq.treatments[0].families.map(({ id, state }) => [id, state]), [['dynamic', 'pending']]);
  assert.equal(eq.treatments[0].features.dynamicProcessing.confidence, 'reported');
  assert.equal(eq.treatments[0].architectures, undefined);
  assert.equal(eq.measurements.latency48[0].confidence, 'verified');
});

test('Channel Strip et format multieffets n’ajoutent aucun traitement secondaire implicite', () => {
  const channel = classify('eventide--echannel');
  assert.deepEqual(channel.treatments.map(item => item.type), ['channel-strip']);
  assert.equal(channel.treatments[0].features?.integratedModules, undefined);
  assert.deepEqual(classify('solid-state-logic--ssl-auto-4kb').treatments, []);
  const patchwork = classify('blue-cat-audio--blue-cat-s-patchwork');
  assert.deepEqual(patchwork.treatments, []);
  assert.deepEqual(patchwork.formats.map(item => item.id), ['multi-effects']);
  const rack = classify('soundtoys--effect-rack');
  assert.deepEqual(rack.treatments, []);
  assert.deepEqual(rack.formats, []);
});

test('une catégorie ambiguë ou explicitement inconnue ne devient pas un traitement', () => {
  for (const category of ['other', 'limiter', 'channel', 'multiband', 'filter', 'multi']) {
    assert.deepEqual(normalizeClassification({ id: 'test--unknown', category }).classification.treatments, []);
  }
  const uncertain = { category: 'comp', categoryEvidence: { status: 'unconfirmed' } };
  assert.deepEqual(normalizeClassification(uncertain).classification.treatments, []);
  const named = excerpt => normalizeClassification({
    category: 'limiter',
    categoryEvidence: { category: 'limiter', status: 'documented', method: 'product-title', excerpt, url: proof.url }
  }).classification.treatments.map(item => item.type);
  assert.deepEqual(named('Example Limiter'), ['limiter']);
  assert.deepEqual(named('Example Clipper Limiter'), []);
  assert.deepEqual(named('Example Compressor Limiter'), []);
});

test('les latences conservent leurs modes, unités, fréquences et sources sans convertir une annonce en zéro', () => {
  const table = 'https://www.waves.com/support/tech-specs/plugin-latency';
  const { measurements } = normalizeClassification({
    latency: { source: table, 48: { variants: [{ label: 'Live', samples: 0 }, { label: 'Studio', samples: 32 }] } },
    latencyInfo: { url: proof.url, sampleRate: 96, values: [{ value: 2, unit: 'ms' }], conditional: true }
  }).classification;
  assert.deepEqual(measurements.latency48.map(fact => [fact.value.value, fact.conditions.mode, fact.confidence]), [
    [0, 'Live', 'verified'], [32, 'Studio', 'verified']
  ]);
  assert.deepEqual(measurements.latency96[0].value, { value: 2, unit: 'ms' });
  assert.deepEqual(measurements.latency96[0].conditions, { sampleRateKHz: 96, conditional: true });
  assert.equal(measurements.latency96[0].confidence, 'reported');
  assert.equal(measurements.latency48[0].evidence[0].url, table);
  assert.deepEqual(normalizeClassification({
    latency: { 48: { samples: 0 }, 96: { samples: 0 } },
    latencyInfo: { url: proof.url, zero: true, sampleRate: null },
    unverifiedLatencyInfo: { url: proof.url, zero: true, sampleRate: 48 }
  }).classification.measurements, {});
});

test('une preuve historique incomplète ne vérifie ni la présence ni l’absence d’une fonction', () => {
  const tag = 'opt:sidechain';
  for (const entry of [
    proof,
    { ...proof, method: 'reviewed-vendor-requirements', present: true },
    { ...proof, method: 'product-description', present: false },
    { ...proof, method: 'latency-table', present: true }
  ]) {
    const plugin = { featureEvidence: { [tag]: entry } };
    for (const tags of [{ tags: [tag] }, { unverifiedTags: [tag] }]) {
      const fact = normalizeClassification({ ...plugin, ...tags }).classification.features.externalSidechain;
      assert.equal(fact.state, 'pending');
      assert.equal(fact.confidence, 'reported');
      assert.deepEqual(fact.evidence, [entry]);
    }
  }
});
