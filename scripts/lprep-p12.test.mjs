import test from 'node:test';
import assert from 'node:assert/strict';
import { chainSidechainPorts, createAudioConnection, createAudioNode, createAudioPort } from '../lprep/lprep-audio-graph.mjs';
import { patchRows } from '../lprep/lprep-patch-view.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';

test('créer des chaînes avec 0, 1 et 2 SC crée les ports sans liaison ni changement des ports principaux', () => {
  const controller = new LPrepUIController();
  controller.createProject();
  for (const [role, count] of [['insert', 0], ['fx', 1], ['monitoring', 2]]) {
    assert.equal(controller.createChain({ name: role, role, sidechainCount: count }).status, 'committed');
  }
  const session = controller.activeSession;
  assert.deepEqual(session.chains.map(chain => chainSidechainPorts(session.audioGraph, chain).map(port => port.label)), [[], ['SC1'], ['SC1', 'SC2']]);
  assert.deepEqual(session.audioGraph.connections, []);
  assert.ok(session.audioGraph.ports.filter(port => port.role === 'sidechain')
    .every(port => port.direction === 'input' && port.channelCount === 1));
  assert.deepEqual(patchRows(session).map(row => row.sidechains.map(port => port.sources)), [[], [[]], [[], []]]);
});

test('le nombre de SC suit Undo/Redo et la sauvegarde, avec des identifiants stables', async () => {
  const revisionStore = new MemoryRevisionStore();
  const controller = new LPrepUIController({ revisionStore });
  controller.createProject();
  controller.createChain({ sidechainCount: 1 });
  const [chainId] = controller.activeSession.chainOrder;
  const [before] = patchRows(controller.activeSession)[0].sidechains;
  assert.equal(controller.updateChainSettings(chainId, { sidechainCount: 3 }).status, 'committed');
  const expected = patchRows(controller.activeSession)[0].sidechains;
  assert.equal(expected.length, 3);
  assert.equal(expected[0].portId, before.portId);
  assert.equal(controller.undo().status, 'undone');
  assert.deepEqual(patchRows(controller.activeSession)[0].sidechains, [before]);
  assert.equal(controller.redo().status, 'redone');
  const { revisionId } = await controller.save();
  await controller.openRevision(revisionId);
  assert.deepEqual(patchRows(controller.activeSession)[0].sidechains, expected);
  const preset = controller.saveActiveChainAsPreset(chainId);
  assert.equal(preset.status, 'created');
  assert.equal(controller.insertPreset(preset.preset.presetId, preset.preset.revision).status, 'committed');
  assert.deepEqual(patchRows(controller.activeSession).map(row => row.sidechains.length), [3, 3]);
  assert.equal(controller.duplicateActiveSession().status, 'committed');
  assert.notEqual(patchRows(controller.activeSession)[0].sidechains[0].portId, before.portId);
});

test('une vraie source SC est affichée et une suppression qui couperait la liaison est refusée', () => {
  const controller = new LPrepUIController();
  controller.createProject();
  controller.createChain({ sidechainCount: 2 });
  const project = controller.project, [session] = project.sessions;
  const graph = session.audioGraph;
  const [chain] = session.chains;
  const [sc1, sc2] = chainSidechainPorts(graph, chain);
  const node = createAudioNode({ graphId: graph.graphId, type: 'audio-input',
    externalResourceRef: `${session.sessionId}/virtual-input:7` });
  const port = createAudioPort({ nodeId: node.nodeId, direction: 'output', channelCount: 1 });
  graph.nodes.push(node);
  graph.ports.push(port);
  graph.connections.push(createAudioConnection({ graphId: graph.graphId, sourcePortId: port.portId,
    destinationPortId: sc2.portId, routingRole: 'sidechain' }));
  assert.equal(controller.openProject(project).status, 'opened');
  const [first, second] = patchRows(controller.activeSession)[0].sidechains;
  assert.equal(first.portId, sc1.portId);
  assert.deepEqual(first.sources, []);
  assert.deepEqual(second.sources[0].inputs, [7]);
  assert.equal(controller.updateChainSettings(chain.chainId, { sidechainCount: 1 }).status, 'error');
  assert.deepEqual(controller.project, project);
  assert.equal(controller.updateChainSettings(chain.chainId, { sidechainCount: 3 }).status, 'committed');
  assert.deepEqual(controller.activeSession.audioGraph.connections, graph.connections);
});
