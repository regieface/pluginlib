import test from 'node:test';
import assert from 'node:assert/strict';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';
import { validateProject } from '../lprep/lprep-project.mjs';
import { LPrepConstructorService } from '../lprep/lprep-constructor-services.mjs';
import { MemoryPresetStore, createChainPresetFromSession, createPresetInsertionTransaction,
  preparePresetInsertion, validateChainPreset } from '../lprep/lprep-presets.mjs';
import { assessPluginAvailability, resolveSharedReference } from '../lprep/lprep-shared-resources.mjs';
import { MemoryRevisionStore, ProjectRevisionEngine } from '../lprep/lprep-persistence.mjs';
import { createTemporaryReplacement, resolveEffectivePlugin } from '../lprep/lprep-replacements.mjs';
import { loadReferencePatchFixture } from './fixtures/lprep-patch-fixture.mjs';

const clone = value => structuredClone(value);
const errors = value => value.filter(issue => issue.severity === 'error');

async function drumPreset() {
  const project = await loadReferencePatchFixture();
  const result = createChainPresetFromSession(project.sessions[0], 'chain:drum', { presetId: 'preset:drum', name: 'DRUM structure' });
  assert.equal(result.status, 'created');
  return { project, preset: result.preset, diagnostics: result.diagnostics };
}

test('un preset DRUM extrait uniquement le sous-graphe structurel et décrit ses interfaces externes', async () => {
  const { project, preset } = await drumPreset(), sourceBefore = clone(project.sessions[0]);
  assert.deepEqual(errors(validateChainPreset(preset)), []);
  assert.equal(preset.structure.instances.length, 2);
  assert.deepEqual(preset.structure.chain.pluginOrder, ['instance:drum-a', 'instance:drum-b']);
  assert.deepEqual(preset.structure.chain.mainPath.connectionRefs, ['connection:drum-main']);
  assert.ok(preset.structure.interfaces.some(value => value.routingRole === 'secondary' && value.direction === 'outgoing'));
  assert.equal(JSON.stringify(preset).includes('session:main'), false);
  assert.equal(JSON.stringify(preset).includes('opaqueStateRefs'), false);
  assert.equal(JSON.stringify(preset).includes('hostBindingRef'), false);
  assert.deepEqual(project.sessions[0], sourceBefore);
});

test('un sidechain externe devient une interface non résolue avec diagnostic', async () => {
  const project = await loadReferencePatchFixture();
  const result = createChainPresetFromSession(project.sessions[0], 'chain:instrus', { presetId: 'preset:instrus',
    includePresentationInstanceIds: ['instance:independent'] });
  assert.equal(result.status, 'created');
  assert.ok(result.preset.structure.interfaces.some(value => value.routingRole === 'sidechain' && value.resolutionStatus === 'unresolved'));
  assert.ok(result.diagnostics.some(value => value.code === 'preset.external-sidechain'));
});

test('deux insertions créent des chaînes indépendantes sans raccordement externe automatique', async () => {
  const { project, preset } = await drumPreset();
  const targetId = project.sessions[1].sessionId;
  const first = preparePresetInsertion(project, targetId, preset, { idFactory: createSequentialIdFactory('insert-a') });
  assert.equal(first.status, 'prepared');
  const second = preparePresetInsertion(first.project, targetId, preset, { idFactory: createSequentialIdFactory('insert-b') });
  assert.equal(second.status, 'prepared');
  const target = second.project.sessions[1], inserted = target.chains.filter(value => value.metadata?.presetRef?.presetId === preset.presetId);
  assert.equal(inserted.length, 2); assert.notEqual(inserted[0].chainId, inserted[1].chainId);
  assert.equal(new Set(inserted.flatMap(value => value.pluginOrder)).size, 4);
  assert.ok(inserted.every(value => value.compensationGroupId === null));
  assert.ok(inserted.every(value => value.interfaces.every(face => face.resolutionStatus === 'unresolved')));
  assert.deepEqual(errors(validateProject(second.project)), []);
});

test('l’insertion transactionnelle s’annule et se rétablit avec les mêmes identifiants', async () => {
  const { project, preset } = await drumPreset();
  const service = new LPrepConstructorService(project, { idFactory: createSequentialIdFactory('history-preset') });
  const prepared = service.preparePresetInsertion(project.sessions[1].sessionId, preset,
    { idFactory: createSequentialIdFactory('insert-history'), transactionId: 'transaction:insert-preset' });
  assert.equal(prepared.status, 'prepared');
  const committed = service.commit(prepared.transaction), insertedIds = [...prepared.insertion.createdIds];
  assert.equal(committed.status, 'committed');
  assert.equal(service.undo().status, 'undone');
  assert.equal(service.redo().status, 'redone');
  assert.ok(insertedIds.every(id => JSON.stringify(service.project).includes(id)));
});

