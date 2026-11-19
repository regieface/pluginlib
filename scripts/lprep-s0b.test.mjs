import test from 'node:test';
import assert from 'node:assert/strict';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';
import { graphPatchChannels, proposeQuickPatch } from '../lprep/lprep-patch.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';

function controllerWithChains(formats, suffix = 'base') {
  const controller = new LPrepUIController({ revisionStore: new MemoryRevisionStore(),
    idFactory: createSequentialIdFactory(`s0b-${suffix}`) });
  controller.createProject('S0-B');
  formats.forEach(([inputFormat, outputFormat], index) => {
    assert.equal(controller.createChain({ name: `Chaîne ${index + 1}`, inputFormat, outputFormat }).status, 'committed');
  });
  return controller;
}

function restrict(session, direction, availableChannels) {
  for (const resource of session.environmentConfiguration.virtualResources) {
    if (resource.direction === `virtual-${direction}`) {
      resource.availability = availableChannels.includes(resource.channelNumber) ? 'available' : 'unavailable';
    }
  }
}

test('AUTOPATCH distingue une allocation complète et respecte les quatre formats', () => {
  const controller = controllerWithChains([
    ['mono', 'mono'], ['mono', 'stereo'], ['stereo', 'stereo'], ['stereo', 'mono']
  ], 'formats');
  const proposal = controller.proposePatch();
  assert.equal(proposal.status, 'complete');
  assert.equal(proposal.valid, true);
  assert.deepEqual(proposal.missingAssignments, []);
  for (const [index, [inputFormat, outputFormat]] of [
    ['mono', 'mono'], ['mono', 'stereo'], ['stereo', 'stereo'], ['stereo', 'mono']
  ].entries()) {
    const chainId = controller.activeSession.chains[index].chainId;
    const assignments = proposal.candidate.patchAssignments.filter(value => value.chainId === chainId);
    assert.equal(assignments.find(value => value.direction === 'input').resourceRefs.length, inputFormat === 'mono' ? 1 : 2);
    assert.equal(assignments.find(value => value.direction === 'output').resourceRefs.length, outputFormat === 'mono' ? 1 : 2);
  }
});

test('un dépassement des entrées conserve toutes les sorties possibles', () => {
  const controller = controllerWithChains(Array.from({ length: 3 }, () => ['stereo', 'mono']), 'inputs');
  restrict(controller.service.history.project.sessions[0], 'input', [1, 2]);
  const proposal = controller.proposePatch();
  assert.equal(proposal.status, 'partial');
  assert.equal(proposal.valid, true);
  assert.equal(proposal.missingAssignments.filter(value => value.direction === 'input').length, 2);
  assert.equal(proposal.candidate.patchAssignments.filter(value => value.direction === 'output').length, 3);
  assert.ok(proposal.missingAssignments.every(value => value.reason === 'insufficient-contiguous-capacity'));
});

test('un dépassement des sorties conserve toutes les entrées possibles', () => {
  const controller = controllerWithChains(Array.from({ length: 3 }, () => ['mono', 'stereo']), 'outputs');
  restrict(controller.service.history.project.sessions[0], 'output', [1, 2]);
  const proposal = controller.proposePatch();
  assert.equal(proposal.status, 'partial');
  assert.equal(proposal.missingAssignments.filter(value => value.direction === 'output').length, 2);
  assert.equal(proposal.candidate.patchAssignments.filter(value => value.direction === 'input').length, 3);
});

test('un dépassement simultané produit un candidat applicable sans routing artificiel', () => {
  const controller = controllerWithChains(Array.from({ length: 3 }, () => ['stereo', 'stereo']), 'both');
  const session = controller.service.history.project.sessions[0];
  restrict(session, 'input', [1, 2]); restrict(session, 'output', [1, 2]);
  const beforeConnections = session.audioGraph.connections.length;
  const proposal = controller.proposePatch();
  assert.equal(proposal.status, 'partial');
  assert.equal(proposal.missingAssignments.length, 4);
  assert.equal(proposal.diff.addedAssignmentRefs.length, 2);
  assert.equal(proposal.candidate.audioGraph.connections.length, beforeConnections + 2);
  assert.equal(controller.applyPatch().status, 'committed');
});

test('IN31–32 restent utilisables et OUT31–32 réservées dans un profil 32 × 32', () => {
  const controller = controllerWithChains(Array.from({ length: 16 }, () => ['stereo', 'stereo']), 'limits');
  const proposal = controller.proposePatch();
  assert.equal(proposal.status, 'partial');
  const inputChannels = proposal.candidate.patchAssignments.filter(value => value.direction === 'input')
    .flatMap(value => value.resourceRefs.map(ref => Number(ref.split(':').at(-1))));
  const outputChannels = proposal.candidate.patchAssignments.filter(value => value.direction === 'output')
    .flatMap(value => value.resourceRefs.map(ref => Number(ref.split(':').at(-1))));
  assert.ok(inputChannels.includes(31) && inputChannels.includes(32));
  assert.ok(!outputChannels.includes(31) && !outputChannels.includes(32));
  assert.equal(proposal.missingAssignments.filter(value => value.direction === 'output').length, 1);
});

test('une allocation partielle reste transactionnelle dans Undo/Redo et la persistance', async () => {
  const controller = controllerWithChains(Array.from({ length: 3 }, () => ['stereo', 'mono']), 'history');
  restrict(controller.service.history.project.sessions[0], 'input', [1, 2]);
  const proposal = controller.proposePatch();
  assert.equal(proposal.status, 'partial');
  assert.equal(controller.applyPatch().status, 'committed');
  const applied = controller.project;
  assert.equal(graphPatchChannels(controller.activeSession).size, 3);
  assert.equal(controller.undo().status, 'undone');
  assert.equal(controller.activeSession.patchAssignments.length, 0);
  assert.equal(controller.redo().status, 'redone');
  assert.deepEqual(controller.project, applied);
  const saved = await controller.save();
  const reopened = new LPrepUIController({ revisionStore: controller.revisions.store });
  await reopened.openRevision(saved.revisionId);
  assert.deepEqual(reopened.project, applied);
});
