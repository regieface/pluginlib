import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPatchFixture, loadReferencePatchFixture } from './fixtures/lprep-patch-fixture.mjs';
import { applyPatchProposal, proposeQuickPatch } from '../lprep/lprep-patch.mjs';
import { patchChannelName, patchDisplayCells, patchRows } from '../lprep/lprep-patch-view.mjs';

test('positions stéréo visuelles sans conversion des liaisons ambiguës en affectations L/R', async () => {
  const { sessions: [source] } = await loadPatchFixture();
  const { session } = applyPatchProposal(source, proposeQuickPatch(source));
  const before = structuredClone(session);
  const rows = patchRows(session);
  for (const name of ['DRUM', 'FX', 'INSTRUS']) {
    const row = rows.find(entry => entry.chain.name === name);
    for (const direction of ['input', 'output']) {
      const cells = patchDisplayCells(row[direction]);
      assert.deepEqual(cells.map(cell => [cell.position, cell.side, cell.lane, cell.ambiguous]),
        [[1, 'L', null, true], [2, 'R', null, true]]);
      assert.ok(cells.every(cell => Number.isInteger(cell.number) && cell.connectionIds.length));
    }
  }
  const bass = rows.find(entry => entry.chain.name === 'BASS');
  assert.deepEqual(patchDisplayCells(bass.input).map(cell => [cell.position, cell.side, cell.number, cell.ambiguous]),
    [[1, undefined, 3, false]]);
  assert.deepEqual(session, before);
});

test('les positions explicites et le nombre de ports du mono vers stéréo sont conservés', async () => {
  const { sessions: [session] } = await loadReferencePatchFixture();
  const fx = patchRows(session).find(row => row.chain.name === 'FX');
  assert.deepEqual(patchDisplayCells(fx.input).map(cell => [cell.position, cell.side, cell.number, cell.ambiguous]),
    [[1, undefined, 17, false]]);
  const display = patchDisplayCells({ width: 2, cells: [
    { lane: 2, number: 7, connectionIds: ['edge:one'] }, { lane: null, number: 8, connectionIds: ['edge:two'] }
  ] });
  assert.deepEqual(display.map(cell => [cell.position, cell.side, cell.lane, cell.number, cell.ambiguous]),
    [[1, 'L', null, 8, true], [2, 'R', 2, 7, false]]);
});

test('une chaîne déclarée stéréo conserve ses deux positions visuelles avec un port sans largeur documentée', async () => {
  const { sessions: [session] } = await loadPatchFixture();
  const chain = session.chains.find(item => item.name === 'DRUM');
  const port = session.audioGraph.ports.find(item => item.portId === chain.mainPath.outputBoundaryPortRef);
  port.channelCount = null;
  port.channelLayout = 'unknown';
  const row = patchRows(session).find(item => item.chain === chain);
  assert.deepEqual(patchDisplayCells(row.output).map(cell => [cell.position, cell.side, cell.number]),
    [[1, 'L', null], [2, 'R', null]]);
  assert.equal(port.channelCount, null);
});

test('le libellé nA est réservé à une absence et les canaux connus gardent leur nom virtuel', () => {
  assert.equal(patchChannelName('input', null), 'nA');
  assert.equal(patchChannelName('output', null), 'nA');
  assert.equal(patchChannelName('input', undefined), 'Inconnu');
  assert.equal(patchChannelName('input', 7), 'IN07');
  assert.equal(patchChannelName('output', 32), 'OUT32');
  const [cell] = patchDisplayCells({ width: 2, cells: [{ lane: null, number: 7, connectionIds: ['edge:ambiguous'] }] });
  assert.equal(cell.ambiguous, true);
  assert.equal(patchChannelName('input', cell.number), 'IN07');
});
