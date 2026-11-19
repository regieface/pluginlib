import { CHAIN_FORMAT_PORTS, createAudioConnection, createAudioNode, createAudioPort } from './lprep-audio-graph.mjs';
import { virtualResourceId } from './lprep-environment.mjs';
import { isStableId } from './lprep-identifiers.mjs';

const clone = value => structuredClone(value);
const issue = (issues, path, code, message) => issues.push({ severity: 'error', path, code, message });

export function createPatchAssignment({ assignmentId, sessionId, chainId, direction, purpose = 'chain',
  resourceRefs = [], targetPortRefs = [], channelMap = null, connectionRefs = [], origin = 'automatic',
  locked = false, provenance = null, validationStatus = 'valid', extensions = {} } = {}) {
  return { assignmentId, sessionId, chainId, direction, purpose, resourceRefs: clone(resourceRefs),
    targetPortRefs: clone(targetPortRefs), channelMap: clone(channelMap), connectionRefs: clone(connectionRefs),
    origin, locked, provenance: clone(provenance), validationStatus, extensions: clone(extensions) };
}

export function validatePatchState(session, { path = 'session' } = {}) {
  const issues = [];
  if (session?.environmentSourceRef === undefined && session?.patchAssignments === undefined) return issues;
  const assignments = Array.isArray(session.patchAssignments) ? session.patchAssignments : [];
  if (!Array.isArray(session.patchAssignments)) issue(issues, `${path}.patchAssignments`, 'patch.assignments', 'Un tableau est requis.');
  const resources = new Map((session.environmentConfiguration?.virtualResources || []).map(value => [value.resourceId, value]));
  const chains = new Set((session.chains || []).map(value => value.chainId));
  const ports = new Map((session.audioGraph?.ports || []).map(value => [value.portId, value]));
  const connections = new Map((session.audioGraph?.connections || []).map(value => [value.connectionId, value]));
  const reserved = new Set((session.environmentConfiguration?.reservations || [])
    .filter(value => value.exclusive).flatMap(value => value.resourceRefs));
  const ids = new Set();
  const claimed = new Map();
  for (const [position, assignment] of assignments.entries()) {
    const at = `${path}.patchAssignments[${position}]`;
    if (!isStableId(assignment?.assignmentId) || ids.has(assignment.assignmentId)) issue(issues, `${at}.assignmentId`, 'patch.assignment-id', 'Identifiant unique requis.');
    ids.add(assignment?.assignmentId);
    if (assignment?.sessionId !== session.sessionId) issue(issues, `${at}.sessionId`, 'patch.session', 'Affectation hors session.');
    if (!chains.has(assignment?.chainId)) issue(issues, `${at}.chainId`, 'patch.chain', 'Chaîne introuvable.');
    if (!['input', 'output'].includes(assignment?.direction)) issue(issues, `${at}.direction`, 'patch.direction', 'Direction invalide.');
    for (const ref of assignment?.resourceRefs || []) {
      const resource = resources.get(ref);
      if (!resource) issue(issues, `${at}.resourceRefs`, 'patch.resource', `Ressource introuvable : ${ref}`);
      else if (resource.direction !== `virtual-${assignment.direction}`) issue(issues, `${at}.resourceRefs`, 'patch.resource-direction', 'Direction de ressource incompatible.');
      if (assignment.purpose !== 'music' && assignment.direction === 'output' && reserved.has(ref)) issue(issues, `${at}.resourceRefs`, 'patch.reserved', 'Sortie réservée à la musique.');
      if (claimed.has(ref) && (claimed.get(ref).direction !== assignment.direction || reserved.has(ref) ||
        claimed.get(ref).purpose === 'music' || assignment.purpose === 'music')) issue(issues, `${at}.resourceRefs`, 'patch.resource-conflict', `Ressource déjà affectée à ${claimed.get(ref).assignmentId}.`);
      else if (!claimed.has(ref)) claimed.set(ref, assignment);
    }
    for (const ref of assignment?.targetPortRefs || []) if (!ports.has(ref)) issue(issues, `${at}.targetPortRefs`, 'patch.port', `Port introuvable : ${ref}`);
    for (const ref of assignment?.connectionRefs || []) {
      const connection = connections.get(ref);
      if (!connection) issue(issues, `${at}.connectionRefs`, 'patch.connection', `Connexion introuvable : ${ref}`);
      else if (connection.originAssignmentId !== assignment.assignmentId) issue(issues, `${at}.connectionRefs`, 'patch.bidirectional', 'La connexion ne référence pas son affectation.');
    }
  }
  for (const connection of connections.values()) {
    if (!connection.originAssignmentId) continue;
    const assignment = assignments.find(value => value.assignmentId === connection.originAssignmentId);
    if (!assignment) issue(issues, `${path}.audioGraph.connections`, 'patch.assignment-missing', 'Affectation de connexion introuvable.');
    else if (!assignment.connectionRefs.includes(connection.connectionId)) issue(issues, `${path}.audioGraph.connections`, 'patch.bidirectional', 'L’affectation ne référence pas sa connexion.');
  }
  if (session.musicRouting?.enabled === false && session.musicRouting.assignmentRefs.length) issue(issues, `${path}.musicRouting`, 'patch.music-disabled', 'Le routing musical désactivé ne porte aucune affectation.');
  return issues;
}

