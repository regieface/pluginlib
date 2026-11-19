import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPatchFixture, loadReferencePatchFixture } from './fixtures/lprep-patch-fixture.mjs';
import { createAudioConnection, createAudioNode, createAudioPort } from '../lprep/lprep-audio-graph.mjs';
import { patchRows } from '../lprep/lprep-patch-view.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';

test('P1 suit l’ordre réel et représente les ports mono et stéréo même sans affectation', async () => {
  const { sessions: [session] } = await loadPatchFixture();
  session.chainOrder.reverse();
  const before = structuredClone(session);
  const rows = patchRows(session);
  assert.deepEqual(rows.map(row => row.chain.chainId), session.chainOrder);
  const bass = rows.find(row => row.chain.name === 'BASS');
  const drum = rows.find(row => row.chain.name === 'DRUM');
  assert.deepEqual(bass.input.cells.map(cell => [cell.label, cell.number]), [['Mono', null]]);
  assert.deepEqual(drum.output.cells.map(cell => [cell.label, cell.number]), [['Canal', null], ['Canal', null]]);
  assert.deepEqual(session, before);
});

test('P1 expose l’asymétrie documentée, les liaisons secondaires et les plugins indépendants', async () => {
  const { sessions: [session] } = await loadReferencePatchFixture();
  const rows = patchRows(session);
  const fx = rows.find(row => row.chain.name === 'FX');
  assert.deepEqual(fx.input.cells.map(cell => [cell.label, cell.number]), [['Mono', 17]]);
  assert.deepEqual(fx.output.cells.map(cell => [cell.label, cell.number]), [['Canal', 17], ['Canal', 18]]);
  assert.ok(fx.output.cells.every(cell => cell.lane === null));
  const drum = rows.find(row => row.chain.name === 'DRUM');
  assert.ok(drum.details.some(edge => edge.internal && edge.connection.connectionId === 'connection:drum-main'));
  assert.ok(drum.details.some(edge => edge.connection.routingRole === 'secondary'));
  assert.ok(drum.details.some(edge => edge.connection.routingRole === 'sidechain'));
  assert.deepEqual(rows.find(row => row.chain.name === 'INSTRUS').independent.map(plugin => plugin.instanceId), ['instance:independent']);
});

test('P1 associe chaque canal aux cases via le mapping explicite et conserve les liaisons multiples', async () => {
  const { sessions: [session] } = await loadPatchFixture();
  const graph = session.audioGraph;
  const input = graph.ports.find(port => port.portId === 'port:drum-a-in');
  input.fanInPolicy = 'multiple';
  for (const [channel, lane, enabledState] of [[12, 2, 'enabled'], [31, 1, 'enabled'], [32, 1, 'disabled']]) {
    const node = createAudioNode({ graphId: graph.graphId, type: 'audio-input',
      externalResourceRef: `${session.sessionId}/virtual-input:${channel}` });
    const port = createAudioPort({ nodeId: node.nodeId, direction: 'output', channelCount: 1 });
    graph.nodes.push(node);
    graph.ports.push(port);
    graph.connections.push(createAudioConnection({ graphId: graph.graphId, sourcePortId: port.portId,
      destinationPortId: input.portId, routingRole: 'main', enabledState,
      channelMap: [{ sourceChannel: 1, destinationChannel: lane }] }));
  }
  const drum = patchRows(session).find(row => row.chain.name === 'DRUM');
  assert.deepEqual(drum.input.cells.map(cell => [cell.label, cell.number]), [['L', 31], ['R', 12]]);
  assert.equal(drum.input.connectionIds.length, 2);
  assert.equal(drum.details.find(edge => edge.connection.enabledState === 'disabled').inputs[0], 32);
});

test('P1 reflète le patch confirmé, Undo/Redo, les réservations et la réouverture', async () => {
  const revisionStore = new MemoryRevisionStore();
  const controller = new LPrepUIController({ revisionStore });
  controller.openProject(await loadPatchFixture());
  const before = patchRows(controller.activeSession);
  assert.equal(controller.proposePatch().valid, true);
  assert.deepEqual(patchRows(controller.activeSession), before);
  assert.equal(controller.applyPatch().status, 'committed');
  const after = patchRows(controller.activeSession);
  assert.notDeepEqual(after, before);
  const outputs = after.flatMap(row => row.output.cells.map(cell => cell.number).filter(number => number !== null));
  assert.ok(outputs.length);
  assert.ok(outputs.every(number => number !== 31 && number !== 32));
  controller.undo();
  assert.deepEqual(patchRows(controller.activeSession), before);
  controller.redo();
  assert.deepEqual(patchRows(controller.activeSession), after);
  const { revisionId } = await controller.save();
  const reopened = new LPrepUIController({ revisionStore });
  await reopened.openRevision(revisionId);
  assert.deepEqual(patchRows(reopened.activeSession), after);
});