test('modifier le preset après insertion ne modifie jamais la chaîne insérée', async () => {
  const { project, preset } = await drumPreset();
  const result = preparePresetInsertion(project, project.sessions[1].sessionId, preset,
    { idFactory: createSequentialIdFactory('copy-independence') });
  const before = clone(result.project.sessions[1]);
  preset.structure.chain.name = 'Preset modifié'; preset.structure.instances[0].catalogRef.fallback.name = 'Autre';
  assert.deepEqual(result.project.sessions[1], before);
});

test('la bibliothèque conserve des révisions indépendantes et refuse leur écrasement', async () => {
  const { preset } = await drumPreset(), store = new MemoryPresetStore();
  assert.equal(store.save(preset).status, 'saved');
  assert.equal(store.save(preset).status, 'conflict');
  const revision2 = clone(preset); revision2.revision = 2; revision2.name = 'DRUM v2';
  assert.equal(store.save(revision2).status, 'saved');
  revision2.name = 'Mutation externe';
  assert.equal(store.load(preset.presetId, 2).name, 'DRUM v2');
  assert.equal(store.load(preset.presetId, 1).name, 'DRUM structure');
});

test('les champs interdits, variantes incomplètes et chemins invalides sont refusés', async () => {
  const { preset } = await drumPreset();
  const withState = clone(preset); withState.structure.instances[0].opaqueStateRefs = ['state:x'];
  assert.ok(validateChainPreset(withState).some(value => value.code === 'preset.forbidden-field'));
  const withHost = clone(preset); withHost.structure.nodes[0].hostBindingRef = 'host:x';
  assert.ok(validateChainPreset(withHost).some(value => value.code === 'preset.forbidden-field'));
  const withSession = clone(preset); withSession.structure.instances[0].sessionId = 'session:source';
  assert.ok(validateChainPreset(withSession).some(value => value.code === 'preset.forbidden-field'));
  const withExtension = clone(preset); withExtension.structure.nodes[0].extensions.secret = { sessionId: 'session:source' };
  assert.ok(validateChainPreset(withExtension).some(value => value.code === 'preset.extensions'));
  const missingVariant = clone(preset); delete missingVariant.structure.instances[0].variantRef.revision;
  assert.ok(validateChainPreset(missingVariant).some(value => value.code === 'preset.variant-ref'));
  const invalidPath = clone(preset); invalidPath.structure.chain.mainPath.connectionRefs = ['connection:missing'];
  assert.ok(validateChainPreset(invalidPath).some(value => value.code === 'preset.main-path'));
});

test('une collision, un groupe absent ou une référence interne cassée échouent sans mutation', async () => {
  const { project, preset } = await drumPreset(), before = clone(project);
  assert.equal(preparePresetInsertion(project, project.sessions[1].sessionId, preset, { idFactory: () => 'same:id' }).status, 'invalid');
  assert.equal(preparePresetInsertion(project, project.sessions[1].sessionId, preset,
    { idFactory: createSequentialIdFactory('group'), compensationGroupId: 'compensation-group:missing' }).status, 'invalid');
  const broken = clone(preset); broken.structure.ports[0].nodeId = 'node:missing';
  assert.equal(preparePresetInsertion(project, project.sessions[1].sessionId, broken).status, 'invalid');
  assert.deepEqual(project, before);
});

test('les références descriptives, épinglées et indisponibles gardent leur fallback', () => {
  const catalog = [{ pluginId: 'plugin:a', name: 'Nom actualisé' }];
  assert.equal(resolveSharedReference({ pluginId: 'plugin:a', fallback: { name: 'Ancien' } },
    { kind: 'catalog', resources: catalog, idKey: 'pluginId' }).display.name, 'Nom actualisé');
  const missing = resolveSharedReference({ pluginId: 'plugin:deleted', fallback: { name: 'Conservé' } },
    { kind: 'catalog', resources: catalog, idKey: 'pluginId' });
  assert.equal(missing.status, 'unavailable'); assert.equal(missing.display.name, 'Conservé');
  const pinned = resolveSharedReference({ profileId: 'profile:a', revision: 2, fallback: { name: 'Profil' } },
    { kind: 'midi-profile', resources: [{ profileId: 'profile:a', revision: 3 }], idKey: 'profileId', requireRevision: true });
  assert.equal(pinned.status, 'revision-unavailable');
  assert.equal(resolveSharedReference({ profileId: 'profile:a', fallback: { name: 'Profil' } },
    { kind: 'midi-profile', resources: [], idKey: 'profileId', requireRevision: true }).status, 'invalid');
});

