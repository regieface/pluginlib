import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existingVariants, filterCatalog, instancePluginDetail, sessionLatency, thumbnailUrl } from '../lprep/lprep-catalog-view.mjs';
import { prepareDemoProject } from '../lprep/lprep-demo.mjs';
import { validateProject } from '../lprep/lprep-project.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';

const fixture = async () => prepareDemoProject(JSON.parse(await readFile(
  new URL('./fixtures/lprep-project-v1.json', import.meta.url), 'utf8'
)));
const plugin = { id: 'vendor--actual-eq', name: 'Égaliseur réel', vendor: 'Vendor', image: 'https://example.org/plugin.png' };
const present = { state: 'present' };

test('les filtres respectent les familles du traitement et la recherche sans accents', () => {
  const mixed = { ...plugin, classification: { treatments: [
    { ...present, type: 'equalizer', families: [{ ...present, id: 'parametric' }] },
    { ...present, type: 'compressor', families: [{ ...present, id: 'vca' }] }
  ] } };
  assert.deepEqual(filterCatalog([mixed], { query: 'egaliseur', treatment: 'equalizer', family: 'equalizer/parametric' }), [mixed]);
  assert.deepEqual(filterCatalog([mixed], { treatment: 'equalizer', family: 'compressor/vca' }), []);
  assert.deepEqual(filterCatalog([mixed], { family: 'compressor/vca' }), [mixed]);
  assert.deepEqual(filterCatalog([mixed], { treatment: 'delay' }), []);
});

test('la latence reprend la mesure à la fréquence exacte et conserve zéro et inconnu', () => {
  const source = 'https://example.org/latency';
  const measured = { ...plugin, latency: { 48: { samples: 0, source }, 96: { samples: 128, source } } };
  assert.deepEqual(sessionLatency(measured, 48000), { label: '0 éch.', detail: '48 kHz' });
  assert.deepEqual(sessionLatency(measured, 96000), { label: '128 éch.', detail: '96 kHz' });
  assert.equal(sessionLatency(measured, 44100).label, 'Latence inconnue');
  assert.equal(sessionLatency(measured, null).label, 'Latence inconnue');
  assert.equal(sessionLatency({ latency: { 48: { samples: 91 } } }, 48000).label, 'Latence inconnue');
});

test('les visuels du catalogue peuvent être distants sans accepter un schéma exécutable', () => {
  const base = 'http://localhost:5500/';
  assert.equal(thumbnailUrl(plugin.image, base), plugin.image);
  assert.equal(thumbnailUrl('art/eq.png', base), new URL('art/eq.png', base).href);
  assert.equal(thumbnailUrl('javascript:alert(1)', base), null);
});

test('un ajout construit le chemin principal et reste valide dans une révision et un preset', async () => {
  const revisionStore = new MemoryRevisionStore();
  const controller = new LPrepUIController({ revisionStore });
  controller.createProject('G2');
  controller.createChain({ name: 'Voix' });
  const chainId = controller.activeSession.chainOrder[0];
  assert.equal(controller.appendCatalogPlugin(chainId, plugin).status, 'committed');
  const added = controller.project;
  const [instance] = controller.activeSession.pluginInstances;
  assert.equal(instance.catalogRef.pluginId, plugin.id);
  assert.equal(instance.variantRef, null);
  assert.equal(instance.resolutionStatus, 'unresolved');
  assert.deepEqual(controller.activeSession.chains[0].pluginOrder, [instance.instanceId]);
  assert.deepEqual(validateProject(added).filter(issue => issue.severity === 'error'), []);
  assert.equal(controller.activeSession.audioGraph.ports.at(-1).channelCount, null);
  assert.ok(!JSON.stringify(added).includes(plugin.image));
  assert.equal(controller.undo().status, 'undone');
  assert.deepEqual(controller.activeSession.chains[0].pluginOrder, []);
  assert.equal(controller.redo().status, 'redone');
  assert.deepEqual(controller.project, added);
  const { revisionId } = await controller.save();
  const reopened = new LPrepUIController({ revisionStore });
  await reopened.openRevision(revisionId);
  assert.deepEqual(reopened.project, added);
  assert.equal(reopened.saveActiveChainAsPreset(chainId).status, 'created');
  const [preset] = reopened.presets.list();
  assert.equal(reopened.insertPreset(preset.presetId, preset.revision).status, 'committed');
});

test('un ajout avec variante épinglée préserve les références de la variante et le patch existant', async () => {
  const controller = new LPrepUIController();
  controller.openProject(await fixture());
  controller.proposePatch();
  assert.equal(controller.applyPatch().status, 'committed');
  const before = controller.activeSession;
  const chainId = before.chainOrder[0];
  const chainBefore = before.chains.find(chain => chain.chainId === chainId);
  const original = before.pluginInstances.find(instance => instance.instanceId === chainBefore.pluginOrder[0]);
  const pickedPlugin = { id: original.catalogRef.pluginId, ...original.catalogRef.fallback };
  assert.deepEqual(existingVariants(controller.project, pickedPlugin.id), [original.variantRef]);
  assert.equal(controller.appendCatalogPlugin(chainId, pickedPlugin, original.variantRef).status, 'committed');
  const after = controller.activeSession;
  const chain = after.chains.find(value => value.chainId === chainId);
  assert.deepEqual(chain.pluginOrder.slice(0, -1), chainBefore.pluginOrder);
  assert.deepEqual(after.pluginInstances.at(-1).variantRef, original.variantRef);
  const getOutput = session => session.patchAssignments.find(value => value.direction === 'output' && value.chainId === chainId);
  const previousPatch = getOutput(before), nextPatch = getOutput(after);
  assert.deepEqual(nextPatch.resourceRefs, previousPatch.resourceRefs);
  assert.deepEqual(nextPatch.targetPortRefs, [chain.mainPath.outputBoundaryPortRef]);
  assert.equal(after.audioGraph.connections.find(c => c.connectionId === nextPatch.connectionRefs[0]).sourcePortId,
    chain.mainPath.outputBoundaryPortRef);
  assert.deepEqual(validateProject(controller.project).filter(issue => issue.severity === 'error'), []);
});

test('la fiche d’une instance garde la variante et les seules informations disponibles', () => {
  const instance = {
    instanceId: 'instance:test', displayName: 'Nom de scène',
    catalogRef: { pluginId: 'catalogue:test', fallback: { name: 'Nom de secours', vendor: 'Fabricant stocké' } },
    variantRef: { variantId: 'variante:test', revision: 2, fallback: { name: 'Variante stockée' } },
    metadata: { bypassed: false }
  };
  const catalog = { name: 'Nom catalogue', vendor: 'Fabricant officiel', image: 'catalogue.png' };
  const known = instancePluginDetail(instance, catalog);
  assert.equal(known.plugin.name, 'Nom de scène');
  assert.equal(known.plugin.image, 'catalogue.png');
  assert.ok(known.instanceRows.some(([label, value]) => label === 'Variante technique' && value === 'Variante stockée'));
  assert.ok(known.instanceRows.some(([label, value]) => label === 'Révision' && value === '2'));
  const missing = instancePluginDetail({ ...instance, displayName: '', variantRef: null, resolutionStatus: 'unresolved' });
  assert.deepEqual(missing.plugin, { name: 'Nom de secours', vendor: 'Fabricant stocké' });
  assert.ok(missing.instanceRows.some(([label, value]) => label === 'Résolution' && value === 'Variante à résoudre'));
});
