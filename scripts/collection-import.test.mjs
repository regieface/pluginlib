import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCollectionImport, previewCollectionImport } from '../collection-import.mjs';

const [eq, comp, delay, reverb] = ['EQ', 'Comp', 'Delay', 'Reverb'].map(name => ({
  id: `test--${name.toLowerCase()}`, name, vendor: 'Test'
}));
const plugins = [eq, comp, delay, reverb];
const plan = { vendor: 'Test', plan: 'Suite', status: 'active' };
const plans = [{ ...plan, products: [{ name: 'Delay' }] }];
const unmatched = { name: 'Licence sans fiche', status: 'owned' };
const initial = {
  status: { [eq.id]: 'trial', [comp.id]: 'owned' },
  subscriptions: [plan],
  licenseDetails: { [eq.id]: { name: 'Ancienne édition', edition: 'Native' } },
  unmatchedLicenses: [unmatched]
};
const source = JSON.stringify({
  status: { [eq.id]: 'owned', [reverb.id]: 'owned' },
  subscriptions: [{ ...plan, status: 'inactive' }],
  licenseDetails: { [eq.id]: { name: 'Nouvelle édition' } },
  unmatchedLicenses: []
});

function setup() {
  let collection = structuredClone(initial);
  const inputHandlers = {}, dialogHandlers = {};
  const input = { addEventListener: (event, handler) => { inputHandlers[event] = handler; } };
  const dialog = {
    showModal() { this.open = true; },
    close() { this.open = false; },
    addEventListener(event, handler) { dialogHandlers[event] = handler; }
  };
  const result = {
    select(text) {
      input.files = [{ text: async () => text }];
      return inputHandlers.change();
    },
    submit(value) { dialogHandlers.submit({ preventDefault() {}, submitter: { value } }); },
    cancel() { dialogHandlers.cancel(); dialog.close(); },
    get collection() { return collection; },
    dialog,
    saves: 0,
    errors: 0
  };
  bindCollectionImport({
    input, dialog,
    prepare: text => previewCollectionImport(text, collection, plugins, plans),
    show: preview => { result.preview = preview; },
    apply: next => { collection = next; result.saves++; },
    onInvalid: () => { result.errors++; }
  });
  return result;
}

test('la sélection prépare les ajouts et les changements de droits sans écrire', async () => {
  const app = setup();
  await app.select(source);
  assert.equal(app.dialog.open, true);
  assert.deepEqual(app.preview.added.map(({ name, before, after }) => [name, before, after]), [
    ['Reverb · Test', 'unknown', 'owned']
  ]);
  assert.deepEqual(app.preview.modified.map(({ name, before, after }) => [name, before, after]), [
    ['EQ · Test', 'trial', 'owned'], ['Delay · Test', 'subscription', 'former']
  ]);
  assert.equal(app.preview.unchanged, 1);
  assert.equal(app.saves, 0);
  assert.deepEqual(app.collection, initial);
});

test('seule la confirmation applique une fois la fusion affichée et conserve les informations locales', async () => {
  const app = setup();
  await app.select(source);
  app.submit('confirm');
  app.submit('confirm');
  assert.equal(app.saves, 1);
  assert.equal(app.dialog.open, false);
  assert.deepEqual(app.collection, app.preview.next);
  assert.deepEqual(app.collection.status, { [eq.id]: 'owned', [comp.id]: 'owned', [reverb.id]: 'owned' });
  assert.deepEqual(app.collection.licenseDetails[eq.id], { name: 'Nouvelle édition', edition: 'Native' });
  assert.deepEqual(app.collection.unmatchedLicenses, [unmatched]);
});

test('Annuler et Échap abandonnent la proposition', async () => {
  for (const cancel of [app => app.submit('cancel'), app => app.cancel()]) {
    const app = setup();
    await app.select(source);
    cancel(app);
    assert.equal(app.dialog.open, false);
    app.submit('confirm');
    assert.equal(app.saves, 0);
    assert.deepEqual(app.collection, initial);
  }
});

test('rejette le JSON mal formé et les formats de collection invalides sans écrire', async () => {
  for (const text of ['{', '[]', '{}', '{"status":[]}', '{"subscriptions":null}', '{"owned":["test--eq"],"licenseDetails":{"test--eq":null}}']) {
    const app = setup();
    await app.select(text);
    assert.equal(app.errors, 1);
    assert.equal(app.dialog.open, undefined);
    assert.equal(app.saves, 0);
    assert.deepEqual(app.collection, initial);
  }
});

test('aucun changement proposé pour les mêmes statuts et informations', async () => {
  const app = setup();
  await app.select(JSON.stringify(initial));
  assert.deepEqual(app.preview.added, []);
  assert.deepEqual(app.preview.modified, []);
  assert.equal(app.preview.unchanged, 3);
  assert.equal(app.preview.unmatchedAdded, 0);
  app.submit('confirm');
  assert.deepEqual(app.collection, initial);
});
