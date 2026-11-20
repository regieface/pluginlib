import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultEnvironmentProfile } from '../lprep/lprep-environment.mjs';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';
import { applySessionChainCount, createSessionDraft, planSessionChainCount } from '../lprep/lprep-session-draft.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';

const clone = value => structuredClone(value);

function setup(suffix = 'base') {
  const store = new MemoryRevisionStore();
  const controller = new LPrepUIController({ revisionStore: store, idFactory: createSequentialIdFactory(`s2-${suffix}`) });
  controller.createProject('S2');
  return { controller, store, profile: createDefaultEnvironmentProfile() };
}

function draftFor(controller, profile, groups = {}) {
  let draft = createSessionDraft({ idFactory: controller.idFactory,
    environmentProfileId: profile.environmentProfileId, sampleRate: 48000 });
  draft.name = 'Session créée';
  for (const role of ['insert', 'fx', 'monitoring']) {
    const count = groups[role] || 0;
    draft = applySessionChainCount(draft, planSessionChainCount(draft, role, count, controller.idFactory));
  }
  draft.chains.forEach((chain, index) => { chain.name = `${chain.role} ${index + 1}`; });
  return draft;
}

test('une session vide est créée atomiquement et Undo la retire', () => {
  const { controller, profile } = setup('empty'), before = clone(controller.project);
  const result = controller.createSessionFromDraft(draftFor(controller, profile), { profiles: [profile] });
  assert.equal(result.status, 'committed'); assert.equal(result.allocation.status, 'complete');
  assert.equal(controller.activeSession.chains.length, 0);
  assert.equal(controller.undo().status, 'undone'); assert.deepEqual(controller.project, before);
});

test('types, formats, couleurs, ordre et groupes DLY du tableau sont conservés', () => {
  const { controller, profile } = setup('settings');
  const draft = draftFor(controller, profile, { insert: 2, fx: 1, monitoring: 1 });
  Object.assign(draft.chains[0], { inputFormat: 'mono', outputFormat: 'mono', color: '#111111' });
  Object.assign(draft.chains[1], { inputFormat: 'mono', outputFormat: 'stereo', color: '#222222' });
  Object.assign(draft.chains[2], { inputFormat: 'stereo', outputFormat: 'stereo', color: '#333333', dlNumber: 2 });
  Object.assign(draft.chains[3], { inputFormat: 'stereo', outputFormat: 'mono', color: '#444444' });
  const result = controller.createSessionFromDraft(draft, { profiles: [profile] });
  assert.equal(result.status, 'committed');
  const session = controller.activeSession;
  assert.deepEqual(session.chainOrder, session.chains.map(chain => chain.chainId));
  assert.deepEqual(session.chains.map(chain => [chain.role, chain.inputFormat, chain.outputFormat, chain.color]), [
    ['insert', 'mono', 'mono', '#111111'], ['insert', 'mono', 'stereo', '#222222'],
    ['fx', 'stereo', 'stereo', '#333333'], ['monitoring', 'stereo', 'mono', '#444444']
  ]);
  assert.deepEqual(session.compensationGroups.map(group => [group.metadata.dlNumber, group.memberChainRefs.length]), [[1, 2], [2, 1]]);
});

test('machine, environnement et fréquence sont enregistrés dans la nouvelle session', () => {
  const { controller, profile } = setup('environment');
  assert.equal(controller.chooseTargetMachine(null, { name: 'Mac scène', rates: [48000, 96000] }).status, 'committed');
  const machineId = controller.activeSession.targetMachineRef.machineId;
  const draft = draftFor(controller, profile); draft.machineId = machineId; draft.sampleRate = 96000;
  assert.equal(controller.createSessionFromDraft(draft, { profiles: [profile] }).status, 'committed');
  assert.equal(controller.activeSession.targetMachineRef.machineId, machineId);
  assert.equal(controller.activeSession.audioGraph.sampleRate, 96000);
  assert.equal(controller.activeSession.environmentSourceRef.environmentProfileId, profile.environmentProfileId);
});

