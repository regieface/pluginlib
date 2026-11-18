import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { isPlanMember } from '../collection.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const { count, plugins } = read('../data/plugins.json');
const descriptions = read('../data/descriptions-fr.json');
const { plans } = read('../data/subscriptions.json');
const { schemaVersion, links } = read('../controller/profile-manifest.json');
const ids = plugins.map(p => p.id).sort();
const byId = new Map(plugins.map(p => [p.id, p]));
const loaded = plugins.filter(p => !p.duplicateOf && !p.exclude);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const defined = (value, keys) => Object.fromEntries(
  keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])
);
const proofKeys = ['url', 'method', 'excerpt', 'checkedAt', 'present', 'status', 'reason', 'candidates', 'category', 'type'];
const proofFields = [
  'identityEvidence', 'duplicateEvidence', 'descriptionEvidence', 'imageEvidence',
  'categoryEvidence', 'platformEvidence', 'statusEvidence', 'recordTypeEvidence', 'colorationInfo'
];

function protectedFacts(plugin) {
  const facts = new Map();
  function record(prefix, value, keys) {
    if (!value) return;
    for (const [key, field] of Object.entries(defined(value, keys))) {
      if (field != null) facts.set(prefix + '.' + key, field);
    }
  }

  record('fiche', plugin, [
    'name', 'vendor', 'url', 'source', 'checkedAt', 'duplicateOf', 'exclusionReason',
    'classifiedBy', 'category', 'catalogStatus', 'recordType'
  ]);
  for (const key of ['aliases', 'legacyIds', 'tags']) {
    for (const value of plugin[key] || []) facts.set(key + '.' + value, true);
  }
  for (const key of proofFields) {
    record(key, plugin[key], [...proofKeys, 'kind', 'noteFr']);
  }
  for (const [tag, value] of Object.entries(plugin.featureEvidence || {})) {
    record('featureEvidence.' + tag, value, proofKeys);
  }
  record('categoryReview', plugin.categoryReview, ['version', 'status', 'originalCategory']);
  record('featureReview', plugin.featureReview, ['version', 'method']);
  record('presentationSource', plugin.presentationSource, ['url', 'hash', 'method', 'checkedAt']);
  record('descriptionFr', descriptions[plugin.id], ['sourceUrl', 'sourceHash', 'sourceText', 'text']);

  const modes = values => values.map(mode => defined(mode, ['label', 'samples']));
  record('latency', plugin.latency, ['source']);
  for (const rate of [48, 96]) {
    const prefix = 'latency.' + rate;
    const value = plugin.latency?.[rate];
    record(prefix, value, ['samples', 'note', 'zeroMode']);
    if (value?.variants?.length) facts.set(prefix + '.variants', modes(value.variants));
  }
  for (const prefix of ['latencyInfo', 'unverifiedLatencyInfo']) {
    const value = plugin[prefix];
    record(prefix, value, ['zero', 'conditional', 'sampleRate', 'url', 'checkedAt', 'excerpt', 'noteFr']);
    if (value?.values?.length) facts.set(prefix + '.values', value.values.map(item => defined(item, ['value', 'unit'])));
    if (value?.modes?.length) facts.set(prefix + '.modes', modes(value.modes));
  }
  return facts;
}

const rows = ids.map(id => protectedFacts(byId.get(id)));
const planReferences = plans.map(plan => [
  plan.id, plan.vendor, plan.plan, plan.source,
  plan.products.map(p => JSON.stringify([p.name, p.url])).sort(),
  loaded.filter(p => isPlanMember(p, plan)).map(p => p.id).sort()
]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);

function reference() {
  const fields = [...new Set(rows.flatMap(row => [...row.keys()]))].sort();
  return {
    ids: digest(ids),
    loadedIds: digest(loaded.map(p => p.id).sort()),
    plans: digest(planReferences),
    facts: Object.fromEntries(fields.map(field => {
      const positions = Buffer.alloc(Math.ceil(ids.length / 8));
      const values = [];
      rows.forEach((row, index) => {
        if (!row.has(field)) return;
        positions[index >> 3] |= 1 << (index % 8);
        values.push(row.get(field));
      });
      // Omit trailing zero bytes. A bit marks an existing value to protect.
      const end = positions.findLastIndex(byte => byte !== 0);
      return [field, [deflateRawSync(positions.subarray(0, end + 1)).toString('base64'), digest(values)]];
    }))
  };
}

