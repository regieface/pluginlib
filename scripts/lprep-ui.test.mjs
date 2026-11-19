import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRevisionEngine } from '../lprep/lprep-browser-persistence.mjs';
import { prepareDemoProject } from '../lprep/lprep-demo.mjs';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { validateProject } from '../lprep/lprep-project.mjs';
import { readFile } from 'node:fs/promises';

const fixtureUrl = new URL('./fixtures/lprep-project-v1.json', import.meta.url);
const fixture = async () => prepareDemoProject(JSON.parse(await readFile(fixtureUrl, 'utf8')));
const errors = project => validateProject(project).filter(value => value.severity === 'error');

test('création, renommage et navigation entre sessions utilisent le modèle V2.1', () => {
  const controller = new LPrepUIController({ idFactory: createSequentialIdFactory('ui-create') });
  controller.createProject('Projet interface');
  assert.equal(controller.project.name, 'Projet interface'); assert.equal(controller.project.sessions.length, 1);
  const firstId = controller.activeSessionId;
  assert.equal(controller.createSession('Session B').status, 'committed');
  assert.notEqual(controller.activeSessionId, firstId); assert.equal(controller.project.sessions.length, 2);
  assert.equal(controller.selectSession(firstId), true); assert.equal(controller.activeSessionId, firstId);
  assert.equal(controller.renameProject('Projet renommé').status, 'committed'); assert.equal(controller.project.name, 'Projet renommé');
});

test('création de chaîne, preset, insertion et duplication restent validées', async () => {
  const controller = new LPrepUIController({ idFactory: createSequentialIdFactory('ui-chain') });
  controller.openProject(await fixture());
  const originalCount = controller.activeSession.chains.length;
  assert.equal(controller.createChain({ name: 'VOIX', audioFormat: 'mono' }).status, 'committed');
  const chain = controller.activeSession.chains.at(-1);
  assert.equal(controller.saveActiveChainAsPreset(chain.chainId).status, 'created');
  const preset = controller.presets.list()[0];
  assert.equal(controller.insertPreset(preset.presetId, preset.revision).status, 'committed');
  assert.equal(controller.activeSession.chains.length, originalCount + 2);
  assert.equal(controller.duplicateActiveSession().status, 'committed');
  assert.equal(controller.project.sessions.length, 3); assert.deepEqual(errors(controller.project), []);
});

test('Patch rapide propose sans mutation puis s’applique uniquement après confirmation', async () => {
  const controller = new LPrepUIController({ idFactory: createSequentialIdFactory('ui-patch') });
  controller.openProject(await fixture());
  const before = structuredClone(controller.project), proposal = controller.proposePatch();
  assert.equal(proposal.valid, true); assert.deepEqual(controller.project, before);
  assert.ok(proposal.diff.addedAssignmentRefs.length > 0);
  assert.equal(controller.applyPatch().status, 'committed'); assert.ok(controller.activeSession.patchAssignments.length > 0);
  assert.deepEqual(errors(controller.project), []);
});

test('un conflit de Patch rapide est exposé et ne modifie pas le projet', async () => {
  const project = await fixture();
  project.sessions[0].environmentConfiguration.virtualResources.forEach(value => { value.availability = 'unavailable'; });
  const controller = new LPrepUIController(); controller.openProject(project);
  const before = structuredClone(controller.project), proposal = controller.proposePatch();
  assert.equal(proposal.valid, false); assert.equal(proposal.status, 'impossible');
  assert.ok(proposal.issues.some(value => value.code === 'patch.capacity'));
  assert.equal(controller.applyPatch().status, 'invalid'); assert.deepEqual(controller.project, before);
});

test('Undo/Redo conserve les identifiants créés par l’interface', async () => {
  const controller = new LPrepUIController({ idFactory: createSequentialIdFactory('ui-history') });
  controller.openProject(await fixture()); controller.createChain({ name: 'UNDO' });
  const chainId = controller.activeSession.chains.at(-1).chainId;
  assert.equal(controller.undo().status, 'undone'); assert.ok(!JSON.stringify(controller.project).includes(chainId));
  assert.equal(controller.redo().status, 'redone'); assert.ok(JSON.stringify(controller.project).includes(chainId));
});

test('sauvegarde navigateur, rechargement et historique de révisions préservent les IDs', async () => {
  const store = new MemoryRevisionStore(), controller = new LPrepUIController({ revisionStore: store,
    idFactory: createSequentialIdFactory('ui-save') });
  controller.openProject(await fixture()); const before = structuredClone(controller.project);
  const first = await controller.save(); controller.renameProject('Révision deux'); const second = await controller.save();
  assert.equal(second.parentRevisionId, first.revisionId); assert.equal((await controller.listSavedProjects()).length, 1);
  await controller.openRevision(first.revisionId); assert.deepEqual(controller.project, before);
  assert.equal(controller.project.sessions[0].sessionId, before.sessions[0].sessionId);
});

test('export/import valide sans écrasement silencieux et refuse les documents invalides', async () => {
  const controller = new LPrepUIController(); controller.openProject(await fixture());
  const json = controller.exportJSON(), before = structuredClone(controller.project);
  assert.equal(controller.importJSON(json).status, 'confirmation-required'); assert.deepEqual(controller.project, before);
  assert.equal(controller.importJSON(json, { replaceCurrent: true }).status, 'opened');
  assert.throws(() => controller.importJSON('{"schemaVersion":99}'));
});

test('le moteur navigateur récupère la dernière révision complète et ignore une écriture interrompue', async () => {
  const project = await fixture(), store = new MemoryRevisionStore();
  const engine = new BrowserRevisionEngine(store, { idFactory: createSequentialIdFactory('browser-revision'), clock: () => '2026-11-18T12:00:00.000Z' });
  const saved = await engine.save(project); await store.begin({ revisionId: 'revision:pending', projectId: project.projectId, committedAt: '9999-01-01T00:00:00.000Z' });
  const recovered = await engine.recoverLatest(project.projectId); assert.equal(recovered.record.revisionId, saved.revisionId);
  assert.deepEqual(recovered.project, project);
});

test('le renommage de session conserve les identifiants et suit l’état de sauvegarde Undo/Redo', async () => {
  const controller = new LPrepUIController({ revisionStore: new MemoryRevisionStore() });
  controller.openProject(await fixture());
  const before = controller.activeSession;
  const saved = await controller.save();
  assert.equal(controller.hasUnsavedChanges, false);
  assert.equal(controller.renameActiveSession('Balances').status, 'committed');
  assert.deepEqual(controller.activeSession, { ...before, name: 'Balances' });
  assert.equal(controller.hasUnsavedChanges, true);
  controller.undo();
  assert.deepEqual(controller.activeSession, before);
  assert.equal(controller.hasUnsavedChanges, false);
  controller.redo();
  const renamed = await controller.save();
  assert.equal(renamed.parentRevisionId, saved.revisionId);
  await controller.openRevision(renamed.revisionId);
  assert.deepEqual(controller.activeSession, { ...before, name: 'Balances' });
});
