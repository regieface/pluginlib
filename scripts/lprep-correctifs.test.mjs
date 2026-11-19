import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAudioConnection } from '../lprep/lprep-audio-graph.mjs';
import { prepareDemoProject } from '../lprep/lprep-demo.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';

const fixture = async () => prepareDemoProject(JSON.parse(await readFile(
  new URL('./fixtures/lprep-project-v1.json', import.meta.url), 'utf8'
)));
const plugin = { id: 'waves--q10-equalizer', name: 'Q10 Equalizer', vendor: 'Waves' };
const order = (controller, chainId) => controller.activeSession.chains.find(chain => chain.chainId === chainId).pluginOrder;

test('une démo ne remplace pas les modifications sans accord et crée un projet distinct', async () => {
  const template = await fixture();
  const revisionStore = new MemoryRevisionStore();
  const controller = new LPrepUIController({ revisionStore });
  controller.openProject(template);
  assert.equal(controller.hasUnsavedChanges, false);
  assert.equal(controller.appendCatalogPlugin('chain:drum', plugin).status, 'committed');
  const { revisionId } = await controller.save();
  const saved = controller.project;
  assert.equal(controller.hasUnsavedChanges, false);
  controller.renameProject('Modification locale');
  const edited = controller.project;
  assert.equal(controller.openDemo(template).status, 'confirmation-required');
  assert.deepEqual(controller.project, edited);
  assert.equal(controller.openDemo(template, { replaceCurrent: true }).status, 'opened');
  assert.notEqual(controller.project.projectId, saved.projectId);
  assert.equal(controller.activeSession.name, template.sessions[0].name);
  assert.ok(!controller.activeSession.pluginInstances.some(instance => instance.catalogRef.pluginId === plugin.id));
  await controller.save();
  assert.equal((await controller.listSavedProjects()).length, 2);
  await controller.openRevision(revisionId);
  assert.deepEqual(controller.project, saved);
});

test('le suivi des modifications tient compte des annulations et de la révision réellement sauvegardée', async () => {
  const controller = new LPrepUIController({ revisionStore: new MemoryRevisionStore() });
  controller.createProject();
  const saving = controller.save();
  controller.renameProject('Édition pendant la sauvegarde');
  await saving;
  assert.equal(controller.hasUnsavedChanges, true);
  controller.undo();
  assert.equal(controller.hasUnsavedChanges, false);
  controller.redo();
  assert.equal(controller.hasUnsavedChanges, true);
});

test('le transfert conserve instance, état, variantes, branches et patchs et se restaure après sauvegarde', async () => {
  const revisionStore = new MemoryRevisionStore();
  const controller = new LPrepUIController({ revisionStore });
  const project = await fixture();
  const instance = project.sessions[0].pluginInstances.find(entry => entry.instanceId === 'instance:drum-a');
  instance.opaqueStateRefs = ['state:existing'];
  controller.openProject(project);
  controller.proposePatch();
  assert.equal(controller.applyPatch().status, 'committed');
  const before = controller.activeSession;
  assert.equal(controller.movePlugin('chain:drum', instance.instanceId, 'instance:fx', 'chain:fx').status, 'committed');
  assert.deepEqual(order(controller, 'chain:drum'), ['instance:drum-b']);
  assert.deepEqual(order(controller, 'chain:fx'), [instance.instanceId, 'instance:fx']);
  const after = controller.activeSession;
  assert.deepEqual(after.pluginInstances, before.pluginInstances);
  assert.deepEqual(after.audioGraph.ports, before.audioGraph.ports);
  assert.deepEqual(after.audioGraph.connections.filter(edge => edge.routingRole !== 'main'),
    before.audioGraph.connections.filter(edge => edge.routingRole !== 'main'));
  for (const assignment of after.patchAssignments) {
    const prior = before.patchAssignments.find(value => value.assignmentId === assignment.assignmentId);
    assert.deepEqual(assignment.resourceRefs, prior.resourceRefs);
    assert.deepEqual(assignment.connectionRefs, prior.connectionRefs);
  }
  assert.equal(controller.undo().status, 'undone');
  assert.deepEqual(controller.activeSession, before);
  assert.equal(controller.redo().status, 'redone');
  assert.deepEqual(controller.activeSession, after);
  const { revisionId } = await controller.save();
  const reopened = new LPrepUIController({ revisionStore });
  await reopened.openRevision(revisionId);
  assert.deepEqual(reopened.activeSession, after);
});

test('un transfert est refusé atomiquement si les ports sont incompatibles ou si une boucle apparaît', async () => {
  const controller = new LPrepUIController();
  const project = await fixture();
  const graph = project.sessions[0].audioGraph;
  graph.connections.push(createAudioConnection({
    graphId: graph.graphId, sourcePortId: 'port:fx-out', destinationPortId: 'port:drum-a-in', routingRole: 'secondary'
  }));
  controller.openProject(project);
  const before = controller.project;
  const mismatch = controller.movePlugin('chain:bass', 'instance:bass', 'instance:drum-a', 'chain:drum');
  assert.match(mismatch.diagnostics[0].message, /canaux incompatibles/);
  const cycle = controller.movePlugin('chain:drum', 'instance:drum-a', 'instance:fx', 'chain:fx');
  assert.match(cycle.diagnostics[0].message, /boucle audio/);
  assert.deepEqual(controller.project, before);
  assert.equal(controller.undo().status, 'unavailable');
});

test('la sélection de session reste valide après annulation d’une duplication', async () => {
  const controller = new LPrepUIController();
  const project = await fixture();
  controller.openProject(project);
  assert.equal(controller.selectSession(project.sessions[1].sessionId), true);
  assert.equal(controller.activeSession.name, project.sessions[1].name);
  assert.equal(controller.duplicateActiveSession().status, 'committed');
  assert.equal(controller.undo().status, 'undone');
  assert.ok(controller.activeSession);
  assert.equal(controller.project.sessions.length, 2);
});
