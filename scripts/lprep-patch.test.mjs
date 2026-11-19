import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultEnvironmentProfile, instantiateEnvironmentProfile, validateEnvironmentProfile,
  validateSessionEnvironment, virtualResourceId } from '../lprep/lprep-environment.mjs';
import { applyPatchProposal, detachPatchConnection, PatchTransactionError, proposeQuickPatch,
  validatePatchState } from '../lprep/lprep-patch.mjs';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';
import { duplicateSession, validateProject } from '../lprep/lprep-project.mjs';
import { deserializeProject, serializeProject } from '../lprep/lprep-serialization.mjs';
import { loadPatchFixture, loadReferencePatchFixture } from './fixtures/lprep-patch-fixture.mjs';

const blocking = issues => issues.filter(issue => issue.severity === 'error');

test('le profil par défaut expose 32 entrées et 32 sorties, seules 31–32 sorties sont réservées', () => {
  const profile = createDefaultEnvironmentProfile();
  assert.deepEqual(blocking(validateEnvironmentProfile(profile)), []);
  assert.equal(profile.virtualResources.filter(value => value.direction === 'virtual-input').length, 32);
  assert.equal(profile.virtualResources.filter(value => value.direction === 'virtual-output').length, 32);
  assert.deepEqual(profile.reservations[0].resourceRefs.map(ref => Number(ref.split(':').at(-1))), [31, 32]);
  assert.ok(profile.virtualResources.some(value => value.direction === 'virtual-input' && value.channelNumber === 31));
});

test('le snapshot est immuable et la configuration locale reste éditable', () => {
  const profile = createDefaultEnvironmentProfile();
  const environment = instantiateEnvironmentProfile(profile, 'session:test', { copiedAt: '2026-11-18T00:00:00.000Z' });
  assert.ok(Object.isFrozen(environment.environmentSnapshot));
  assert.ok(Object.isFrozen(environment.environmentSnapshot.virtualResources));
  assert.throws(() => { environment.environmentSnapshot.musicPolicy.enabledByDefault = true; }, TypeError);
  environment.environmentConfiguration.virtualResources[0].label = 'Entrée locale';
  profile.virtualResources[0].label = 'Profil modifié';
  assert.equal(environment.environmentSnapshot.virtualResources[0].label, 'Entrée 1');
  assert.equal(environment.environmentConfiguration.virtualResources[0].label, 'Entrée locale');
});

test('Patch rapide est déterministe, pur et place insert avant FX sur les plus petits canaux', async () => {
  const project = await loadPatchFixture(), session = project.sessions[0], before = structuredClone(session);
  const first = proposeQuickPatch(session), second = proposeQuickPatch(session);
  assert.equal(first.valid, true);
  assert.deepEqual(first, second);
  assert.deepEqual(session, before);
  const drumIn = first.candidate.patchAssignments.find(value => value.chainId === 'chain:drum' && value.direction === 'input');
  const bassIn = first.candidate.patchAssignments.find(value => value.chainId === 'chain:bass' && value.direction === 'input');
  const fxIn = first.candidate.patchAssignments.find(value => value.chainId === 'chain:fx' && value.direction === 'input');
  assert.deepEqual(drumIn.resourceRefs.map(ref => Number(ref.split(':').at(-1))), [1, 2]);
  assert.deepEqual(bassIn.resourceRefs.map(ref => Number(ref.split(':').at(-1))), [3]);
  assert.ok(Number(fxIn.resourceRefs[0].split(':').at(-1)) > 3);
  assert.deepEqual(blocking(validatePatchState(first.candidate)), []);
});

test('application atomique, seconde passe stable et édition manuelle synchronisée', async () => {
  const project = await loadPatchFixture(), original = project.sessions[0];
  const applied = applyPatchProposal(original, proposeQuickPatch(original)).session;
  const again = applyPatchProposal(applied, proposeQuickPatch(applied)).session;
  assert.deepEqual(again, applied);
  const connectionId = applied.patchAssignments[0].connectionRefs[0];
  const detached = detachPatchConnection(applied, connectionId);
  assert.equal(detached.audioGraph.connections.find(value => value.connectionId === connectionId).originAssignmentId, null);
  assert.ok(!detached.patchAssignments[0].connectionRefs.includes(connectionId));
  assert.deepEqual(blocking(validatePatchState(detached)), []);
});

test('une proposition obsolète ou sans capacité échoue sans mutation partielle', async () => {
  const project = await loadPatchFixture(), session = project.sessions[0], proposal = proposeQuickPatch(session);
  const changed = structuredClone(session); changed.audioGraph.extensions.concurrentChange = true;
  assert.throws(() => applyPatchProposal(changed, proposal), PatchTransactionError);
  const constrained = structuredClone(session);
  constrained.environmentConfiguration.virtualResources.forEach(value => { value.availability = 'unavailable'; });
  const before = structuredClone(constrained), invalid = proposeQuickPatch(constrained);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.status, 'impossible');
  assert.ok(invalid.issues.some(value => value.code === 'patch.capacity'));
  assert.deepEqual(constrained, before);
  assert.throws(() => applyPatchProposal(constrained, invalid), PatchTransactionError);
});