function occupiedResources(session, retained) {
  return new Set(retained.flatMap(value => value.resourceRefs));
}

function takeChannels(session, direction, count, occupied, reserved) {
  const available = session.environmentConfiguration.virtualResources
    .filter(value => value.direction === `virtual-${direction}` && value.availability === 'available' && !occupied.has(value.resourceId) && !reserved.has(value.resourceId))
    .sort((a, b) => a.channelNumber - b.channelNumber);
  if (count === 1) return available.slice(0, 1);
  for (let index = 0; index < available.length - 1; index++) {
    if (available[index].channelNumber % 2 === 1 && available[index + 1].channelNumber === available[index].channelNumber + 1) return available.slice(index, index + 2);
  }
  return [];
}

function fingerprint(session) {
  return JSON.stringify({ graph: session.audioGraph, assignments: session.patchAssignments || [], environment: session.environmentConfiguration });
}

export function proposeQuickPatch(session) {
  const original = clone(session);
  const retained = original.patchAssignments || [];
  const graph = clone(original.audioGraph);
  const occupied = occupiedResources(original, retained);
  const existing = graphPatchChannels(original);
  for (const channels of existing.values()) for (const direction of ['input', 'output']) {
    for (const number of channels[direction]) occupied.add(virtualResourceId(original.sessionId, `virtual-${direction}`, number));
  }
  const reserved = new Set((original.environmentConfiguration?.reservations || []).filter(value => value.exclusive).flatMap(value => value.resourceRefs));
  const roleRank = new Map((original.environmentConfiguration?.allocationPolicy?.rolePriority || ['insert', 'fx']).map((value, index) => [value, index]));
  const chains = [...original.chains].filter(value => value.allocationEligibility !== false)
    .sort((a, b) => (roleRank.get(a.role) ?? 99) - (roleRank.get(b.role) ?? 99) || original.chainOrder.indexOf(a.chainId) - original.chainOrder.indexOf(b.chainId) || a.chainId.localeCompare(b.chainId));
  const assignments = [...retained], issues = [];
  for (const chain of chains) for (const direction of ['input', 'output']) {
    if (retained.some(value => value.chainId === chain.chainId && value.direction === direction && value.purpose !== 'sidechain')) continue;
    const boundary = direction === 'input' ? chain.mainPath.inputBoundaryPortRef : chain.mainPath.outputBoundaryPortRef;
    const internal = new Set(chain.mainPath.connectionRefs);
    const localEndpoint = direction === 'input' ? 'destinationPortId' : 'sourcePortId';
    if (graph.connections.some(edge => edge.enabledState !== 'disabled' && !internal.has(edge.connectionId) &&
      edge.routingRole === 'main' && edge[localEndpoint] === boundary &&
      (edge.channelMap || existing.get(chain.chainId)?.[direction].length))) continue;
    const count = CHAIN_FORMAT_PORTS[chain.audioFormat]?.[direction] ?? 1;
    const chosen = takeChannels(original, direction, count, occupied, direction === 'output' ? reserved : new Set());
    if (chosen.length !== count) { issue(issues, `session.chains.${chain.chainId}`, 'patch.capacity', `Canaux ${direction} insuffisants.`); continue; }
    chosen.forEach(value => occupied.add(value.resourceId));
    const assignmentId = `assignment:auto:${original.sessionId}:${chain.chainId}:${direction}`;
    const nodeId = `node:auto:${original.sessionId}:${chain.chainId}:${direction}`;
    const portId = `port:auto:${original.sessionId}:${chain.chainId}:${direction}`;
    const connectionId = `connection:auto:${original.sessionId}:${chain.chainId}:${direction}`;
    const targetPort = boundary;
    graph.nodes.push(createAudioNode({ nodeId, graphId: graph.graphId, type: direction === 'input' ? 'audio-input' : 'audio-output',
      externalResourceRefs: chosen.map(value => value.resourceId), metadata: { originAssignmentId: assignmentId } }));
    graph.ports.push(createAudioPort({ portId, nodeId, direction: direction === 'input' ? 'output' : 'input', role: 'main',
      channelCount: count, channelLayout: count === 2 ? 'stereo' : 'mono', extensions: { originAssignmentId: assignmentId } }));
    graph.connections.push(createAudioConnection({ connectionId, graphId: graph.graphId,
      sourcePortId: direction === 'input' ? portId : targetPort, destinationPortId: direction === 'input' ? targetPort : portId,
      routingRole: 'main', originAssignmentId: assignmentId,
      channelMap: chain.audioFormat === 'mono-to-stereo'
        ? Array.from({ length: count }, (_, index) => ({ sourceChannel: index + 1, destinationChannel: index + 1 })) : null }));
    assignments.push(createPatchAssignment({ assignmentId, sessionId: original.sessionId, chainId: chain.chainId, direction,
      resourceRefs: chosen.map(value => value.resourceId), targetPortRefs: [targetPort], connectionRefs: [connectionId] }));
  }
  const candidate = { ...original, audioGraph: graph, patchAssignments: assignments };
  issues.push(...validatePatchState(candidate));
  const retainedIds = new Set(retained.map(value => value.assignmentId));
  const addedAssignments = assignments.filter(value => !retainedIds.has(value.assignmentId));
  return { valid: !issues.some(value => value.severity === 'error'), issues, baseFingerprint: fingerprint(session), candidate,
    diff: { removedConnectionRefs: [],
      addedAssignmentRefs: addedAssignments.map(value => value.assignmentId),
      addedConnectionRefs: addedAssignments.flatMap(value => value.connectionRefs),
      resourceAllocations: addedAssignments.map(value => ({ assignmentId: value.assignmentId,
        direction: value.direction, resourceRefs: [...value.resourceRefs] })) } };
}