test('un preset est copié indépendamment et un format incompatible bloque toute création', () => {
  const { controller, profile } = setup('preset');
  assert.equal(controller.createChain({ name: 'Source preset' }).status, 'committed');
  const sourceChain = controller.activeSession.chains[0];
  assert.equal(controller.appendCatalogPlugin(sourceChain.chainId,
    { id: 'plugin:test', name: 'Test', vendor: 'Éditeur' }, null).status, 'committed');
  const saved = controller.saveActiveChainAsPreset(sourceChain.chainId); assert.equal(saved.status, 'created');
  const sourcePreset = controller.presets.load(saved.preset.presetId, saved.preset.revision);
  const draft = draftFor(controller, profile, { insert: 2 });
  draft.chains.forEach(chain => { chain.presetRef = { presetId: saved.preset.presetId, revision: saved.preset.revision }; });
  assert.equal(controller.createSessionFromDraft(draft, { profiles: [profile] }).status, 'committed');
  assert.equal(controller.activeSession.pluginInstances.length, 2);
  assert.equal(new Set(controller.activeSession.pluginInstances.map(value => value.instanceId)).size, 2);
  assert.deepEqual(controller.presets.load(saved.preset.presetId, saved.preset.revision), sourcePreset);

  const before = clone(controller.project), incompatible = draftFor(controller, profile, { insert: 1 });
  incompatible.chains[0].inputFormat = 'mono';
  incompatible.chains[0].presetRef = { presetId: saved.preset.presetId, revision: saved.preset.revision };
  const refused = controller.createSessionFromDraft(incompatible, { profiles: [profile] });
  assert.equal(refused.status, 'invalid'); assert.equal(refused.diagnostics[0].code, 'session-creation.preset-format');
  assert.deepEqual(controller.project, before);
});

test('AUTOPATCH complet et partiel sont appliqués sans confirmation supplémentaire', () => {
  const complete = setup('complete');
  let result = complete.controller.createSessionFromDraft(draftFor(complete.controller, complete.profile, { insert: 2 }),
    { profiles: [complete.profile] });
  assert.equal(result.allocation.status, 'complete'); assert.equal(complete.controller.activeSession.patchAssignments.length, 4);

  const partial = setup('partial'), large = draftFor(partial.controller, partial.profile, { insert: 17 });
  result = partial.controller.createSessionFromDraft(large, { profiles: [partial.profile] });
  assert.equal(result.status, 'committed'); assert.equal(result.allocation.status, 'partial');
  assert.ok(result.allocation.missingAssignments.some(value => value.direction === 'input'));
  assert.ok(result.allocation.missingAssignments.some(value => value.direction === 'output'));
  assert.equal(partial.controller.lastSessionCreation.allocation.status, 'partial');
});

test('5 Inserts, 3 FX et 1 Monitoring renseignés sont tous créés', () => {
  const { controller, profile } = setup('counts-531');
  const draft = draftFor(controller, profile, { insert: 5, fx: 3, monitoring: 1 });
  draft.chains[0].inputFormat = 'mono'; draft.chains[0].outputFormat = 'stereo';
  const result = controller.createSessionFromDraft(draft, { profiles: [profile] });
  assert.equal(result.status, 'committed');
  assert.deepEqual(controller.activeSession.chains.map(chain => chain.role),
    ['insert', 'insert', 'insert', 'insert', 'insert', 'fx', 'fx', 'fx', 'monitoring']);
  assert.deepEqual([controller.activeSession.chains[0].inputFormat, controller.activeSession.chains[0].outputFormat],
    ['mono', 'stereo']);
});

test('une session sans allocation possible reste valide et sans routing inventé', () => {
  const { controller, profile } = setup('impossible');
  profile.virtualResources.forEach(resource => { resource.availability = 'unavailable'; });
  const result = controller.createSessionFromDraft(draftFor(controller, profile, { fx: 1 }), { profiles: [profile] });
  assert.equal(result.status, 'committed'); assert.equal(result.allocation.status, 'impossible');
  assert.equal(controller.activeSession.patchAssignments.length, 0);
  assert.equal(controller.activeSession.audioGraph.connections.length, 0);
});

test('validation et erreur technique préservent intégralement le projet courant', () => {
  const { controller, profile } = setup('rollback'), before = clone(controller.project);
  const invalid = draftFor(controller, profile, { insert: 1 }); invalid.chains[0].name = '';
  assert.equal(controller.createSessionFromDraft(invalid, { profiles: [profile] }).status, 'invalid');
  assert.deepEqual(controller.project, before);
  const valid = draftFor(controller, profile, { insert: 1 });
  controller.idFactory = () => { throw new Error('panne simulée'); };
  const failed = controller.createSessionFromDraft(valid, { profiles: [profile] });
  assert.equal(failed.status, 'error'); assert.equal(failed.diagnostics[0].code, 'session-creation.exception');
  assert.deepEqual(controller.project, before);
});

test('la session complète résiste à la sauvegarde et à la réouverture', async () => {
  const { controller, profile, store } = setup('persistence');
  const result = controller.createSessionFromDraft(draftFor(controller, profile, { insert: 2, fx: 1 }), { profiles: [profile] });
  assert.equal(result.status, 'committed'); const expected = clone(controller.project);
  const record = await controller.save();
  const reopened = new LPrepUIController({ revisionStore: store, idFactory: createSequentialIdFactory('s2-reopen') });
  await reopened.openRevision(record.revisionId);
  assert.deepEqual(reopened.project, expected);
});
