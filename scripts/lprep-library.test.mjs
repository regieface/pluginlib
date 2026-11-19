import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readCollectionStorage, writeCollectionStorage, isCollectionStorageKey } from '../collection-storage.mjs';
import { normalizeCollection } from '../collection.mjs';
import { previewCollectionImport } from '../collection-import.mjs';
import { catalogEntries } from '../lprep/lprep-catalog-view.mjs';

const require = createRequire(import.meta.url);
const { LIBRARY_URL, localAsset } = require('../lprep-desktop/assets.cjs');

test('L-Prep intégré lit la collection D1 sur les clés existantes et préserve ses données de licence', () => {
  const storage = new Map([['pluginlib.owned.v1', '["test--legacy"]']]);
  const local = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  const plugins = ['legacy', 'audio', 'synth'].map(name => ({ id: 'test--' + name, name, vendor: 'Test' }));
  plugins[2].recordType = 'instrument';
  const catalog = { plugins, plans: [] };
  assert.deepEqual(catalogEntries(catalog, local, 'owned').map(plugin => plugin.name), ['legacy']);
  const existing = normalizeCollection(readCollectionStorage(local), plugins, []);
  const next = previewCollectionImport(JSON.stringify({
    status: { 'test--legacy': 'unknown', 'test--audio': 'owned', 'test--synth': 'owned' },
    licenseDetails: { 'test--audio': { name: 'Licence importée' } },
    unmatchedLicenses: [{ name: 'Licence à rapprocher' }]
  }), existing, plugins, []).next;
  writeCollectionStorage(local, next);
  const restored = readCollectionStorage(local);
  assert.equal(restored.licenseDetails['test--audio'].name, 'Licence importée');
  assert.equal(restored.unmatchedLicenses[0].name, 'Licence à rapprocher');
  assert.equal(restored.status['test--synth'], 'owned');
  assert.deepEqual(catalogEntries(catalog, local, 'owned').map(plugin => plugin.name), ['audio']);
  assert.deepEqual(catalogEntries(catalog, local, 'all').map(plugin => plugin.name), ['legacy', 'audio']);
  assert.equal(isCollectionStorageKey('pluginlib.licenseDetails.v1'), true);
  assert.equal(isCollectionStorageKey('lprep.last-opened-revision'), false);
});

test('le bundle ne sert que les ressources publiques nécessaires à la Bibliothèque intégrée', () => {
  const page = localAsset(LIBRARY_URL);
  assert.equal(page.file, 'index.html');
  assert.match(page.headers['Content-Security-Policy'], /frame-ancestors 'self'/);
  assert.match(page.headers['Content-Security-Policy'], /script-src 'self'/);
  assert.equal(localAsset('lprep://app/catalog-data.mjs').file, 'catalog-data.mjs');
  assert.equal(localAsset('lprep://app/controller/Profiles/private.json'), null);
});
