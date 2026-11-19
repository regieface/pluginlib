import test from 'node:test';
import assert from 'node:assert/strict';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';
import { duplicateSession, validateProject } from '../lprep/lprep-project.mjs';
import { applyPatchProposal, proposeQuickPatch } from '../lprep/lprep-patch.mjs';
import { FileRevisionStore, MemoryRevisionStore, ProjectRevisionEngine, RevisionError } from '../lprep/lprep-persistence.mjs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTemporaryReplacement, resolveEffectivePlugin, validateTemporaryReplacements } from '../lprep/lprep-replacements.mjs';
import { ProjectHistory, ProjectTransaction } from '../lprep/lprep-transactions.mjs';
import { migrateProject } from '../lprep/lprep-migrations.mjs';
import { loadPatchFixture } from './fixtures/lprep-patch-fixture.mjs';

const clone = value => structuredClone(value);
const validReplacement = session => createTemporaryReplacement({
  replacementId: 'replacement:test', sessionId: session.sessionId, machineId: 'machine:stage',
  originalInstanceId: session.pluginInstances[0].instanceId,
  replacementCatalogRef: { pluginId: 'example--replacement', fallback: { name: 'Replacement', vendor: 'Example' } },
  replacementVariantRef: { variantId: 'variant:replacement-au-stereo', revision: 1, fallback: { name: 'AU stéréo' } },
  installationRef: { installationId: 'installation:stage-replacement' },
  portMapping: { inputs: [{ original: 1, replacement: 1 }, { original: 2, replacement: 2 }],
    outputs: [{ original: 1, replacement: 1 }, { original: 2, replacement: 2 }] },
  state: 'active', validation: { status: 'valid', issues: [] }
});
const installations = [{ installationId: 'installation:stage-replacement', machineId: 'machine:stage',
  variantId: 'variant:replacement-au-stereo' }];

test('une transaction engage tout le candidat validé sans modifier la source', async () => {
  const project = await loadPatchFixture(), before = clone(project);
  const history = new ProjectHistory(project, { idFactory: createSequentialIdFactory('history') });
  const transaction = new ProjectTransaction({ baseRevisionId: history.revisionId, transactionId: 'transaction:patch',
    apply: candidate => { candidate.sessions[0] = applyPatchProposal(candidate.sessions[0], proposeQuickPatch(candidate.sessions[0])).session; return candidate; } });
  const result = history.commit(transaction);
  assert.equal(result.status, 'committed');
  assert.ok(result.project.sessions[0].patchAssignments.length > 0);
  assert.deepEqual(project, before);
  assert.deepEqual(validateProject(result.project).filter(value => value.severity === 'error'), []);
});

test('échec de validation et conflit de révision ne produisent aucune mutation', async () => {
  const project = await loadPatchFixture(), history = new ProjectHistory(project), before = clone(history.project);
  const invalid = history.commit(new ProjectTransaction({ baseRevisionId: history.revisionId,
    apply: candidate => { candidate.sessions[0].audioGraph.connections[0].sourcePortId = 'port:missing'; return candidate; } }));
  assert.equal(invalid.status, 'invalid');
  assert.deepEqual(history.project, before);
  const conflict = history.commit(new ProjectTransaction({ baseRevisionId: 'revision:stale', apply: candidate => candidate }));
  assert.equal(conflict.status, 'conflict');
  assert.deepEqual(history.project, before);
});

test('Undo/Redo restaure une transaction complète, conserve les IDs et invalide Redo après divergence', async () => {
  const project = await loadPatchFixture(), history = new ProjectHistory(project, { idFactory: createSequentialIdFactory('undo') });
  const alternateBefore = clone(project.sessions[1]);
  const commit = history.commit(new ProjectTransaction({ baseRevisionId: history.revisionId, apply: candidate => {
    candidate.sessions[0] = applyPatchProposal(candidate.sessions[0], proposeQuickPatch(candidate.sessions[0])).session;
    candidate.sessions[0].chains[0].color = '#123456'; return candidate;
  } }));
  const committed = clone(commit.project), ids = committed.sessions[0].patchAssignments.map(value => value.assignmentId);
  assert.equal(history.undo().status, 'undone'); assert.equal(history.project.sessions[0].patchAssignments.length, 0);
  assert.equal(history.redo().status, 'redone'); assert.deepEqual(history.project, committed);
  assert.deepEqual(history.project.sessions[0].patchAssignments.map(value => value.assignmentId), ids);
  assert.deepEqual(history.project.sessions[1], alternateBefore);
  history.undo();
  history.commit(new ProjectTransaction({ baseRevisionId: history.revisionId, apply: candidate => { candidate.name = 'Branche nouvelle'; return candidate; } }));
  assert.equal(history.redo().status, 'unavailable');
});

