import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createChain, createCompensationGroup, createPluginInstance, createProject, createSession,
  duplicateSession, validateProject, virtualResourceId
} from '../lprep/lprep-project.mjs';
import {
  createAudioConnection, createAudioGraph, createAudioNode, createAudioPort
} from '../lprep/lprep-audio-graph.mjs';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';
import { deserializeProject, LPrepValidationError, serializeProject } from '../lprep/lprep-serialization.mjs';

const fixtureUrl = new URL('./fixtures/lprep-project-v1.json', import.meta.url);
const loadFixture = async () => JSON.parse(await readFile(fixtureUrl, 'utf8'));
const errors = project => validateProject(project).filter(issue => issue.severity === 'error');
const codes = project => errors(project).map(issue => issue.code);

function internalIds(session) {
  return new Set([
    session.sessionId, session.audioGraph.graphId,
    ...session.pluginInstances.map(item => item.instanceId),
    ...session.audioGraph.nodes.map(item => item.nodeId),
    ...session.audioGraph.ports.map(item => item.portId),
    ...session.audioGraph.connections.map(item => item.connectionId),
    ...session.chains.map(item => item.chainId),
    ...session.compensationGroups.map(item => item.compensationGroupId)
  ]);
}

test('la fixture DRUM/BASS/FX/INSTRUS respecte le modèle fondamental', async () => {
  const project = await loadFixture();
  assert.deepEqual(errors(project), []);
  assert.equal(project.sessions.length, 2);
  const session = project.sessions[0];
  assert.deepEqual(session.chains.find(chain => chain.name === 'DRUM').pluginOrder,
    ['instance:drum-a', 'instance:drum-b']);
  assert.equal(session.pluginInstances.filter(instance => instance.catalogRef.pluginId === 'example--compressor').length, 2);
  assert.deepEqual(session.audioGraph.connections.find(connection => connection.connectionId === 'connection:fx-entry').channelMap,
    [{ sourceChannel: 1, destinationChannel: 1 }, { sourceChannel: 1, destinationChannel: 2 }]);
  assert.equal(session.chains.find(chain => chain.name === 'INSTRUS').presentationLinks[0], 'instance:independent');
  assert.equal(session.audioGraph.connections.filter(connection => connection.routingRole === 'sidechain').length, 2);
});

test('la validation est non destructive et conserve extensions, inconnues et références non résolues', async () => {
  const project = await loadFixture();
  project.sessions[0].pluginInstances[0].resolutionStatus = 'missing';
  project.sessions[0].audioGraph.connections[0].channelMap = null;
  project.extensions.futureUnknown = { value: 7 };
  const before = structuredClone(project);
  assert.deepEqual(errors(project), []);
  assert.deepEqual(project, before);
  const restored = deserializeProject(serializeProject(project));
  assert.deepEqual(restored, project);
  assert.deepEqual(restored.extensions.futureUnknown, { value: 7 });
  assert.equal(restored.sessions[0].pluginInstances[0].catalogRef.fallback.name, 'Compressor');
});

test('une session dupliquée reçoit de nouveaux IDs et remappe toutes les références internes connues', async () => {
  const project = await loadFixture();
  const original = project.sessions[0];
  const originalBefore = structuredClone(original);
  const duplicate = duplicateSession(original, {
    name: 'Session principale — copie', idFactory: createSequentialIdFactory('duplicate')
  });
  project.sessions.push(duplicate);
  assert.deepEqual(errors(project), []);
  const overlap = [...internalIds(original)].filter(id => internalIds(duplicate).has(id));
  assert.deepEqual(overlap, []);
  assert.equal(duplicate.audioGraph.nodes.find(node => node.type === 'plugin-instance').instanceRef,
    duplicate.pluginInstances[0].instanceId);
  assert.ok(duplicate.audioGraph.nodes.filter(node => node.externalResourceRef)
    .every(node => node.externalResourceRef.startsWith(`${duplicate.sessionId}/`)));
  assert.equal(duplicate.chains[0].mainPath.connectionRefs[0], duplicate.audioGraph.connections[1].connectionId);
  assert.equal(duplicate.compensationGroups[0].memberChainRefs[0], duplicate.chains[0].chainId);
  assert.deepEqual(duplicate.pluginInstances[0].catalogRef, original.pluginInstances[0].catalogRef);
  assert.deepEqual(duplicate.pluginInstances[0].variantRef, original.pluginInstances[0].variantRef);
  duplicate.chains[0].name = 'DRUM copie';
  assert.equal(original.chains[0].name, 'DRUM');
  assert.deepEqual(original, originalBefore);
  assert.throws(() => duplicateSession(original, { idFactory: () => 'same:id' }), /plusieurs fois/);
});

