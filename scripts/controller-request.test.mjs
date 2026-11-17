import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { controllerRequestOptions as options, createControllerRequest as create } from '../controller-request.mjs';
const pilot = JSON.parse(readFileSync(new URL('../controller/profile-manifest.json', import.meta.url)));
const id = pilot.links[0].pluginId;
const manifest = structuredClone(pilot);
manifest.links[0].profiles[0].status = 'verified';
manifest.links[0].profiles[0].variants[0].status = 'verified';
test('pilote réel non vérifié non exportable', () => {
  assert.deepEqual(options(id, 'owned', 'owned', pilot), []);
});
test('export local owned et subscription avec variante explicite', () => {
  for (const status of ['owned', 'subscription']) {
    const [request] = options(id, status, 'owned', manifest);
    assert.equal(request.schemaVersion, 1);
    assert.equal(request.variant.pluginName, 'F6 (m)');
    assert.deepEqual(create(id, status, 'owned', manifest, request.variant), request);
    assert.deepEqual(Object.keys(request).sort(), ['licenseStatus', 'pluginId', 'schemaVersion', 'variant']);
  }
});
test('statuts, portée, version et identifiants non autorisés', () => {
  for (const status of ['unknown', 'trial', 'former', 'wishlist', '']) assert.deepEqual(options(id, status, 'owned', manifest), []);
  assert.deepEqual(options(id, 'owned', 'all', manifest), []);
  assert.deepEqual(options('absent', 'owned', 'owned', manifest), []);
  assert.deepEqual(options(id, 'owned', 'owned', { ...manifest, schemaVersion: 2 }), []);
  assert.throws(() => create(id, 'owned', 'owned', manifest, {}));
});
test('profils non vérifiés, références invalides et variantes ambiguës exclus', () => {
  for (const mutate of [p => p.status = 'draft', p => p.profilePath = '../escape.json', p => p.variants[0].status = 'draft', p => p.variants.push(p.variants[0]), p => p.variants[0].host.pluginName = '']) {
    const fixture = structuredClone(manifest); mutate(fixture.links[0].profiles[0]);
    assert.deepEqual(options(id, 'owned', 'owned', fixture), []);
  }
});
