import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canOfferProfileCreation, collectionControllerStatus, controllerProfileStatus } from '../controller-status.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../controller/profile-manifest.json', import.meta.url)));
const catalogue = JSON.parse(fs.readFileSync(new URL('../data/plugins.json', import.meta.url))).plugins;
const f6 = catalogue.find(plugin => plugin.id === 'waves--f6-floating-band-dynamic-eq');
const withoutProfile = catalogue.find(plugin => plugin.id === 'pulsar-audio--w495');

test('le pilote F6 reste non vérifié', () => {
  assert(f6);
  assert.equal(collectionControllerStatus(f6.id, 'owned', 'owned', manifest), 'unverified');
});

test('un plugin possédé sans manifeste affiche Aucun profil', () => {
  assert(withoutProfile);
  assert.equal(collectionControllerStatus(withoutProfile.id, 'owned', 'owned', manifest), 'none');
});

test('un profil présent mais draft reste non vérifié', () => {
  const draft = structuredClone(manifest);
  draft.links[0].profiles[0].status = 'draft';
  assert.equal(controllerProfileStatus(f6.id, draft), 'unverified');
});

test('un plugin non possédé ne reçoit aucun statut Controller dans la bibliothèque', () => {
  assert.equal(collectionControllerStatus(f6.id, 'unknown', 'all', manifest), null);
  assert.equal(collectionControllerStatus(f6.id, 'wishlist', 'owned', manifest), null);
  assert.equal(canOfferProfileCreation('unknown'), false);
});

test('une licence ou un abonnement actif autorisent seuls une future proposition de profil', () => {
  assert.equal(canOfferProfileCreation('owned'), true);
  assert.equal(canOfferProfileCreation('subscription'), true);
  for (const status of ['unknown', 'former', 'trial', 'wishlist', 'not_owned']) assert.equal(canOfferProfileCreation(status), false);
});

test('une fixture vérifiée affiche Profil vérifié', () => {
  const fixture = structuredClone(manifest);
  fixture.links[0].profiles[0].status = 'verified';
  fixture.links[0].profiles[0].variants[0].status = 'verified';
  assert.equal(controllerProfileStatus(f6.id, fixture), 'verified');
});
