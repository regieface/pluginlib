import { createDefaultEnvironmentProfile, instantiateEnvironmentProfile } from './lprep-environment.mjs';

export function prepareDemoProject(project) {
  const result = structuredClone(project), profile = createDefaultEnvironmentProfile();
  for (const session of result.sessions) {
    if (!session.environmentSourceRef) Object.assign(session, instantiateEnvironmentProfile(profile, session.sessionId));
    session.patchAssignments ||= []; session.temporaryReplacements ||= [];
    const externalNodes = new Set(session.audioGraph.nodes.filter(node => ['audio-input', 'audio-output'].includes(node.type)).map(node => node.nodeId));
    const externalPorts = new Set(session.audioGraph.ports.filter(port => externalNodes.has(port.nodeId)).map(port => port.portId));
    session.audioGraph.connections = session.audioGraph.connections.filter(connection =>
      !externalPorts.has(connection.sourcePortId) && !externalPorts.has(connection.destinationPortId));
    session.audioGraph.nodes = session.audioGraph.nodes.filter(node => !externalNodes.has(node.nodeId));
    session.audioGraph.ports = session.audioGraph.ports.filter(port => !externalPorts.has(port.portId));
  }
  return result;
}
