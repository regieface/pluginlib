import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionStatus, exportCollection, matchesCollectionScope, mergeCollection, normalizeCollection } from '../collection.mjs';
import { previewCollectionImport } from '../collection-import.mjs';
import { defaultSelections, matchesPluginSelections } from '../filters.mjs';

const plugin = { id: 'test--eq', name: 'EQ', vendor: 'Test', catalogStatus: 'discontinued' };
const plugins = [plugin];
const plan = { vendor: 'Test', plan: 'Suite', status: 'active' };
const otherPlan = { vendor: 'Test', plan: 'Studio', status: 'active' };
const plans = [plan, otherPlan].map(entry => ({ ...entry, products: [{ name: plugin.name }] }));
const licenseDetails = { [plugin.id]: { name: 'EQ Native', notes: 'Historique local' } };
const start = (status = {}, subscriptions = [plan]) => normalizeCollection({ status, subscriptions, licenseDetails }, plugins, plans);
const rights = collection => collectionStatus(plugin, collection, plans);
const changePlan = (collection, status) => mergeCollection(collection, {
  subscriptions: [{ ...plan, status }]
}, plugins, plans);

test('un abonnement expiré ou désactivé passe dans les archives et revient après réactivation', () => {
  for (const status of ['expired', 'inactive']) {
    const archived = changePlan(start(), status);
    assert.equal(rights(archived), 'former');
    assert.equal(matchesCollectionScope(rights(archived), 'archives'), true);
    assert.equal(matchesCollectionScope(rights(archived), 'owned'), false);
    assert.equal(matchesCollectionScope(rights(archived), 'discover'), false);
    assert.deepEqual(archived.licenseDetails, licenseDetails);

    const restored = changePlan(archived, 'active');
    assert.equal(rights(restored), 'subscription');
    assert.equal(matchesCollectionScope(rights(restored), 'owned'), true);
    assert.equal(matchesCollectionScope(rights(restored), 'archives'), false);
    assert.deepEqual(restored.licenseDetails, licenseDetails);
  }
});

test('une licence perpétuelle ou un second abonnement actif maintient le plugin dans Ma collection', () => {
  const perpetual = changePlan(start({ [plugin.id]: 'owned' }), 'expired');
  assert.equal(rights(perpetual), 'owned');
  const overlapping = changePlan(start({ [plugin.id]: 'former' }, [plan, otherPlan]), 'expired');
  assert.equal(rights(overlapping), 'subscription');
  for (const collection of [perpetual, overlapping]) {
    assert.equal(matchesCollectionScope(rights(collection), 'owned'), true);
    assert.equal(matchesCollectionScope(rights(collection), 'archives'), false);
  }
});

test('un statut ancien abonnement importé seul laisse la licence perpétuelle locale active', () => {
  const perpetual = start({ [plugin.id]: 'owned' }, []);
  const preview = previewCollectionImport(JSON.stringify({ status: { [plugin.id]: 'former' } }), perpetual, plugins, plans);
  assert.equal(rights(preview.next), 'owned');
  assert.deepEqual(preview.modified, []);
});

test('l’export préserve l’archive et l’aperçu JSON propose la réactivation sans mutation', () => {
  const archived = changePlan(start(), 'expired');
  const exported = exportCollection(archived, plugins, plans);
  const reimported = normalizeCollection(exported, plugins, plans);
  assert.equal(rights(reimported), 'former');
  assert.deepEqual(reimported.licenseDetails, licenseDetails);

  const preview = previewCollectionImport(JSON.stringify({ subscriptions: [plan] }), reimported, plugins, plans);
  assert.deepEqual(preview.modified.map(({ before, after }) => [before, after]), [['former', 'subscription']]);
  assert.equal(rights(reimported), 'former');
  assert.equal(rights(preview.next), 'subscription');
  assert.deepEqual(preview.next.licenseDetails, licenseDetails);
});

test('la collection active et les archives suivent les droits indépendamment du statut commercial', () => {
  const visible = (product, collection, scope) =>
    matchesCollectionScope(collectionStatus(product, collection, plans), scope) &&
    matchesPluginSelections(product, defaultSelections([], scope));
  const perpetual = start({ [plugin.id]: 'owned' });
  const active = start();
  const expired = changePlan(active, 'expired');
  const maintained = { ...plugin, catalogStatus: 'commercial' };

  assert.equal(visible(plugin, perpetual, 'owned'), true);
  assert.equal(visible(plugin, active, 'owned'), true);
  assert.equal(visible(plugin, active, 'archives'), false);
  assert.equal(visible(plugin, expired, 'owned'), false);
  assert.equal(visible(plugin, expired, 'archives'), true);
  assert.equal(visible(maintained, active, 'owned'), true);
  assert.equal(visible(plugin, perpetual, 'all'), false);
  assert.equal(visible(maintained, active, 'all'), true);
});
