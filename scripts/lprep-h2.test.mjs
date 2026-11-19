import test from 'node:test';
import assert from 'node:assert/strict';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';
import { machineSampleRates, projectMachines } from '../lprep/lprep-audio-settings.mjs';
import { sessionLatency } from '../lprep/lprep-catalog-view.mjs';

test('les fréquences déclarées et la machine sont restaurées sans modifier le graphe hors fréquence', async () => {
  const controller = new LPrepUIController({ revisionStore: new MemoryRevisionStore() });
  controller.createProject();
  controller.createChain();
  controller.proposePatch();
  assert.equal(controller.applyPatch().status, 'committed');
  const before = controller.activeSession;
  assert.equal(controller.chooseSampleRate(48000).status, 'error');
  assert.equal(controller.chooseTargetMachine(null, { name: 'Régie', rates: [48000, 96000] }).status, 'committed');
  const machine = controller.activeSession.targetMachineRef;
  assert.deepEqual(machineSampleRates(machine), [48000, 96000]);
  assert.equal(controller.chooseSampleRate(48000).status, 'committed');
  assert.equal(controller.chooseSampleRate(96000).status, 'committed');
  assert.deepEqual(controller.activeSession.audioGraph, { ...before.audioGraph, sampleRate: 96000 });
  assert.deepEqual(controller.activeSession.patchAssignments, before.patchAssignments);
  assert.equal(controller.chooseSampleRate(44100).status, 'error');
  controller.undo();
  assert.equal(controller.activeSession.audioGraph.sampleRate, 48000);
  controller.redo();
  const { revisionId } = await controller.save();
  await controller.openRevision(revisionId);
  assert.deepEqual(controller.activeSession.targetMachineRef, machine);
  assert.equal(controller.activeSession.audioGraph.sampleRate, 96000);
});

test('une machine existante incompatible est refusée sans changer la session', () => {
  const controller = new LPrepUIController();
  controller.createProject();
  controller.chooseTargetMachine(null, { name: '48 seulement', rates: [48000] });
  const first = controller.activeSession.targetMachineRef;
  controller.createSession();
  controller.chooseTargetMachine(null, { name: '96 seulement', rates: [96000] });
  controller.chooseSampleRate(96000);
  const before = controller.project;
  assert.equal(projectMachines(before).length, 2);
  assert.equal(controller.chooseTargetMachine(first.machineId).status, 'error');
  assert.deepEqual(controller.project, before);
  assert.equal(controller.chooseSampleRate(null).status, 'committed');
  assert.equal(controller.chooseTargetMachine(first.machineId).status, 'committed');
});

test('l’affichage de la latence suit la fréquence enregistrée', () => {
  const controller = new LPrepUIController();
  controller.createProject();
  controller.chooseTargetMachine(null, { name: 'Régie', rates: [48000, 96000] });
  const source = 'https://example.invalid/latence';
  const plugin = { latency: { 48: { samples: 32, source }, 96: { samples: 64, source } } };
  controller.chooseSampleRate(48000);
  assert.equal(sessionLatency(plugin, controller.activeSession.audioGraph.sampleRate).label, '32 éch.');
  controller.chooseSampleRate(96000);
  assert.equal(sessionLatency(plugin, controller.activeSession.audioGraph.sampleRate).label, '64 éch.');
});

test('une cible déjà connue reste sélectionnable après avoir quitté sa dernière session', () => {
  const controller = new LPrepUIController();
  controller.createProject();
  assert.equal(controller.chooseTargetMachine(null, { name: 'Studio', rates: [48000] }).status, 'committed');
  const oldId = controller.activeSession.targetMachineRef.machineId;
  assert.equal(controller.chooseTargetMachine(null, { name: 'Scène', rates: [48000, 96000] }).status, 'committed');
  assert.deepEqual(projectMachines(controller.project).map(ref => ref.fallback.name), ['Studio', 'Scène']);
  assert.equal(controller.chooseTargetMachine(oldId).status, 'committed');
  assert.equal(controller.activeSession.targetMachineRef.machineId, oldId);
});
