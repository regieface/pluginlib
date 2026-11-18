import { latencyIssues } from '../latency-resolution.mjs';
import { extractPublishedLatency } from './product-facts.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { mergeVendorProducts } from '../catalog.mjs';
import { auditCatalog } from './audit-catalog.mjs';
import { materializeClassification } from './catalog-classification.mjs';
import { assembleCatalogProducts } from './update.mjs';

const vendors = [{ name: 'Example' }, { name: 'Other' }];
const free = { collections: [] };
const checkedAt = '2026-11-01T00:00:00.000Z';
const source = 'https://example.test/manual';
const positive = {
  state: 'present', confidence: 'verified',
  evidence: [{ url: source, method: 'reviewed-source', excerpt: 'Fonction documentée.' }]
};
const negative = { ...positive, state: 'absent', conditions: { mode: 'Live' } };
const modern = {
  version: 1,
  treatments: [
    { type: 'channel-strip', ...positive, features: { integratedModules: { ...positive, value: ['Compressor', 'EQ'] } } },
    { type: 'compressor', ...positive, families: [{ id: 'vca', ...positive }],
      architectures: [{ id: 'multiband', ...positive }] },
    { type: 'equalizer', ...positive }
  ],
  formats: [{ id: 'multi-effects', ...positive }],
  features: { midSide: { state: 'unknown' }, dryWet: { state: 'not-applicable' }, externalSidechain: negative },
  measurements: { latency48: [{ ...positive, value: { value: 0, unit: 'samples' }, conditions: { sampleRateKHz: 48, mode: 'Live' } }] },
  supplemental: { revision: 3 }
};

function plugin(id, name, description, fields = {}) {
  return { id, name, vendor: 'Example', url: `https://example.test/${id}`, category: 'other',
    checkedAt, source: 'fixture', tags: [], description, ...fields };
}

async function fixtureDirectory(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pluginlib-classification-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = pathToFileURL(directory + '/');
  await mkdir(new URL('data/', root));
  const save = (name, data) => writeFile(new URL('data/' + name + '.json', root), JSON.stringify(data));
  const load = async name => JSON.parse(await readFile(new URL('data/' + name + '.json', root), 'utf8'));
  await Promise.all([save('meta', { unrelated: 'preserved' }), save('overrides', overrides), save('free-products', free)]);
  return { root, load, save };
}

test('audit sur des fiches historiques : types sûrs, architectures, formats et cas en revue', async t => {
  const { root, load, save } = await fixtureDirectory(t);
  const fixtures = [
    plugin('ex--cla', 'CLA-2A Compressor Limiter', 'Electro-optical compressor.', {
      featureEvidence: { 'opt:sidechain': { method: 'reviewed-source', present: false, url: source, conditions: { mode: 'Live' } } }
    }),
    plugin('ex--clip', 'StandardCLIP', 'Over the years, our now-iconic clipper has earned recognition.'),
    plugin('ex--f6', 'F6 Floating-Band Dynamic EQ', 'A dynamic equalizer.', {
      latency: { source: 'https://www.waves.com/support/tech-specs/plugin-latency',
        48: { variants: [{ label: 'Live', samples: 0 }, { label: 'Studio', samples: 64 }] },
        96: { samples: 32 } }
    }),
    plugin('ex--multi-comp', 'Example Multiband Compressor', 'A multiband compressor.'),
    plugin('ex--reverb', 'Example Reverb', 'A reverb with convolution and plate modes.'),
    plugin('ex--delay', 'Example Tape Delay', 'An echo with tape delay.'),
    plugin('ex--rack', 'Example Rack', 'Example Rack is a multi-effect plugin.'),
    plugin('ex--unknown', 'Unspecified', ''),
    plugin('ex--ambiguous', 'Example Multiband Dynamics', 'A multiband dynamics processor.')
  ];
  await save('plugins', { plugins: fixtures });
  const report = await auditCatalog(root);
  const catalogue = await load('plugins');
  const records = new Map(catalogue.plugins.map(p => [p.id, p]));
  const treatment = id => records.get(id).classification.treatments;
  const types = id => treatment(id).map(item => item.type);

  assert.equal(catalogue.count, fixtures.length);
  assert.deepEqual([...records.keys()], fixtures.map(p => p.id));
  assert.deepEqual(types('ex--cla'), ['compressor']);
  assert.equal(records.get('ex--cla').classification.features.externalSidechain.state, 'absent');
  assert.deepEqual(records.get('ex--cla').classification.features.externalSidechain.conditions, { mode: 'Live' });
  assert.deepEqual(types('ex--clip'), ['clipper']);
  assert.equal(treatment('ex--clip')[0].confidence, 'reported');
  assert.deepEqual(types('ex--f6'), ['equalizer']);
  assert.equal(treatment('ex--f6')[0].families[0].id, 'dynamic');
  assert.equal(treatment('ex--f6')[0].families[0].state, 'pending');
  assert.deepEqual(records.get('ex--f6').latency, fixtures[2].latency);
  assert.deepEqual(records.get('ex--f6').classification.measurements.latency48.map(fact =>
    [fact.conditions.mode, fact.value.value, fact.value.unit]), [['Live', 0, 'samples'], ['Studio', 64, 'samples']]);
  assert.deepEqual(types('ex--multi-comp'), ['compressor']);
  assert.deepEqual(treatment('ex--multi-comp')[0].families, []);
  assert.equal(treatment('ex--multi-comp')[0].architectures[0].id, 'multiband');
  assert.equal(treatment('ex--reverb')[0].families[0].id, 'plate');
  assert.equal(treatment('ex--reverb')[0].technologies[0].id, 'convolution');
  assert.equal(treatment('ex--delay')[0].families[0].id, 'tape');
  assert.equal(treatment('ex--delay')[0].technologies, undefined);
  assert.deepEqual(types('ex--rack'), []);
  assert.equal(records.get('ex--rack').classification.formats[0].id, 'multi-effects');
  for (const id of ['ex--unknown', 'ex--ambiguous']) {
    assert.deepEqual(types(id), []);
    assert.equal(report.reviewQueue.find(p => p.id === id).classificationReview, 'treatment-unconfirmed');
  }
  const meta = await load('meta');
  assert.equal(meta.unrelated, 'preserved');
  assert.equal(meta.classification.version, 1);
  assert.equal(Object.keys(meta.classification.treatments).length, 17);
  assert.equal(meta.labels.categories.comp, 'Compresseur');
  await auditCatalog(root);
  assert.deepEqual(await load('plugins'), catalogue);
  assert.deepEqual(await load('meta'), meta);
});

