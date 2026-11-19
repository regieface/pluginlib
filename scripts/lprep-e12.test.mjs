import test from 'node:test';
import assert from 'node:assert/strict';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';
import { patchDisplayCells, patchRows } from '../lprep/lprep-patch-view.mjs';
import { validateProject } from '../lprep/lprep-project.mjs';

const setup = () => new LPrepUIController({ revisionStore: new MemoryRevisionStore() });

test('un projet et ses sessions nommées restent indépendants des révisions du projet précédent', async () => {
  const controller = setup();
  const archived = controller.createProject('Projet initial');
  const previous = await controller.save();
  assert.throws(() => controller.createProject('   '), /Nom/i);
  assert.equal(controller.project.projectId, archived.projectId);
  controller.createProject('Projet neuf');
  assert.equal(controller.createSession('Répétition').status, 'committed');
  assert.equal(controller.duplicateActiveSession().status, 'committed');
  assert.equal(controller.renameActiveSession('Concert').status, 'committed');
  assert.equal(controller.renameProject('Tournée').status, 'committed');
  const saved = await controller.save();
  await controller.openRevision(previous.revisionId);
  assert.deepEqual(controller.project, archived);
  await controller.openRevision(saved.revisionId);
  assert.equal(controller.project.name, 'Tournée');
  assert.deepEqual(controller.project.sessions.map(session => session.name), ['Session 1', 'Répétition', 'Concert']);
});

test('Mono vers Stéréo garde ses ports réels et ses deux affectations de sortie avec un plugin', async () => {
  const controller = setup();
  controller.createProject();
  assert.equal(controller.createChain({ audioFormat: 'mono-to-stereo', sidechainCount: 1 }).status, 'committed');
  const [chain] = controller.activeSession.chains;
  const identities = chain.mainPath;
  const row = () => patchRows(controller.activeSession)[0];
  assert.deepEqual([row().input.width, row().output.width, row().sidechains.length], [1, 2, 1]);
  controller.proposePatch();
  assert.equal(controller.applyPatch().status, 'committed');
  assert.deepEqual(patchDisplayCells(row().input).map(cell => [cell.position, cell.number]), [[1, 1]]);
  assert.deepEqual(patchDisplayCells(row().output).map(cell => [cell.side, cell.number]), [['L', 1], ['R', 2]]);
  assert.equal(controller.updateChainSettings(chain.chainId, { audioFormat: 'mono' }).status, 'error');
  const before = controller.activeSession;
  const added = controller.insertCatalogPlugin(chain.chainId, { id: 'test--plugin', name: 'Test', vendor: 'Test' }, null, null);
  assert.equal(added.status, 'committed');
  assert.equal(row().input.portId, identities.inputBoundaryPortRef);
  assert.equal(row().output.portId, identities.outputBoundaryPortRef);
  assert.deepEqual(controller.activeSession.patchAssignments, before.patchAssignments);
  controller.undo();
  assert.deepEqual(controller.activeSession, before);
  controller.redo();
  const { revisionId } = await controller.save();
  await controller.openRevision(revisionId);
  assert.deepEqual([row().input.width, row().output.width], [1, 2]);
  assert.deepEqual(validateProject(controller.project).filter(issue => issue.severity === 'error'), []);
});

test('une chaîne vide passe à Mono vers Stéréo sans toucher au graphe Sidechain', () => {
  const controller = setup();
  controller.createProject();
  controller.createChain({ audioFormat: 'mono', sidechainCount: 2 });
  const id = controller.activeSession.chainOrder[0];
  const [before] = patchRows(controller.activeSession);
  assert.equal(controller.updateChainSettings(id, { audioFormat: 'mono-to-stereo' }).status, 'committed');
  const [after] = patchRows(controller.activeSession);
  assert.equal(after.output.width, 2);
  assert.deepEqual(after.sidechains, before.sidechains);
  controller.undo();
  assert.equal(patchRows(controller.activeSession)[0].output.width, 1);
  controller.redo();
  assert.equal(patchRows(controller.activeSession)[0].output.width, 2);
});

test('les droits PluginLib distinguent les licences, abonnements et archives après plusieurs imports', async () => {
  const { catalogEntries, importCatalogRights } = await import('../lprep/lprep-catalog-view.mjs');
  const plugins = ['owned', 'active', 'archived', 'installed'].map(name => ({
    id: 'example--' + name, name, vendor: 'Example'
  }));
  const catalog = { plugins, plans: [
    { id: 'plan-active', vendor: 'Example', plan: 'Actif', products: [{ name: 'active' }] },
    { id: 'plan-archived', vendor: 'Example', plan: 'Archivé', products: [{ name: 'archived' }] }
  ] };
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const collection = { app: 'PluginLib', version: 3, status: {
    'example--owned': 'owned', 'example--active': 'subscription', 'example--archived': 'former'
  }, subscriptions: [
    { id: 'plan-active', vendor: 'Example', plan: 'Actif', status: 'active' },
    { id: 'plan-archived', vendor: 'Example', plan: 'Archivé', status: 'expired' }
  ], installed: ['example--installed'] };
  importCatalogRights(catalog, storage, collection);
  importCatalogRights(catalog, storage, collection);
  assert.deepEqual(catalogEntries(catalog, storage, 'owned').map(plugin => plugin.name), ['owned', 'active']);
  assert.deepEqual(catalogEntries(catalog, storage, 'archives').map(plugin => plugin.name), ['archived']);
  assert.equal(catalogEntries(catalog, storage, 'all').length, 4);
  assert.equal(JSON.parse(values.get('pluginlib.subscriptions.v1')).length, 2);
});
