import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAudioConnection, createAudioNode, createAudioPort } from '../lprep/lprep-audio-graph.mjs';
import { graphPatchChannels } from '../lprep/lprep-patch.mjs';
import { prepareDemoProject } from '../lprep/lprep-demo.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';

const demo = async () => prepareDemoProject(JSON.parse(await readFile(
  new URL('./fixtures/lprep-project-v1.json', import.meta.url), 'utf8'
)));
const drum = 'chain:drum';

test('les canaux viennent des connexions effectives du graphe, avec le mapping et les liaisons multiples', async () => {
  const { sessions: [session] } = await demo();
  const graph = session.audioGraph;
  session.patchAssignments.push({ chainId: drum, resourceRefs: ['session:main/virtual-input:32'] });
  function connectInput(channels, { channelMap = null, enabledState = 'enabled' } = {}) {
    const node = createAudioNode({ graphId: graph.graphId, type: 'audio-input',
      externalResourceRefs: channels.map(channel => `session:main/virtual-input:${channel}`) });
    const source = createAudioPort({ nodeId: node.nodeId, direction: 'output', channelCount: channels.length });
    graph.nodes.push(node);
    graph.ports.push(source);
    graph.connections.push(createAudioConnection({ graphId: graph.graphId,
      sourcePortId: source.portId, destinationPortId: 'port:drum-a-in', channelMap, enabledState }));
  }
  connectInput([2, 3], { channelMap: [{ sourceChannel: 2, destinationChannel: 1 }] });
  connectInput([8]);
  connectInput([9], { enabledState: 'disabled' });
  assert.deepEqual(graphPatchChannels(session).get(drum), { input: [3, 8], output: [] });
  assert.deepEqual(graphPatchChannels(session).get('chain:fx'), { input: [], output: [] });
});

test('les canaux du Patch rapide reflètent la transaction, Undo/Redo et la réouverture', async () => {
  const revisionStore = new MemoryRevisionStore();
  const controller = new LPrepUIController({ revisionStore });
  controller.openProject(await demo());
  assert.deepEqual(graphPatchChannels(controller.activeSession).get(drum), { input: [], output: [] });
  controller.proposePatch();
  assert.equal(controller.applyPatch().status, 'committed');
  const actual = graphPatchChannels(controller.activeSession);
  assert.deepEqual(actual.get(drum), { input: [1, 2], output: [1, 2] });
  controller.undo();
  assert.deepEqual(graphPatchChannels(controller.activeSession).get(drum), { input: [], output: [] });
  controller.redo();
  assert.deepEqual(graphPatchChannels(controller.activeSession), actual);
  const { revisionId } = await controller.save();
  const reopened = new LPrepUIController({ revisionStore });
  await reopened.openRevision(revisionId);
  assert.deepEqual(graphPatchChannels(reopened.activeSession), actual);
});

test('les réglages préservent les connexions, mettent à jour le groupe et gardent une seule étape Undo', async () => {
  const controller = new LPrepUIController();
  controller.openProject(await demo());
  const before = controller.activeSession;
  const groupId = before.compensationGroups[0].compensationGroupId;
  assert.equal(controller.updateChainSettings('chain:fx', { name: 'Retour', role: 'monitoring',
    color: '#095183', compensationGroupId: groupId, allocationEligibility: false }).status, 'committed');
  const after = controller.activeSession;
  assert.deepEqual(after.audioGraph, before.audioGraph);
  assert.deepEqual(after.compensationGroups[0].memberChainRefs, [drum, 'chain:fx']);
  const chain = after.chains.find(value => value.chainId === 'chain:fx');
  assert.equal(chain.name, 'Retour');
  assert.equal(chain.role, 'monitoring');
  assert.equal(chain.color, '#095183');
  assert.equal(chain.allocationEligibility, false);
  assert.equal(controller.undo().status, 'undone');
  assert.deepEqual(controller.activeSession, before);
  assert.equal(controller.redo().status, 'redone');
  assert.deepEqual(controller.activeSession, after);
});

test('le changement de format adapte les ports d’une chaîne vide et refuse une chaîne déjà routée', () => {
  const controller = new LPrepUIController();
  controller.createProject();
  controller.createChain();
  const chainId = controller.activeSession.chainOrder[0];
  assert.equal(controller.updateChainSettings(chainId, { audioFormat: 'mono' }).status, 'committed');
  assert.deepEqual(controller.activeSession.audioGraph.ports.map(port => [port.channelCount, port.channelLayout]), [[1, 'mono'], [1, 'mono']]);
  controller.proposePatch();
  assert.equal(controller.applyPatch().status, 'committed');
  const before = controller.project;
  assert.equal(controller.updateChainSettings(chainId, { audioFormat: 'stereo' }).status, 'error');
  assert.deepEqual(controller.project, before);
});
