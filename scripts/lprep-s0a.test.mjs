import test from 'node:test';
import assert from 'node:assert/strict';
import { chainFormatKey, chainSidechainPorts } from '../lprep/lprep-audio-graph.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { migrateProject } from '../lprep/lprep-migrations.mjs';
import { duplicateSession, validateProject } from '../lprep/lprep-project.mjs';
import { deserializeProject, serializeProject } from '../lprep/lprep-serialization.mjs';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';

const errors = project => validateProject(project).filter(issue => issue.severity === 'error');

function projectWithChain(inputFormat, outputFormat, sidechainCount = 0) {
  const controller = new LPrepUIController({ idFactory: createSequentialIdFactory(`s0a-${inputFormat}-${outputFormat}`) });
  controller.createProject('S0-A');
  assert.equal(controller.createChain({ name: 'Chaîne', inputFormat, outputFormat, sidechainCount }).status, 'committed');
  return { controller, project: controller.project, session: controller.activeSession,
    chain: controller.activeSession.chains[0] };
}

test('les quatre combinaisons Mono/Stéréo possèdent des frontières indépendantes valides', () => {
  for (const [inputFormat, outputFormat, inputChannels, outputChannels] of [
    ['mono', 'mono', 1, 1], ['mono', 'stereo', 1, 2],
    ['stereo', 'stereo', 2, 2], ['stereo', 'mono', 2, 1]
  ]) {
    const { project, session, chain } = projectWithChain(inputFormat, outputFormat);
    const ports = new Map(session.audioGraph.ports.map(port => [port.portId, port]));
    assert.equal(chainFormatKey(chain.inputFormat, chain.outputFormat),
      inputFormat === outputFormat ? inputFormat : `${inputFormat}-to-${outputFormat}`);
    assert.equal(ports.get(chain.mainPath.inputBoundaryPortRef).channelCount, inputChannels);
    assert.equal(ports.get(chain.mainPath.outputBoundaryPortRef).channelCount, outputChannels);
    assert.deepEqual(errors(project), []);
  }
});

test('les ports Sidechain restent mono et indépendants des formats principaux', () => {
  const { project, session, chain } = projectWithChain('stereo', 'mono', 2);
  const mainRefs = new Set([chain.mainPath.inputBoundaryPortRef, chain.mainPath.outputBoundaryPortRef]);
  const sidechains = chainSidechainPorts(session.audioGraph, chain);
  assert.equal(sidechains.length, 2);
  assert.ok(sidechains.every(port => port.role === 'sidechain' && port.channelCount === 1 && !mainRefs.has(port.portId)));
  assert.deepEqual(errors(project), []);
});

test('la migration historique conserve intégralement IDs, ports et connexions', () => {
  const { project } = projectWithChain('mono', 'stereo', 1);
  const legacy = structuredClone(project);
  legacy.schemaVersion = 1;
  const chain = legacy.sessions[0].chains[0];
  delete chain.inputFormat; delete chain.outputFormat; chain.audioFormat = 'mono-to-stereo';
  const graphBefore = structuredClone(legacy.sessions[0].audioGraph);
  const idsBefore = {
    projectId: legacy.projectId, sessionId: legacy.sessions[0].sessionId, chainId: chain.chainId
  };
  const migrated = migrateProject(legacy);
  assert.equal(migrated.status, 'migrated');
  assert.equal(migrated.project.schemaVersion, 2);
  assert.deepEqual(migrated.project.sessions[0].audioGraph, graphBefore);
  assert.deepEqual({ projectId: migrated.project.projectId, sessionId: migrated.project.sessions[0].sessionId,
    chainId: migrated.project.sessions[0].chains[0].chainId }, idsBefore);
  assert.equal(migrated.project.sessions[0].chains[0].inputFormat, 'mono');
  assert.equal(migrated.project.sessions[0].chains[0].outputFormat, 'stereo');
  assert.ok(!Object.hasOwn(migrated.project.sessions[0].chains[0], 'audioFormat'));
  assert.deepEqual(legacy.sessions[0].audioGraph, graphBefore);
  assert.equal(deserializeProject(JSON.stringify(legacy)).schemaVersion, 2);
});

test('la migration refuse un ancien format ambigu sans modifier sa source', () => {
  const { project } = projectWithChain('mono', 'mono');
  const legacy = structuredClone(project);
  legacy.schemaVersion = 1;
  const chain = legacy.sessions[0].chains[0];
  delete chain.inputFormat; delete chain.outputFormat; chain.audioFormat = 'unknown';
  const before = structuredClone(legacy);
  const migrated = migrateProject(legacy);
  assert.equal(migrated.status, 'invalid');
  assert.equal(migrated.diagnostics[0].code, 'migration.chain-format-ambiguous');
  assert.deepEqual(legacy, before);
});

test('duplication, Undo/Redo et sérialisation préservent les deux formats', () => {
  const { controller, project, session, chain } = projectWithChain('stereo', 'mono', 1);
  const duplicate = duplicateSession(session, { idFactory: createSequentialIdFactory('s0a-copy') });
  assert.equal(duplicate.chains[0].inputFormat, 'stereo');
  assert.equal(duplicate.chains[0].outputFormat, 'mono');
  assert.notEqual(duplicate.chains[0].chainId, chain.chainId);
  assert.deepEqual(deserializeProject(serializeProject(project)), project);
  assert.equal(controller.undo().status, 'undone');
  assert.equal(controller.activeSession.chains.length, 0);
  assert.equal(controller.redo().status, 'redone');
  assert.equal(controller.activeSession.chains[0].inputFormat, 'stereo');
  assert.equal(controller.activeSession.chains[0].outputFormat, 'mono');
});