test('un identifiant créé puis annulé ne peut pas être recyclé sur une nouvelle branche', async () => {
  const project = await loadPatchFixture(), history = new ProjectHistory(project, { idFactory: createSequentialIdFactory('ids') });
  const add = candidate => { candidate.sessions[0].temporaryReplacements = [validReplacement(candidate.sessions[0])]; return candidate; };
  assert.equal(history.commit(new ProjectTransaction({ baseRevisionId: history.revisionId, apply: add })).status, 'committed');
  history.undo();
  const recycled = history.commit(new ProjectTransaction({ baseRevisionId: history.revisionId, apply: add }));
  assert.equal(recycled.status, 'invalid');
  assert.ok(recycled.diagnostics.some(value => value.code === 'transaction.id-recycled'));
});

test('persistance : sauvegarde, rechargement et récupération de la dernière révision complète', async () => {
  const project = await loadPatchFixture(), store = new MemoryRevisionStore();
  const engine = new ProjectRevisionEngine(store, { idFactory: createSequentialIdFactory('persist'), clock: (() => {
    let second = 0; return () => `2026-11-18T00:00:0${++second}.000Z`; })() });
  const first = await engine.save(project, { transactionId: 'transaction:first' });
  const changed = clone(project); changed.name = 'Projet sauvegardé';
  const second = await engine.save(changed, { parentRevisionId: first.revisionId, transactionId: 'transaction:second' });
  assert.deepEqual((await engine.load(second.revisionId)).project, changed);
  await store.begin({ revisionId: 'revision:interrupted', committedAt: '9999-01-01T00:00:00.000Z' });
  assert.equal((await engine.recoverLatest()).record.revisionId, second.revisionId);
});