export function applyPatchProposal(session, proposal) {
  if (!proposal?.valid) throw new PatchTransactionError('La proposition contient des erreurs.', proposal?.issues || []);
  if (proposal.baseFingerprint !== fingerprint(session)) throw new PatchTransactionError('La session a changé depuis la proposition.', []);
  const candidate = clone(proposal.candidate);
  const issues = validatePatchState(candidate);
  if (issues.length) throw new PatchTransactionError('La proposition ne respecte plus les invariants.', issues);
  return { session: candidate, diff: clone(proposal.diff) };
}

export function detachPatchConnection(session, connectionId) {
  const result = clone(session);
  const connection = result.audioGraph.connections.find(value => value.connectionId === connectionId);
  if (!connection?.originAssignmentId) return result;
  const assignment = result.patchAssignments.find(value => value.assignmentId === connection.originAssignmentId);
  if (assignment) assignment.connectionRefs = assignment.connectionRefs.filter(value => value !== connectionId);
  connection.originAssignmentId = null;
  return result;
}

export class PatchTransactionError extends Error {
  constructor(message, issues) { super(message); this.name = 'PatchTransactionError'; this.issues = clone(issues); }
}

export function virtualChannelRefs(node, sessionId, direction) {
  if (node?.type !== `audio-${direction}`) return [];
  const prefix = `${sessionId}/virtual-${direction}:`;
  const refs = node.externalResourceRefs?.length ? node.externalResourceRefs : [node.externalResourceRef];
  return refs.flatMap((ref, index) => {
    if (typeof ref !== 'string' || !ref.startsWith(prefix)) return [];
    const digits = ref.slice(prefix.length);
    const number = Number(digits);
    return /^\d+$/.test(digits) && Number.isSafeInteger(number) && number > 0
      ? [{ lane: index + 1, number }] : [];
  });
}

// A channel appears only when a live graph edge reaches a virtual I/O node.
export function graphPatchChannels(session) {
  const graph = session.audioGraph;
  const ports = new Map(graph.ports.map(port => [port.portId, port]));
  const nodes = new Map(graph.nodes.map(node => [node.nodeId, node]));
  const connections = new Map(graph.connections.map(edge => [edge.connectionId, edge]));
  const incoming = new Map(), outgoing = new Map();
  for (const edge of graph.connections) {
    if (edge.enabledState === 'disabled') continue;
    if (!incoming.has(edge.destinationPortId)) incoming.set(edge.destinationPortId, []);
    if (!outgoing.has(edge.sourcePortId)) outgoing.set(edge.sourcePortId, []);
    incoming.get(edge.destinationPortId).push(edge);
    outgoing.get(edge.sourcePortId).push(edge);
  }
  function channels(edges, direction) {
    const input = direction === 'input';
    const result = new Set();
    for (const edge of edges) {
      const port = ports.get(input ? edge.sourcePortId : edge.destinationPortId);
      const node = nodes.get(port?.nodeId);
      const mapped = edge.channelMap && new Set(edge.channelMap.map(pair =>
        input ? pair.sourceChannel : pair.destinationChannel));
      for (const { lane, number } of virtualChannelRefs(node, session.sessionId, direction)) {
        if (!mapped || mapped.has(lane)) result.add(number);
      }
    }
    return [...result].sort((a, b) => a - b);
  }
  return new Map(session.chains.map(chain => {
    const path = chain.mainPath;
    const pathPorts = [path.inputBoundaryPortRef, path.outputBoundaryPortRef, ...path.connectionRefs.flatMap(id => {
      const edge = connections.get(id);
      return edge ? [edge.sourcePortId, edge.destinationPortId] : [];
    })];
    const pathNodes = new Set(pathPorts.map(id => ports.get(id)?.nodeId));
    if (chain.sidechainNodeRef) pathNodes.add(chain.sidechainNodeRef);
    const ownedPorts = graph.ports.filter(port => pathNodes.has(port.nodeId));
    return [chain.chainId, {
      input: channels(ownedPorts.flatMap(port => incoming.get(port.portId) || []), 'input'),
      output: channels(ownedPorts.flatMap(port => outgoing.get(port.portId) || []), 'output')
    }];
  }));
}