test('les deux sessions du projet évoluent indépendamment', async () => {
  const project = await loadFixture();
  const alternateBefore = structuredClone(project.sessions[1]);
  project.sessions[0].name = 'Session principale modifiée';
  project.sessions[0].chains[0].color = '#000000';
  assert.deepEqual(project.sessions[1], alternateBefore);
  assert.deepEqual(errors(project), []);
});

test('les ressources virtuelles opérationnelles sont qualifiées par session', () => {
  assert.equal(virtualResourceId('session:test', 'virtual-input', 17), 'session:test/virtual-input:17');
  assert.throws(() => virtualResourceId('session:test', 'input', 17), /Direction/);
});

test('pluginOrder ne crée aucune connexion et une divergence avec mainPath est signalée', async () => {
  const project = await loadFixture();
  const graphBefore = structuredClone(project.sessions[0].audioGraph);
  project.sessions[0].chains[0].pluginOrder.reverse();
  assert.ok(codes(project).includes('chain.plugin-order'));
  assert.deepEqual(project.sessions[0].audioGraph, graphBefore);
});

test('un trajet main alternatif qui rejoint la sortie rend le chemin de chaîne ambigu', async () => {
  const project = await loadFixture();
  const graph = project.sessions[0].audioGraph;
  graph.connections.push(createAudioConnection({
    connectionId: 'connection:drum-parallel', graphId: graph.graphId,
    sourcePortId: 'port:drum-a-out', destinationPortId: 'port:drum-b-in', routingRole: 'main'
  }));
  assert.ok(codes(project).includes('chain.path-ambiguous'));
});

test('une instance reste canonique et ne peut être dupliquée dans un nœud', async () => {
  const project = await loadFixture();
  project.sessions[0].audioGraph.nodes.find(node => node.type === 'plugin-instance').variantRef = { variantId: 'invented' };
  assert.ok(codes(project).includes('node.instance-duplication'));
  delete project.sessions[0].audioGraph.nodes.find(node => node.instanceRef === 'instance:drum-b').instanceRef;
  const result = codes(project);
  assert.ok(result.includes('node.unexpected-instance') || result.includes('node.instance-missing'));
});

test('une instance appartient au maximum à une chaîne et chainOrder est exhaustif', async () => {
  const project = await loadFixture();
  project.sessions[0].chains[1].pluginOrder.push('instance:drum-a');
  project.sessions[0].chainOrder.pop();
  const result = codes(project);
  assert.ok(result.includes('chain.instance-membership'));
  assert.ok(result.includes('chain.order'));
});

test('les ports, connexions, mappings et sidechains sont validés sans correction', async () => {
  const project = await loadFixture();
  const connection = project.sessions[0].audioGraph.connections.find(item => item.connectionId === 'connection:fx-entry');
  connection.channelMap[1].destinationChannel = 3;
  const sidechain = project.sessions[0].audioGraph.connections.find(item => item.routingRole === 'sidechain');
  sidechain.destinationPortId = 'port:independent-in';
  const before = structuredClone(project);
  const result = codes(project);
  assert.ok(result.includes('channel-map.destination-range'));
  assert.ok(result.includes('connection.sidechain-port'));
  assert.deepEqual(project, before);
});

