import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import { catalogEntries, importCatalogRights } from '../lprep/lprep-catalog-view.mjs';

const require = createRequire(import.meta.url);
const { START_URL, localAsset, sharedModules, dataFiles } = require('../lprep-desktop/assets.cjs');

test('l’application Electron sert les ressources nécessaires et protège le périmètre local', async () => {
  assert.equal(localAsset(START_URL).file, 'lprep/index.html');
  assert.match(localAsset(START_URL).headers['Content-Security-Policy'], /script-src 'self'/);
  for (const file of [...sharedModules, ...dataFiles, 'lprep/app.mjs', 'lprep/thumbnail-worker.mjs']) {
    assert.equal(localAsset('lprep://app/' + file).file, file);
    await access(new URL('../' + file, import.meta.url));
  }
  for (const url of [
    'file:///lprep/index.html', 'lprep://external/lprep/', 'lprep://app/.git/config',
    'lprep://app/lprep/%2e%2e/note.md', 'lprep://app/lprep/%2fetc%2fpasswd',
    'lprep://app/collection-privee/licences.json', 'lprep://app/data/overrides.json'
  ]) assert.equal(localAsset(url), null);
});

test('la politique réseau permet au worker d’images de charger leur contenu et bloque le code distant', () => {
  const document = localAsset(START_URL).headers['Content-Security-Policy'];
  assert.match(document, /connect-src 'self'(?:;|$)/);
  assert.match(document, /img-src 'self' https: http:/);
  const worker = localAsset('lprep://app/lprep/thumbnail-worker.mjs').headers['Content-Security-Policy'];
  assert.match(worker, /script-src 'self'(?:;|$)/);
  assert.match(worker, /connect-src 'self' https: http:/);
});

test('les droits importés alimentent Ma collection sans copier les détails de licence', () => {
  const catalog = { plugins: [{ id: 'test--plugin', name: 'Test', vendor: 'Test' }], plans: [] };
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const data = { app: 'PluginLib', version: 3, status: { 'test--plugin': 'owned' },
    subscriptions: [{ vendor: 'Test', plan: 'Plan', status: 'inactive', email: 'non repris' }],
    licenseDetails: { 'test--plugin': { email: 'non repris' } } };
  importCatalogRights(catalog, storage, data);
  assert.deepEqual(catalogEntries(catalog, storage, 'owned'), catalog.plugins);
  assert.equal([...values.values()].some(value => value.includes('non repris')), false);
  assert.throws(() => importCatalogRights(catalog, storage, { version: 1 }), /Ma collection/);
});
