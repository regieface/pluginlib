import test from 'node:test';
import assert from 'node:assert/strict';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';
import { virtualPatchOptions } from '../lprep/lprep-patch-edit.mjs';
import { patchRows } from '../lprep/lprep-patch-view.mjs';
import { loadReferencePatchFixture } from './fixtures/lprep-patch-fixture.mjs';

const resource = (controller, direction, number) => ({
  kind: 'virtual', id: `${controller.activeSessionId}/virtual-${direction}:${number}`
});
const apply = (controller, row, direction, cell, choice, confirmed = true) => controller.editPatch(row.chain.chainId, {
  direction, portId: row[direction].portId, lane: cell.lane, channel: cell.number, connectionIds: cell.connectionIds,
  externalLayout: row[direction].externalLayout, confirmed
}, choice);
const rows = controller => patchRows(controller.activeSession);

test('le patch indépendant stéréo, les retraits et la sauvegarde conservent les vraies cases', async () => {
  const controller = new LPrepUIController({ revisionStore: new MemoryRevisionStore() });
  controller.createProject();
  controller.createChain();
  let [row] = rows(controller);
  assert.equal(apply(controller, row, 'input', row.input.cells[0], resource(controller, 'input', 31)).status, 'committed');
  [row] = rows(controller);
  assert.equal(apply(controller, row, 'input', row.input.cells.find(cell => cell.number === null), resource(controller, 'input', 32)).status, 'committed');
  [row] = rows(controller);
  assert.deepEqual(row.input.cells.map(cell => [cell.label, cell.number]), [['L', 31], ['R', 32]]);
  assert.equal(apply(controller, row, 'input', row.input.cells[0], null, false).status, 'error');
  assert.equal(apply(controller, row, 'input', row.input.cells[0], null).status, 'committed');
  assert.deepEqual(rows(controller)[0].input.cells.map(cell => cell.number), [32, null]);
  controller.undo(); controller.redo();
  const { revisionId } = await controller.save();
  await controller.openRevision(revisionId);
  assert.deepEqual(rows(controller)[0].input.cells.map(cell => cell.number), [32, null]);
});

test('le patch SC virtuel ou depuis une chaîne reste distinct du patch principal', () => {
  const controller = new LPrepUIController();
  controller.createProject();
  controller.createChain({ name: 'BASS', audioFormat: 'mono' });
  controller.createChain({ name: 'DRUM', sidechainCount: 2 });
  const [source, drum] = rows(controller);
  for (const [index, choice] of [resource(controller, 'input', 7), { kind: 'chain', id: source.chain.chainId, lane: 1 }].entries()) {
    assert.equal(controller.editPatch(drum.chain.chainId, {
      direction: 'sidechain', portId: drum.sidechains[index].portId
    }, choice).status, 'committed');
  }
  assert.deepEqual(rows(controller)[1].sidechains[0].sources[0].inputs, [7]);
  assert.equal(rows(controller)[1].sidechains[1].sources[0].label, 'BASS');
  assert.equal(controller.proposePatch().valid, true);
  assert.equal(controller.applyPatch().status, 'committed');
  assert.ok(rows(controller)[1].input.cells.some(cell => cell.number !== null));
});

test('les réservations et verrouillages sont protégés sans mutation', async () => {
  const controller = new LPrepUIController();
  const project = await loadReferencePatchFixture();
  project.sessions[0].patchAssignments.find(item => item.chainId === 'chain:drum' && item.direction === 'output').locked = true;
  controller.openProject(project);
  const [drum] = rows(controller);
  const before = controller.project;
  assert.equal(apply(controller, drum, 'output', drum.output.cells[0], null).status, 'error');
  assert.equal(apply(controller, drum, 'output', drum.output.cells[0], resource(controller, 'output', 31)).status, 'error');
  assert.deepEqual(controller.project, before);
  assert.equal(virtualPatchOptions(controller.activeSession, 'output').find(item => item.channelNumber === 31).status, 'reserved');
});

test('remplacer un IN mono distribué conserve sa duplication explicite', async () => {
  const controller = new LPrepUIController();
  controller.openProject(await loadReferencePatchFixture());
  const fx = rows(controller).find(row => row.chain.name === 'FX');
  assert.equal(apply(controller, fx, 'input', fx.input.cells[0], resource(controller, 'input', 30)).status, 'committed');
  const next = rows(controller).find(row => row.chain.name === 'FX');
  assert.deepEqual(next.input.cells.map(cell => [cell.label, cell.number]), [['Mono', 30]]);
  assert.equal(controller.activeSession.audioGraph.connections.find(edge => edge.connectionId === next.input.connectionIds[0]).channelMap.length, 2);
});

test('le remplacement sur une liaison stéréo sans mapping conserve son autre canal et son absence de mapping', () => {
  const controller = new LPrepUIController();
  controller.createProject();
  controller.createChain();
  controller.proposePatch();
  assert.equal(controller.applyPatch().status, 'committed');
  const [row] = rows(controller);
  const cell = row.input.cells.find(item => item.number === 1);
  assert.equal(cell.lane, null);
  assert.equal(apply(controller, row, 'input', cell, resource(controller, 'input', 31)).status, 'committed');
  assert.deepEqual(rows(controller)[0].input.cells.map(item => [item.lane, item.number]), [[null, 2], [null, 31]]);
  const after = controller.project;
  assert.equal(apply(controller, rows(controller)[0], 'input', rows(controller)[0].input.cells[0], null).status, 'error');
  assert.deepEqual(controller.project, after);
});