test('la relation groupe–chaîne est bidirectionnelle', async () => {
  const project = await loadFixture();
  project.sessions[0].compensationGroups[0].memberChainRefs = [];
  assert.ok(codes(project).includes('compensation.bidirectional'));
});

test('la sérialisation refuse les documents invalides et le JSON incomplet', async () => {
  const project = await loadFixture();
  project.sessions[0].projectId = 'project:other';
  assert.throws(() => serializeProject(project), error =>
    error instanceof LPrepValidationError && error.issues.some(issue => issue.code === 'session.project'));
  assert.throws(() => deserializeProject('{'), SyntaxError);
});

test('les constructeurs produisent un projet minimal sérialisable', () => {
  const id = createSequentialIdFactory('minimal');
  const projectId = id('project'), sessionId = id('session'), graphId = id('graph');
  const instance = createPluginInstance({ instanceId: id('instance'), sessionId,
    catalogRef: { pluginId: 'example--plugin', fallback: { name: 'Plugin', vendor: 'Example' } },
    variantRef: { variantId: 'variant:example', revision: 1, fallback: { name: 'AU mono' } } });
  const node = createAudioNode({ nodeId: id('node'), graphId, type: 'plugin-instance', instanceRef: instance.instanceId });
  const input = createAudioPort({ portId: id('port'), nodeId: node.nodeId, direction: 'input', role: 'main', channelCount: 1 });
  const output = createAudioPort({ portId: id('port'), nodeId: node.nodeId, direction: 'output', role: 'main', channelCount: 1 });
  const graph = createAudioGraph({ graphId, sessionId, nodes: [node], ports: [input, output] });
  const chain = createChain({ chainId: id('chain'), sessionId, name: 'Mono', role: 'insert', audioFormat: 'mono',
    pluginOrder: [instance.instanceId], mainPath: { inputBoundaryPortRef: input.portId,
      outputBoundaryPortRef: output.portId, connectionRefs: [] } });
  const group = createCompensationGroup({ compensationGroupId: id('compensation-group'), sessionId,
    name: 'Groupe', memberChainRefs: [chain.chainId] });
  chain.compensationGroupId = group.compensationGroupId;
  const session = createSession({ sessionId, projectId, name: 'Session', pluginInstances: [instance], audioGraph: graph,
    chains: [chain], chainOrder: [chain.chainId], compensationGroups: [group] });
  const project = createProject({ projectId, name: 'Projet', sessions: [session] });
  assert.deepEqual(errors(project), []);
  assert.deepEqual(deserializeProject(serializeProject(project)), project);
});

test('une connexion ne peut pas être déduite ou rendue valide par sa présence dans pluginOrder', async () => {
  const project = await loadFixture();
  const graph = project.sessions[0].audioGraph;
  graph.connections = graph.connections.filter(connection => connection.connectionId !== 'connection:drum-main');
  assert.ok(codes(project).includes('chain.connection-missing'));
});

test('les références entre sessions sont refusées', async () => {
  const project = await loadFixture();
  project.sessions[0].audioGraph.nodes[0].externalResourceRef = 'session:alternate/virtual-input:1';
  assert.ok(codes(project).includes('resource-ref.session'));
});

test('un fan-in interdit est détecté et une boucle reste conservée avec avertissement', async () => {
  const project = await loadFixture();
  const graph = project.sessions[0].audioGraph;
  graph.connections.push(createAudioConnection({
    connectionId: 'connection:fan-in-conflict', graphId: graph.graphId,
    sourcePortId: 'port:independent-out', destinationPortId: 'port:instrus-in', routingRole: 'main'
  }));
  assert.ok(codes(project).includes('port.fan-in-conflict'));
  assert.ok(validateProject(project).some(issue => issue.code === 'graph.cycle' && issue.severity === 'warning'));
});