test('collectes partielle et complète : identité, preuves, états, modes et champs opaques résistent', async t => {
  const { root, load, save } = await fixtureDirectory(t);
  const old = plugin('ex--stable', 'Example Channel Strip', 'A channel strip.', {
    classification: modern, legacyIds: ['ex--historic'], aliases: ['Example Former'],
    image: 'https://example.test/image.png', pricing: { normal: 49, currency: 'EUR', url: source },
    futureAttribute: { format: 'preserve' },
    latency: { source, 48: { variants: [{ label: 'Live', samples: 0 }, { label: 'Studio', samples: 12 }] }, 96: { samples: 20 } },
    featureEvidence: { 'opt:sidechain': { present: false, url: source, method: 'reviewed-source' }, 'future:evidence': { data: 7 },
      'opt:ms': { present: true, url: source, method: 'product-description', excerpt: 'Earlier note', conditions: { mode: 'Studio' } } }
  });
  const untouched = plugin('other--original', 'Other Delay', 'A tape delay.', { vendor: 'Other', classification: modern });
  const archived = plugin('ex--transfer', 'License transfer fee', '', { exclude: true });
  const duplicate = plugin('ex--historic', 'Old alias', '', { duplicateOf: old.id });
  const previous = [old, untouched, archived, duplicate];
  const incoming = plugin('ex--renamed', 'New Channel Strip', '', {
    url: old.url, image: null, pricing: null,
    latency: { source, 48: { variants: [{ label: 'Live', samples: 0 }] }, 96: null },
    classification: { version: 1, treatments: [] }
  });
  const sparseDuplicate = { ...incoming, id: old.id, name: 'New Channel Strip', classification: undefined };
  const vendorMerged = mergeVendorProducts([old, archived, duplicate], [incoming]);
  assert.equal(vendorMerged.find(p => p.id === old.id).classification, modern);

  for (const only of [vendor => vendor === 'Example', () => true]) {
    const assembled = assembleCatalogProducts(previous, [...vendorMerged, sparseDuplicate], vendors, {}, free, only);
    await save('plugins', { plugins: assembled });
    await auditCatalog(root);
    const output = await load('plugins');
    const found = output.plugins.find(p => p.id === old.id);
    assert.deepEqual(output.plugins.map(p => p.id).sort(), previous.map(p => p.id).sort());
    for (const key of ['classification', 'legacyIds', 'image', 'pricing', 'futureAttribute', 'latency', 'description']) {
      assert.deepEqual(found[key], old[key], key);
    }
    assert.deepEqual(found.featureEvidence['opt:sidechain'], old.featureEvidence['opt:sidechain']);
    assert.deepEqual(found.featureEvidence['future:evidence'], old.featureEvidence['future:evidence']);
    assert.equal(found.featureEvidence['opt:ms'], undefined);
    assert.deepEqual(found.unverifiedFeatureEvidence['opt:ms'], [old.featureEvidence['opt:ms']]);
    assert.ok(found.aliases.includes(old.name));
    assert.deepEqual(output.plugins.find(p => p.id === untouched.id).classification, modern);
    const second = assembleCatalogProducts(output.plugins, [...vendorMerged, sparseDuplicate], vendors, {}, free, only);
    await save('plugins', { plugins: second });
    await auditCatalog(root);
    assert.deepEqual((await load('plugins')).plugins, output.plugins);
  }
});