test('l’adaptateur fichier publie uniquement les révisions atomiquement terminées', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lprep-revisions-'));
  try {
    const project = await loadPatchFixture(), store = new FileRevisionStore(directory);
    const engine = new ProjectRevisionEngine(store, { idFactory: createSequentialIdFactory('file'), clock: () => '2026-11-18T00:00:00.000Z' });
    const saved = await engine.save(project, { transactionId: 'transaction:file' });
    assert.deepEqual((await engine.load(saved.revisionId)).project, project);
    await store.begin({ revisionId: 'revision:unfinished', committedAt: '9999-01-01T00:00:00.000Z' });
    assert.equal((await engine.recoverLatest()).record.revisionId, saved.revisionId);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('une tentative concurrente ne retire pas le verrou fichier détenu par une autre écriture', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lprep-lock-'));
  try {
    const lock = join(directory, '.commit.lock');
    await writeFile(lock, 'autre écriture');
    const store = new FileRevisionStore(directory);
    await assert.rejects(() => store.commit('revision:blocked'), { code: 'EEXIST' });
    assert.equal(await readFile(lock, 'utf8'), 'autre écriture');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('la tête reste la dernière sauvegarde malgré une horloge identique et des IDs décroissants', async () => {
  const project = await loadPatchFixture();
  const ids = ['revision:z', 'revision:a'];
  const engine = new ProjectRevisionEngine(new MemoryRevisionStore(), {
    idFactory: () => ids.shift(), clock: () => '2026-11-18T00:00:00.000Z'
  });
  const first = await engine.save(project);
  const updated = { ...project, name: 'Nouvelle révision' };
  const second = await engine.save(updated, { parentRevisionId: first.revisionId });
  assert.equal((await engine.recoverLatest(project.projectId)).record.revisionId, second.revisionId);
  assert.equal((await engine.save(updated, { parentRevisionId: second.revisionId })).unchanged, true);
});

test('une corruption est détectée et la récupération revient à la dernière révision valide', async () => {
  const project = await loadPatchFixture(), store = new MemoryRevisionStore();
  const engine = new ProjectRevisionEngine(store, { idFactory: createSequentialIdFactory('corrupt'), clock: (() => {
    let second = 0; return () => `2026-11-18T00:00:0${++second}.000Z`; })() });
  const first = await engine.save(project, { transactionId: 'transaction:first' });
  const second = await engine.save({ ...project, name: 'Deuxième' }, { parentRevisionId: first.revisionId, transactionId: 'transaction:second' });
  store.complete.get(second.revisionId).documentSnapshotRef.document = '{}';
  await assert.rejects(() => engine.load(second.revisionId), RevisionError);
  const recovered = await engine.recoverLatest();
  assert.equal(recovered.record.revisionId, first.revisionId);
  assert.equal(recovered.skippedCorruptRevisions.length, 1);
});

test('un document futur est refusé en écriture et une migration échoue sans altérer sa source', async () => {
  const project = await loadPatchFixture(), future = clone(project); future.schemaVersion = 99;
  const engine = new ProjectRevisionEngine(new MemoryRevisionStore());
  await assert.rejects(() => engine.save(future), error => error.diagnostics.some(value => value.code === 'revision.future-schema'));
  const before = clone(future), migration = migrateProject(future);
  assert.equal(migration.status, 'unsupported'); assert.deepEqual(future, before);
  const old = clone(project); delete old.sessions[0].temporaryReplacements;
  const oldBefore = clone(old);
  const migrated = migrateProject(old);
  assert.equal(migrated.status, 'migrated'); assert.deepEqual(migrated.project.sessions[0].temporaryReplacements, []);
  assert.deepEqual(old, oldBefore);
});

test('un remplacement actif ne concerne que sa session, sa machine et son instance', async () => {
  const project = await loadPatchFixture(), session = project.sessions[0], graphBefore = clone(session.audioGraph);
  session.temporaryReplacements = [validReplacement(session)];
  assert.deepEqual(validateTemporaryReplacements(session, { installations }), []);
  assert.equal(resolveEffectivePlugin(project, session.sessionId, 'machine:stage', session.pluginInstances[0].instanceId, { installations }).status, 'replacement');
  assert.equal(resolveEffectivePlugin(project, session.sessionId, 'machine:studio', session.pluginInstances[0].instanceId, { installations }).status, 'original');
  const alternateInstance = { ...clone(session.pluginInstances[0]), instanceId: 'instance:alternate-scope',
    sessionId: project.sessions[1].sessionId };
  project.sessions[1].pluginInstances.push(alternateInstance);
  assert.equal(resolveEffectivePlugin(project, project.sessions[1].sessionId, 'machine:stage', alternateInstance.instanceId, { installations }).status, 'original');
  assert.deepEqual(session.audioGraph, graphBefore);
  session.temporaryReplacements[0].state = 'inactive';
  assert.equal(resolveEffectivePlugin(project, session.sessionId, 'machine:stage', session.pluginInstances[0].instanceId, { installations }).status, 'original');
});

test('variante, installation, mapping et doubles remplacements actifs invalides sont refusés', async () => {
  const project = await loadPatchFixture(), session = project.sessions[0], replacement = validReplacement(session);
  session.temporaryReplacements = [replacement, { ...clone(replacement), replacementId: 'replacement:second' }];
  assert.ok(validateTemporaryReplacements(session, { installations }).some(value => value.code === 'replacement.active-conflict'));
  replacement.portMapping = null;
  assert.ok(validateTemporaryReplacements({ ...session, temporaryReplacements: [replacement] }, { installations }).some(value => value.code === 'replacement.port-mapping'));
  replacement.portMapping = { inputs: [], outputs: [] }; replacement.installationRef.installationId = 'installation:missing';
  assert.ok(validateTemporaryReplacements({ ...session, temporaryReplacements: [replacement] }, { installations }).some(value => value.code === 'replacement.installation'));
  replacement.installationRef = null; replacement.validation.status = 'incompatible';
  assert.ok(validateTemporaryReplacements({ ...session, temporaryReplacements: [replacement] }).some(value => value.code === 'replacement.not-validated'));
});

test('la duplication remappe les remplacements sans toucher aux références partagées', async () => {
  const project = await loadPatchFixture(), session = project.sessions[0]; session.temporaryReplacements = [validReplacement(session)];
  const duplicate = duplicateSession(session, { idFactory: createSequentialIdFactory('replacement-copy') });
  const replacement = duplicate.temporaryReplacements[0];
  assert.notEqual(replacement.replacementId, session.temporaryReplacements[0].replacementId);
  assert.equal(replacement.sessionId, duplicate.sessionId);
  assert.equal(replacement.originalInstanceId, duplicate.pluginInstances[0].instanceId);
  assert.equal(replacement.replacementCatalogRef.pluginId, 'example--replacement');
  assert.deepEqual(validateTemporaryReplacements(duplicate), []);
});

test('la duplication signale les extensions opaques sans les réinterpréter', async () => {
  const project = await loadPatchFixture(), session = project.sessions[0], diagnostics = [];
  session.extensions.future = { possibleReference: session.pluginInstances[0].instanceId };
  const duplicate = duplicateSession(session, { idFactory: createSequentialIdFactory('opaque'), diagnostics });
  assert.deepEqual(duplicate.extensions, session.extensions);
  assert.ok(diagnostics.some(value => value.code === 'duplication.extensions-opaque'));
});
