import test from 'node:test';
import assert from 'node:assert/strict';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';
import { patchRows } from '../lprep/lprep-patch-view.mjs';

test('les connexions cumulées conservent leurs identités, les canaux et les protections', async () => {
  const controller = new LPrepUIController({ revisionStore: new MemoryRevisionStore() });
  controller.createProject();
  controller.createChain({ name: 'DRUM', audioFormat: 'stereo', sidechainCount: 1 });
  controller.createChain({ name: 'BASS', audioFormat: 'mono' });
  const rows = () => patchRows(controller.activeSession);
  const [drum, bass] = rows();
  const change = (row, direction, choice, lane = 1, extra = {}) => controller.editPatch(row.chain.chainId, {
    direction, portId: direction === 'sidechain' ? row.sidechains[0].portId : row[direction].portId,
    lane, confirmed: true, ...extra
  }, choice);
  const v = (dir, number) => ({ kind: 'virtual', id: `${controller.activeSessionId}/virtual-${dir}:${number}` });
  const peer = row => ({ kind: 'chain', id: row.chain.chainId, lane: 1 });
  for (const [row, direction, choice] of [
    [drum, 'input', v('input', 1)], [bass, 'input', v('input', 1)], [drum, 'input', v('input', 3)],
    [drum, 'output', v('output', 1)], [bass, 'output', v('output', 1)], [drum, 'output', v('output', 5)],
    [drum, 'input', peer(bass)], [drum, 'sidechain', peer(bass)], [drum, 'sidechain', v('input', 4)]
  ]) assert.equal(change(row, direction, choice).status, 'committed');
  assert.deepEqual(rows()[0].input.cells.filter(cell => cell.lane === 1 && !cell.peer).map(cell => cell.number), [1, 3]);
  const [route] = rows()[0].input.cells.filter(cell => cell.peer === 'BASS');
  assert.equal(rows()[0].sidechains[0].sources.length, 2);
  const before = controller.activeSession;
  assert.equal(change(drum, 'output', peer(bass)).status, 'error');
  assert.equal(change(drum, 'output', v('output', 31)).status, 'error');
  assert.equal(change(drum, 'output', v('output', 1)).status, 'error');
  assert.equal(change(drum, 'input', v('input', 1), 3).status, 'error');
  assert.deepEqual(controller.activeSession, before);
  assert.equal(controller.proposePatch().valid, true);
  assert.equal(controller.applyPatch().status, 'committed');
  assert.deepEqual(controller.activeSession.audioGraph.connections, before.audioGraph.connections);
  assert.equal(change(drum, 'input', null, 1, { connectionIds: route.connectionIds, peerLane: route.peerLane }).status, 'committed');
  assert.equal(rows()[0].input.cells.some(cell => cell.peer === 'BASS'), false);
  controller.undo();
  assert.deepEqual(controller.activeSession.audioGraph.connections, before.audioGraph.connections);
  controller.redo();
  controller.undo();
  const { revisionId } = await controller.save();
  await controller.openRevision(revisionId);
  assert.deepEqual(controller.activeSession.audioGraph.connections, before.audioGraph.connections);
  const plan = controller.previewClearPatch();
  assert.equal(plan.removable.length, 9);
  assert.equal(controller.clearPatch(plan.removable.map(item => item.id)).status, 'committed');
  assert.equal(controller.activeSession.patchAssignments.length, 0);
  assert.equal(rows()[0].sidechains[0].sources.length, 0);
});
