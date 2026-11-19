import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareDemoProject } from '../lprep/lprep-demo.mjs';
import { validateProject } from '../lprep/lprep-project.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';

const fixture = async () => prepareDemoProject(JSON.parse(await readFile(
  new URL('./fixtures/lprep-project-v1.json', import.meta.url), 'utf8'
)));
const findChain = (controller, id) => controller.activeSession.chains.find(chain => chain.chainId === id);
const plugin = { id: 'waves--q10-equalizer', name: 'Q10 Equalizer', vendor: 'Waves' };

async function demo(options) {
  const controller = new LPrepUIController(options);
  controller.openProject(await fixture());
  return controller;
}

test('déplacer puis renommer une chaîne préserve son contenu et survit à Undo/Redo et à la réouverture', async () => {
  const revisionStore = new MemoryRevisionStore();
  const controller = await demo({ revisionStore });
  const before = controller.activeSession;
  assert.equal(controller.moveChain('chain:drum', null).status, 'committed');
  assert.deepEqual(controller.activeSession.chainOrder, [...before.chainOrder.slice(1), 'chain:drum']);
  assert.deepEqual(controller.activeSession.chains, before.chains);
  assert.deepEqual(controller.activeSession.audioGraph, before.audioGraph);
  assert.equal(controller.renameChain('chain:drum', '  Batterie  ').status, 'committed');
  assert.equal(findChain(controller, 'chain:drum').name, 'Batterie');
  assert.equal(controller.undo().status, 'undone');
  assert.equal(findChain(controller, 'chain:drum').name, 'DRUM');
  assert.equal(controller.undo().status, 'undone');
  assert.deepEqual(controller.activeSession, before);
  assert.equal(controller.redo().status, 'redone');
  assert.equal(controller.redo().status, 'redone');
  const { revisionId } = await controller.save();
  const reopened = new LPrepUIController({ revisionStore });
  await reopened.openRevision(revisionId);
  assert.deepEqual(reopened.project, controller.project);
});

test('réordonner les plugins et insérer au milieu rebranche le chemin et le patch, avec les mêmes instances', async () => {
  const controller = await demo();
  controller.proposePatch();
  assert.equal(controller.applyPatch().status, 'committed');
  const before = controller.activeSession;
  const drum = 'chain:drum';
  assert.equal(controller.movePlugin(drum, 'instance:drum-b', 'instance:drum-a').status, 'committed');
  const swapped = controller.activeSession;
  assert.deepEqual(findChain(controller, drum).pluginOrder, ['instance:drum-b', 'instance:drum-a']);
  assert.deepEqual(swapped.pluginInstances, before.pluginInstances);
  assert.deepEqual(swapped.audioGraph.connections.find(edge => edge.connectionId === 'connection:drum-sidechain'),
    before.audioGraph.connections.find(edge => edge.connectionId === 'connection:drum-sidechain'));
  const getPatch = (session, direction) => session.patchAssignments.find(item => item.chainId === drum && item.direction === direction);
  assert.deepEqual(getPatch(swapped, 'input').targetPortRefs, ['port:drum-b-in']);
  assert.deepEqual(getPatch(swapped, 'output').targetPortRefs, ['port:drum-a-out']);
  assert.deepEqual(getPatch(swapped, 'output').resourceRefs, getPatch(before, 'output').resourceRefs);
  assert.equal(controller.insertCatalogPlugin(drum, plugin, 'instance:drum-a').status, 'committed');
  const added = controller.activeSession.pluginInstances.at(-1);
  assert.deepEqual(findChain(controller, drum).pluginOrder, ['instance:drum-b', added.instanceId, 'instance:drum-a']);
  assert.deepEqual(validateProject(controller.project).filter(issue => issue.severity === 'error'), []);
  assert.equal(controller.undo().status, 'undone');
  assert.deepEqual(controller.activeSession, swapped);
  assert.equal(controller.undo().status, 'undone');
  assert.deepEqual(controller.activeSession, before);
  assert.equal(controller.redo().status, 'redone');
  assert.equal(controller.redo().status, 'redone');
  assert.equal(controller.activeSession.pluginInstances.at(-1).instanceId, added.instanceId);
});

test('supprimer un plugin rétablit le chemin restant et la suppression de chaîne conserve les autres patchs', async () => {
  const controller = await demo();
  controller.proposePatch();
  assert.equal(controller.applyPatch().status, 'committed');
  const before = controller.activeSession;
  assert.equal(controller.removePlugin('chain:fx', 'instance:fx').status, 'committed');
  const empty = controller.activeSession;
  assert.deepEqual(findChain(controller, 'chain:fx').pluginOrder, []);
  assert.ok(!empty.audioGraph.nodes.some(node => node.instanceRef === 'instance:fx'));
  assert.equal(controller.undo().status, 'undone');
  assert.deepEqual(controller.activeSession, before);
  assert.equal(controller.redo().status, 'redone');
  assert.deepEqual(controller.activeSession, empty);
  assert.equal(controller.removeChain('chain:fx').status, 'committed');
  const after = controller.activeSession;
  const removedConnections = new Set(before.patchAssignments.filter(item => item.chainId === 'chain:fx')
    .flatMap(item => item.connectionRefs));
  assert.deepEqual(after.audioGraph.connections, before.audioGraph.connections.filter(edge => !removedConnections.has(edge.connectionId)));
  assert.deepEqual(after.chains, before.chains.filter(chain => chain.chainId !== 'chain:fx'));
  assert.deepEqual(after.patchAssignments, before.patchAssignments.filter(item => item.chainId !== 'chain:fx'));
  assert.equal(controller.undo().status, 'undone');
  assert.deepEqual(controller.activeSession, empty);
  assert.equal(controller.redo().status, 'redone');
  assert.deepEqual(controller.activeSession, after);
});

test('un mauvais emplacement ou une suppression qui couperait une autre chaîne ne change ni le projet ni l’historique', async () => {
  const controller = await demo();
  const before = controller.project;
  assert.equal(controller.insertCatalogPlugin('chain:drum', plugin, 'instance:fx').status, 'error');
  assert.equal(controller.movePlugin('chain:fx', 'instance:drum-a', null).status, 'error');
  assert.equal(controller.moveChain('chain:drum', 'missing').status, 'error');
  assert.equal(controller.removeChain('chain:drum').status, 'error');
  assert.equal(controller.removePlugin('chain:drum', 'instance:drum-b').status, 'error');
  assert.deepEqual(controller.project, before);
  assert.equal(controller.undo().status, 'unavailable');
});

test('retirer une présentation indépendante conserve son instance et son routing', async () => {
  const controller = await demo();
  const before = controller.activeSession;
  assert.equal(controller.removePlugin('chain:instrus', 'instance:independent').status, 'committed');
  assert.deepEqual(findChain(controller, 'chain:instrus').presentationLinks, []);
  assert.deepEqual(controller.activeSession.pluginInstances, before.pluginInstances);
  assert.deepEqual(controller.activeSession.audioGraph, before.audioGraph);
});