test('licence et installation restent deux diagnostics indépendants via collectionStatus', () => {
  const plugin = { id: 'vendor--plugin', vendor: 'Vendor', name: 'Plugin' };
  const collection = { status: { 'vendor--plugin': 'owned' }, subscriptions: [] };
  const licensedMissing = assessPluginAvailability(plugin, { collection, plans: [], installations: [], machineId: 'machine:a' });
  assert.equal(licensedMissing.licenseStatus, 'owned'); assert.equal(licensedMissing.installed, false); assert.equal(licensedMissing.usable, false);
  const installedUnlicensed = assessPluginAvailability(plugin, { collection: { status: {}, subscriptions: [] }, plans: [],
    installations: [{ machineId: 'machine:a', pluginId: plugin.id }], machineId: 'machine:a' });
  assert.equal(installedUnlicensed.installed, true); assert.equal(installedUnlicensed.usable, false);
});

test('les services ne déduisent jamais le graphe depuis un changement de pluginOrder', async () => {
  const project = await loadReferencePatchFixture(), service = new LPrepConstructorService(project), before = clone(service.project);
  const transaction = service.preparePluginOrderChange(project.sessions[0].sessionId, 'chain:drum', ['instance:drum-b', 'instance:drum-a']);
  const result = service.commit(transaction);
  assert.equal(result.status, 'invalid');
  assert.ok(result.diagnostics.some(value => value.code === 'chain.plugin-order'));
  assert.deepEqual(service.project, before);
});

test('la duplication de projet remappe ses sessions et conserve les références partagées', async () => {
  const project = await loadReferencePatchFixture();
  const duplicate = LPrepConstructorService.duplicateProject(project, { idFactory: createSequentialIdFactory('project-copy') });
  assert.notEqual(duplicate.projectId, project.projectId);
  assert.equal(duplicate.sessions.length, project.sessions.length);
  assert.ok(duplicate.sessions.every((session, index) => session.sessionId !== project.sessions[index].sessionId));
  assert.equal(duplicate.sessions[0].pluginInstances[0].catalogRef.pluginId, project.sessions[0].pluginInstances[0].catalogRef.pluginId);
  assert.deepEqual(errors(validateProject(duplicate)), []);
});

test('le parcours intégré sauvegarde, recharge, remplace et duplique sans état opaque dans le preset', async () => {
  const { project, preset } = await drumPreset();
  const service = new LPrepConstructorService(project, { idFactory: createSequentialIdFactory('integrated-history') });
  const insertion = service.preparePresetInsertion(project.sessions[1].sessionId, preset,
    { idFactory: createSequentialIdFactory('integrated-insert') });
  service.commit(insertion.transaction);
  const committed = service.project, store = new MemoryRevisionStore();
  const revisions = new ProjectRevisionEngine(store, { idFactory: createSequentialIdFactory('integrated-save') });
  const saved = await revisions.save(committed, { transactionId: 'transaction:integrated' });
  const restored = (await revisions.load(saved.revisionId)).project;
  const target = restored.sessions[1], instance = target.pluginInstances[0];
  target.temporaryReplacements = [createTemporaryReplacement({ replacementId: 'replacement:integrated', sessionId: target.sessionId,
    machineId: 'machine:stage', originalInstanceId: instance.instanceId,
    replacementCatalogRef: { pluginId: 'plugin:replacement', fallback: { name: 'Replacement', vendor: 'Vendor' } },
    replacementVariantRef: { variantId: 'variant:replacement', revision: 1, fallback: { name: 'AU' } },
    portMapping: { inputs: [], outputs: [] }, state: 'active', validation: { status: 'valid', issues: [] } })];
  assert.equal(resolveEffectivePlugin(restored, target.sessionId, 'machine:stage', instance.instanceId).status, 'replacement');
  const duplicateTx = new LPrepConstructorService(restored, { idFactory: createSequentialIdFactory('integrated-dup-history') });
  const duplication = duplicateTx.duplicateSession(target.sessionId, { idFactory: createSequentialIdFactory('integrated-dup') });
  assert.equal(duplicateTx.commit(duplication).status, 'committed');
  assert.equal(duplicateTx.project.sessions.length, 3);
  assert.equal(JSON.stringify(preset).includes('opaqueStateRefs'), false);
  assert.deepEqual(errors(validateProject(duplicateTx.project)), []);
});