test('une correction moderne sourcée combine les assertions et garde les données hors correction', async t => {
  const original = plugin('ex--modern', 'Example Channel Strip', 'Channel strip.', { classification: modern });
  const correction = { classification: { version: 1, treatments: [], features: { externalSidechain: positive } } };
  const { root, save, load } = await fixtureDirectory(t, { [original.id]: {
    ...correction, id: 'ex--wrong', categoryEvidence: { category: 'eq', method: 'reviewed-source', url: source, excerpt: 'Égaliseur' }
  } });
  await save('plugins', { plugins: [original] });
  await auditCatalog(root);
  const [result] = (await load('plugins')).plugins;
  assert.equal(result.id, original.id);
  assert.equal(result.category, 'eq');
  assert.deepEqual(result.classification, { ...modern, features: { ...modern.features, externalSidechain: positive } });
  const invalid = { classification: { ...correction.classification, features: {
    externalSidechain: { ...positive, confidence: 'reported' }
  } } };
  assert.throws(() => materializeClassification(original, invalid), /ex--modern.*vérifiée et sourcée/);
});


test('les modes indépendants et le conflit arrivent jusqu’aux données de la fiche et de l’audit', async t => {
  const { root, load, save } = await fixtureDirectory(t);
  const inputs = [
    ['0 samples Live / 512 samples Studio at 48 kHz.', 'https://example.test/manual-a'],
    ['64 samples Live at 48 kHz.', 'https://example.test/manual-b'],
    ['Latency: 256 samples at 48 kHz.', 'https://www.waves.com/support/tech-specs/plugin-latency']
  ];
  const base = plugin('ex--modes', 'Mode Test', 'A compressor.');
  const [a, b, c] = inputs.map(([text, source]) => extractPublishedLatency(text, source, checkedAt));
  // A quantified source with an explicit Offline scope, applied to its scalar and report.
  c.latency.source = inputs[2][1];
  c.latency[48].conditions = { mode: 'Offline' };
  c.latencyInfo.mode = 'Offline';
  for (const [snapshot, [, source]] of [[a, inputs[0]], [b, inputs[1]]]) snapshot.latency.source = source;
  const outcomes = [];
  for (const observations of [[a, b, c], [c, b, a], [b, a, c]]) {
    const record = observations.reduce((old, reading) => mergeVendorProducts([old], [{ id: base.id, ...reading }])[0], base);
    await save('plugins', { plugins: [record] });
    await auditCatalog(root);
    const [output] = (await load('plugins')).plugins;
    assert.equal(output.latency[48].samples, null);
    assert.deepEqual(latencyIssues(output), [{ rate: 48, status: 'conflict', modes: ['Live'] }]);
    assert.deepEqual(output.classification.measurements.latency48.map(fact => [
      fact.conditions.mode, fact.value.value, fact.evidence[0].url
    ]), [['Offline', 256, inputs[2][1]], ['Studio', 512, inputs[0][1]]]);
    assert.deepEqual(output.latency[48].variants.map(({ label, samples }) => [label, samples]), [['Offline', 256], ['Studio', 512]]);
    assert.equal(new Set(output.latencyInfo.reports.map(report => report.url)).size, 3);
    assert.equal(output.tags.includes('opt:zl'), false);
    await auditCatalog(root);
    assert.deepEqual((await load('plugins')).plugins[0], output);
    outcomes.push([output.latency[48].variants.map(({ label, samples }) => [label, samples]),
      output.classification.measurements.latency48.map(({ value, conditions }) => [value, conditions])]);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[0], outcomes[2]);
});
