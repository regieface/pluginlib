import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogEntries, localThumbnail, sessionRows } from '../lprep/lprep-catalog-view.mjs';
import { prepareDemoProject } from '../lprep/lprep-demo.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';

const fixture = async () => prepareDemoProject(JSON.parse(await readFile(
  new URL('./fixtures/lprep-project-v1.json', import.meta.url), 'utf8'
)));

test('G1 suit les ordres de session et de plugin et résout les visuels par identifiant catalogue', async () => {
  const { sessions: [session] } = await fixture();
  const catalog = new Map([['example--compressor', { image: 'art/compressor.png' }]]);
  const rows = sessionRows(session, catalog);
  assert.deepEqual(rows.map(({ chain }) => chain.chainId), session.chainOrder);
  for (const { chain, plugins, independent } of rows) {
    assert.deepEqual(plugins.map(plugin => plugin.id), chain.pluginOrder);
    assert.deepEqual(independent.map(plugin => plugin.id), chain.presentationLinks);
  }
  assert.equal(rows[0].group, 'Groupe 1');
  assert.deepEqual(rows[0].plugins.map(plugin => plugin.image), ['art/compressor.png', 'art/compressor.png']);
  assert.equal(rows[1].plugins[0].image, undefined);
  assert.ok(rows[1].plugins[0].name);
});

test('G1 résout les fichiers locaux sans charger les URL externes', () => {
  const base = new URL('http://127.0.0.1:5500/pluginlib/');
  assert.equal(localThumbnail('art/plugin.png', base), 'http://127.0.0.1:5500/pluginlib/art/plugin.png');
  assert.equal(localThumbnail('https://vendor.example/plugin.png', base), null);
  assert.equal(localThumbnail('//vendor.example/plugin.png', base), null);
  assert.equal(localThumbnail('', base), null);
});

test('Ma collection utilise les droits PluginLib, y compris les abonnements actifs', () => {
  const plugins = [
    { id: 'v--owned', name: 'Owned', vendor: 'V' },
    { id: 'v--plan', name: 'Plan', vendor: 'V' },
    { id: 'v--trial', name: 'Trial', vendor: 'V' },
    { id: 'v--hidden', name: 'Hidden', vendor: 'V', exclude: true }
  ];
  const plans = [{ id: 'bundle', vendor: 'V', plan: 'Bundle', products: [{ name: 'Plan' }] }];
  const values = new Map([
    ['pluginlib.owned.v1', JSON.stringify(['v--owned'])],
    ['pluginlib.status.v2', JSON.stringify({ 'v--trial': 'trial', 'v--hidden': 'owned' })],
    ['pluginlib.subscriptions.v1', JSON.stringify([{ id: 'bundle', vendor: 'V', plan: 'Bundle', status: 'active' }])]
  ]);
  const storage = { getItem: key => values.get(key) };
  assert.deepEqual(catalogEntries({ plugins, plans }, storage, 'owned').map(plugin => plugin.id), ['v--owned', 'v--plan']);
  assert.deepEqual(catalogEntries({ plugins, plans }, storage, 'all').map(plugin => plugin.id), ['v--owned', 'v--plan', 'v--trial']);
});

test('les trois types de chaînes gardent les valeurs du moteur après sauvegarde et réouverture', async () => {
  const revisionStore = new MemoryRevisionStore();
  const controller = new LPrepUIController({ revisionStore });
  controller.createProject('Projet G1');
  const roles = ['insert', 'fx', 'monitoring'];
  for (const role of roles) assert.equal(controller.createChain({ name: role, role }).status, 'committed');
  const { revisionId } = await controller.save();
  const reopened = new LPrepUIController({ revisionStore });
  await reopened.openRevision(revisionId);
  const rows = sessionRows(reopened.activeSession, new Map());
  assert.deepEqual(rows.map(({ chain }) => chain.role), roles);
  assert.deepEqual(rows.map(({ chain }) => chain.color), ['#6574d8', '#f95ad8', '#00c4a1']);
  assert.ok(rows.every(({ chain }) => chain.inputFormat === 'stereo' && chain.outputFormat === 'stereo'));
  assert.equal(rows[0].chain.compensationGroupId, reopened.activeSession.compensationGroups[0].compensationGroupId);
  assert.ok(rows.slice(1).every(({ chain }) => chain.compensationGroupId === null));
});