test('les affectations manuelles verrouillées et les routings secondaires/sidechains sont préservés', async () => {
  const project = await loadPatchFixture(), session = project.sessions[0];
  const applied = applyPatchProposal(session, proposeQuickPatch(session)).session;
  const manual = applied.patchAssignments.find(value => value.chainId === 'chain:drum' && value.direction === 'input');
  manual.origin = 'manual'; manual.locked = true;
  const secondaryBefore = applied.audioGraph.connections.filter(value => ['secondary', 'sidechain'].includes(value.routingRole));
  const result = applyPatchProposal(applied, proposeQuickPatch(applied)).session;
  assert.deepEqual(result.patchAssignments.find(value => value.assignmentId === manual.assignmentId), manual);
  assert.deepEqual(result.audioGraph.connections.filter(value => ['secondary', 'sidechain'].includes(value.routingRole)), secondaryBefore);
});

test('la fixture explicite respecte DRUM/BASS/FX/INSTRUS et le mapping mono vers stéréo', async () => {
  const project = await loadReferencePatchFixture(), session = project.sessions[0];
  const refs = (name, direction) => {
    const chain = session.chains.find(value => value.name === name);
    return session.patchAssignments.find(value => value.chainId === chain.chainId && value.direction === direction).resourceRefs
      .map(ref => Number(ref.split(':').at(-1)));
  };
  assert.deepEqual(refs('DRUM', 'input'), [1, 2]);
  assert.deepEqual(refs('BASS', 'output'), [3]);
  assert.deepEqual(refs('FX', 'input'), [17]);
  assert.deepEqual(refs('FX', 'output'), [17, 18]);
  assert.deepEqual(refs('INSTRUS', 'output'), [5, 6]);
  const fx = session.patchAssignments.find(value => value.chainId === 'chain:fx' && value.direction === 'input');
  assert.deepEqual(session.audioGraph.connections.find(value => value.originAssignmentId === fx.assignmentId).channelMap,
    [{ sourceChannel: 1, destinationChannel: 1 }, { sourceChannel: 1, destinationChannel: 2 }]);
  assert.deepEqual(blocking(validateProject(project)), []);
});

test('une collision verrouillée et une référence de connexion manquante sont signalées', async () => {
  const project = await loadPatchFixture(), session = applyPatchProposal(project.sessions[0], proposeQuickPatch(project.sessions[0])).session;
  session.patchAssignments[0].locked = true;
  session.patchAssignments[1].locked = true;
  session.patchAssignments[1].resourceRefs = [...session.patchAssignments[0].resourceRefs];
  assert.ok(validatePatchState(session).some(value => value.code === 'patch.resource-conflict'));
  const broken = applyPatchProposal(project.sessions[0], proposeQuickPatch(project.sessions[0])).session;
  broken.patchAssignments[0].connectionRefs = [];
  assert.ok(validatePatchState(broken).some(value => value.code === 'patch.bidirectional'));
});

test('les sorties musicales réservées sont interdites aux chaînes ordinaires', async () => {
  const project = await loadPatchFixture(), session = project.sessions[0];
  const applied = applyPatchProposal(session, proposeQuickPatch(session)).session;
  applied.patchAssignments[0].resourceRefs = [virtualResourceId(session.sessionId, 'virtual-output', 31)];
  applied.patchAssignments[0].direction = 'output';
  assert.ok(validatePatchState(applied).some(value => value.code === 'patch.reserved'));
});

test('la duplication remappe environnement, affectations et connexions sans toucher aux références partagées', async () => {
  const project = await loadPatchFixture();
  const source = applyPatchProposal(project.sessions[0], proposeQuickPatch(project.sessions[0])).session;
  const copy = duplicateSession(source, { idFactory: createSequentialIdFactory('lot2') });
  assert.deepEqual(blocking(validateSessionEnvironment(copy)), []);
  assert.deepEqual(blocking(validatePatchState(copy)), []);
  assert.ok(copy.environmentConfiguration.virtualResources.every(value => value.resourceId.startsWith(`${copy.sessionId}/`)));
  assert.ok(copy.patchAssignments.every(value => value.sessionId === copy.sessionId));
  assert.equal(copy.pluginInstances[0].catalogRef.pluginId, source.pluginInstances[0].catalogRef.pluginId);
});

test('la sérialisation conserve les extensions et restaure un snapshot immuable', async () => {
  const project = await loadPatchFixture();
  project.sessions[0] = applyPatchProposal(project.sessions[0], proposeQuickPatch(project.sessions[0])).session;
  project.sessions[0].environmentConfiguration.extensions.future = { opaque: true };
  assert.deepEqual(blocking(validateProject(project)), []);
  const restored = deserializeProject(serializeProject(project));
  assert.deepEqual(restored, project);
  assert.deepEqual(restored.sessions[0].environmentConfiguration.extensions.future, { opaque: true });
});
