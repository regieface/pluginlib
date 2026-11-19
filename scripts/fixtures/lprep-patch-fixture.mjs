import { readFile } from 'node:fs/promises';
import { createDefaultEnvironmentProfile, instantiateEnvironmentProfile } from '../../lprep/lprep-environment.mjs';
import { applyPatchProposal, proposeQuickPatch } from '../../lprep/lprep-patch.mjs';

const fixtureUrl = new URL('./lprep-project-v1.json', import.meta.url);

export async function loadPatchFixture() {
  const project = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const profile = createDefaultEnvironmentProfile();
  for (const session of project.sessions) {
    Object.assign(session, instantiateEnvironmentProfile(profile, session.sessionId, { copiedAt: '2026-11-18T00:00:00.000Z' }));
    session.patchAssignments = [];
    const externalNodes = new Set(session.audioGraph.nodes.filter(node => ['audio-input', 'audio-output'].includes(node.type)).map(node => node.nodeId));
    const externalPorts = new Set(session.audioGraph.ports.filter(port => externalNodes.has(port.nodeId)).map(port => port.portId));
    session.audioGraph.connections = session.audioGraph.connections.filter(connection =>
      !externalPorts.has(connection.sourcePortId) && !externalPorts.has(connection.destinationPortId));
    session.audioGraph.nodes = session.audioGraph.nodes.filter(node => !externalNodes.has(node.nodeId));
    session.audioGraph.ports = session.audioGraph.ports.filter(port => !externalPorts.has(port.portId));
  }
  return project;
}

export async function loadReferencePatchFixture() {
  const project = await loadPatchFixture();
  const session = applyPatchProposal(project.sessions[0], proposeQuickPatch(project.sessions[0])).session;
  const wanted = new Map([
    ['DRUM:input', [1, 2]], ['DRUM:output', [1, 2]],
    ['BASS:input', [3]], ['BASS:output', [3]],
    ['FX:input', [17]], ['FX:output', [17, 18]],
    ['INSTRUS:output', [5, 6]]
  ]);
  for (const assignment of session.patchAssignments) {
    const chain = session.chains.find(value => value.chainId === assignment.chainId);
    const channels = wanted.get(`${chain.name}:${assignment.direction}`);
    if (!channels) continue;
    assignment.resourceRefs = channels.map(channel => `${session.sessionId}/virtual-${assignment.direction}:${channel}`);
    assignment.origin = 'manual';
    const node = session.audioGraph.nodes.find(value => value.metadata?.originAssignmentId === assignment.assignmentId);
    node.externalResourceRefs = [...assignment.resourceRefs];
    if (chain.name === 'FX' && assignment.direction === 'input') {
      const connection = session.audioGraph.connections.find(value => value.originAssignmentId === assignment.assignmentId);
      connection.channelMap = [{ sourceChannel: 1, destinationChannel: 1 }, { sourceChannel: 1, destinationChannel: 2 }];
      session.audioGraph.ports.find(value => value.nodeId === node.nodeId).channelCount = 1;
      session.audioGraph.ports.find(value => value.nodeId === node.nodeId).channelLayout = 'mono';
    }
  }
  project.sessions[0] = session;
  return project;
}