function referencedValues(rows, field, mask) {
  const positions = inflateRawSync(Buffer.from(mask, 'base64'));
  return rows.flatMap((row, index) =>
    positions[index >> 3] & (1 << (index % 8)) ? [row.get(field)] : []
  );
}

if (process.argv.includes('--print-reference')) {
  const { facts, ...summary } = reference();
  const header = JSON.stringify(summary, null, 2).slice(0, -2);
  const entries = Object.entries(facts).map(([key, value]) =>
    '    ' + JSON.stringify(key) + ': ' + JSON.stringify(value)
  );
  process.stdout.write(header + ',\n  "facts": {\n' + entries.join(',\n') + '\n  }\n}\n');
} else {
  const baseline = read('./fixtures/migration-baseline.json');

  test('référence A : ensemble exact des IDs, fiches visibles et jointures historiques', () => {
    assert.equal(count, 2699);
    assert.equal(plugins.length, count);
    assert.equal(byId.size, count);
    assert.equal(digest(ids), baseline.ids);
    assert.equal(loaded.length, 2690);
    assert.equal(digest(loaded.map(p => p.id).sort()), baseline.loadedIds);
    const duplicates = plugins.filter(p => p.duplicateOf);
    const exclusions = plugins.filter(p => p.exclude);
    assert.equal(duplicates.length, 3);
    assert.equal(exclusions.length, 6);
    for (const duplicate of duplicates) {
      const target = byId.get(duplicate.duplicateOf);
      assert.ok(target && !target.exclude && !target.duplicateOf, duplicate.id);
      assert.ok(target.legacyIds?.includes(duplicate.id), duplicate.id);
    }
    for (const plugin of plugins) {
      for (const id of plugin.legacyIds || []) assert.equal(byId.get(id)?.duplicateOf, plugin.id, id);
    }
    for (const id of Object.keys(descriptions)) assert.ok(byId.has(id), id);
    assert.equal(loaded.filter(p => p.category === 'other').length, 1273);
  });

  test('référence A : les valeurs de preuve, de provenance et de latence existantes sont conservées', () => {
    const changed = Object.entries(baseline.facts)
      .filter(([field, [mask, expected]]) => digest(referencedValues(rows, field, mask)) !== expected)
      .map(([field]) => field);
    assert.deepEqual(changed, [], 'Champs de référence modifiés ou supprimés');
  });

  test('référence A : les preuves ajoutées sont acceptées et une perte sur une autre fiche est détectée', () => {
    const field = 'featureEvidence.opt:sidechain.present';
    const [mask, expected] = baseline.facts[field];
    const changed = rows.map(row => new Map(row));
    const empty = changed.find(row => !row.has(field));
    empty.set(field, true);
    empty.set('featureEvidence.new-proof.present', true);
    assert.equal(digest(referencedValues(changed, field, mask)), expected);
    const negative = changed.find(row => row.get(field) === false);
    negative.delete(field);
    assert.notEqual(digest(referencedValues(changed, field, mask)), expected);
  });

  test('référence A : références d’abonnement et membres publics stables', () => {
    assert.equal(digest(planReferences), baseline.plans);
  });

  test('référence A : le lien PLC F6 garde ses identifiants et la variante reste draft', () => {
    assert.equal(schemaVersion, 1);
    assert.deepEqual(links.map(link => link.pluginId), ['waves--f6-floating-band-dynamic-eq']);
    const [link] = links;
    assert.ok(loaded.some(p => p.id === link.pluginId));
    assert.equal(link.profiles.length, 1);
    const [profile] = link.profiles;
    assert.equal(profile.profileId, 'waves-f6');
    assert.equal(profile.profilePath, 'Profiles/waves-f6.json');
    assert.equal(profile.status, 'draft');
    assert.equal(read('../controller/' + profile.profilePath).id, profile.profileId);
    assert.equal(profile.variants.length, 1);
    const [variant] = profile.variants;
    assert.equal(variant.status, 'draft');
    assert.equal(variant.format, 'AudioUnit');
    assert.equal(variant.channelLayout, 'mono');
    assert.equal(variant.host.application, 'LiveProfessor');
    assert.equal(variant.host.pluginName, 'F6 (m)');
    assert.equal(variant.host.testedVersion, '2026.1.0');
    assert.equal(variant.metadataPath, 'Metadata/waves-f6-au.json');
  });
}
