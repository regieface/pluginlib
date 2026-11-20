import { chainFormatPortProperties, createAudioConnection, createAudioNode, createAudioPort } from './lprep-audio-graph.mjs';
import { virtualResourceId } from './lprep-environment.mjs';
import { isStableId } from './lprep-identifiers.mjs';

const clone = value => structuredClone(value);
const issue = (issues, path, code, message) => issues.push({ severity: 'error', path, code, message });
const warning = (issues, path, code, message) => issues.push({ severity: 'warning', path, code, message });

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

function availableChannelCount(session, direction, occupied, reserved) {
  return session.environmentConfiguration.virtualResources.filter(value =>
    value.direction === `virtual-${direction}` && value.availability === 'available' &&
    !occupied.has(value.resourceId) && !reserved.has(value.resourceId)).length;
}

function fingerprint(session) {
  return JSON.stringify({ graph: session.audioGraph, assignments: session.patchAssignments || [], environment: session.environmentConfiguration, order: session.chainOrder });
}

export function proposeQuickPatch(session) {
  const original = clone(session);
  const graph = clone(original.audioGraph);
  const assignments = clone(original.patchAssignments || []);
  const issues = [], missingAssignments = [], reallocatedAssignments = [];
  const byId = new Map(original.chains.map(chain => [chain.chainId, chain]));
  // The UI chain order is the sole scheduling order; no role-based sort.
  const chains = original.chainOrder.map(id => byId.get(id))
    .filter(chain => chain && chain.allocationEligibility !== false);
  const eligible = new Set(chains.map(chain => chain.chainId));
  const graphPorts = new Map(graph.ports.map(port => [port.portId, port]));
  const graphConnections = new Map(graph.connections.map(edge => [edge.connectionId, edge]));
  const graphNodes = new Map();
  for (const node of graph.nodes) {
    if (node.metadata?.originAssignmentId) {
      const id = node.metadata.originAssignmentId;
      if (!graphNodes.has(id)) graphNodes.set(id, []);
      graphNodes.get(id).push(node);
    }
  }

  // Rebalance existing, unlocked chain assignments only when the graph shape is
  // directly attributable to that assignment. Custom/ambiguous routing stays fixed.
  const movable = new Map();
  for (const assignment of assignments) {
    if (assignment.locked || assignment.purpose !== 'chain' ||
        !eligible.has(assignment.chainId) || !['input', 'output'].includes(assignment.direction)) continue;
    const chain = byId.get(assignment.chainId);
    const format = chainFormatPortProperties(chain, assignment.direction).channelCount;
    const boundary = assignment.direction === 'input' ?
      chain.mainPath.inputBoundaryPortRef : chain.mainPath.outputBoundaryPortRef;
    const nodes = graphNodes.get(assignment.assignmentId) || [];
    const node = nodes.length === 1 ? nodes[0] : null;
    const nodePorts = graph.ports.filter(port => port.nodeId === node?.nodeId);
    const connected = nodePorts.length === 1 && graph.connections.filter(edge =>
      edge.sourcePortId === nodePorts[0].portId || edge.destinationPortId === nodePorts[0].portId);
    if (!node || node.type !== `audio-${assignment.direction}` ||
        assignment.resourceRefs.length !== format ||
        assignment.targetPortRefs.length !== 1 || assignment.targetPortRefs[0] !== boundary ||
        assignment.connectionRefs.length !== 1 ||
        !connected || connected.length !== 1 ||
        connected[0].connectionId !== assignment.connectionRefs[0] ||
        connected[0].originAssignmentId !== assignment.assignmentId ||
        connected[0].channelMap || assignment.channelMap ||
        JSON.stringify(node.externalResourceRefs) !== JSON.stringify(assignment.resourceRefs)) continue;
    movable.set(assignment.assignmentId, { assignment, node });
  }

  // Fixed/locked/manual-extra allocations hold their channels while movable
  // assignments release their old channels for visual-order reallocation.
  const occupied = occupiedResources(original, assignments.filter(value => !movable.has(value.assignmentId)));
  const virtualPorts = new Map(graph.ports.map(port => [port.portId, port.nodeId]));
  const nodesById = new Map(graph.nodes.map(node => [node.nodeId, node]));
  for (const edge of graph.connections) {
    if (movable.has(edge.originAssignmentId)) continue;
    for (const portId of [edge.sourcePortId, edge.destinationPortId]) {
      const node = nodesById.get(virtualPorts.get(portId));
      if (node?.type === 'audio-input' || node?.type === 'audio-output') {
        for (const ref of node.externalResourceRefs || []) occupied.add(ref);
      }
    }
  }
  const existing = graphPatchChannels(original);
  const reserved = new Set((original.environmentConfiguration?.reservations || [])
    .filter(value => value.exclusive).flatMap(value => value.resourceRefs));
  let unableToPreserve = false;
  const beforeIds = new Set(assignments.map(value => value.assignmentId));

  for (const chain of chains) for (const direction of ['input', 'output']) {
    const prior = assignments.filter(value => value.chainId === chain.chainId &&
      value.direction === direction && value.purpose !== 'sidechain');
    // If an existing assignment is locked or bespoke, preserve it unchanged.
    if (prior.some(value => !movable.has(value.assignmentId)) || prior.length > 1) continue;
    const movableItem = prior.length === 1 ? movable.get(prior[0].assignmentId) : null;
    const boundary = direction === 'input' ?
      chain.mainPath.inputBoundaryPortRef : chain.mainPath.outputBoundaryPortRef;
    const internal = new Set(chain.mainPath.connectionRefs);
    const localEndpoint = direction === 'input' ? 'destinationPortId' : 'sourcePortId';
    if (!movableItem && graph.connections.some(edge => edge.enabledState !== 'disabled' &&
        !internal.has(edge.connectionId) && edge.routingRole === 'main' &&
        edge[localEndpoint] === boundary &&
        (edge.channelMap || existing.get(chain.chainId)?.[direction].length))) continue;

    const count = chainFormatPortProperties(chain, direction).channelCount;
    const chosen = takeChannels(original, direction, count, occupied,
      direction === 'output' ? reserved : new Set());
    if (chosen.length !== count) {
      const availableChannels = availableChannelCount(original, direction, occupied,
        direction === 'output' ? reserved : new Set());
      missingAssignments.push({ chainId: chain.chainId, chainName: chain.name, direction,
        boundaryPortRef: boundary, format: direction === 'input' ? chain.inputFormat : chain.outputFormat,
        requiredChannels: count, availableChannels, reason: 'insufficient-contiguous-capacity' });
      warning(issues, `session.chains.${chain.chainId}.${direction}`, 'patch.capacity',
        `${chain.name} : ${count} canal${count > 1 ? 'aux' : ''} ${direction} requis, ${availableChannels} disponible${availableChannels > 1 ? 's' : ''}.`);
      if (movableItem) unableToPreserve = true;
      continue;
    }
    const resourceRefs = chosen.map(value => value.resourceId);
    resourceRefs.forEach(ref => occupied.add(ref));
    if (movableItem) {
      const { assignment, node } = movableItem;
      if (JSON.stringify(assignment.resourceRefs) !== JSON.stringify(resourceRefs)) {
        reallocatedAssignments.push({ chainId: chain.chainId, chainName: chain.name,
          direction, before: [...assignment.resourceRefs], after: [...resourceRefs] });
        assignment.resourceRefs = [...resourceRefs];
        node.externalResourceRefs = [...resourceRefs];
      }
      continue;
    }

    const assignmentId = `assignment:auto:${original.sessionId}:${chain.chainId}:${direction}`;
    const nodeId = `node:auto:${original.sessionId}:${chain.chainId}:${direction}`;
    const portId = `port:auto:${original.sessionId}:${chain.chainId}:${direction}`;
    const connectionId = `connection:auto:${original.sessionId}:${chain.chainId}:${direction}`;
    graph.nodes.push(createAudioNode({ nodeId, graphId: graph.graphId,
      type: direction === 'input' ? 'audio-input' : 'audio-output', externalResourceRefs: resourceRefs,
      metadata: { originAssignmentId: assignmentId } }));
    graph.ports.push(createAudioPort({ portId, nodeId,
      direction: direction === 'input' ? 'output' : 'input', role: 'main',
      channelCount: count, channelLayout: count === 2 ? 'stereo' : 'mono',
      extensions: { originAssignmentId: assignmentId } }));
    graph.connections.push(createAudioConnection({ connectionId, graphId: graph.graphId,
      sourcePortId: direction === 'input' ? portId : boundary,
      destinationPortId: direction === 'input' ? boundary : portId,
      routingRole: 'main', originAssignmentId: assignmentId, channelMap: null }));
    assignments.push(createPatchAssignment({ assignmentId, sessionId: original.sessionId,
      chainId: chain.chainId, direction, resourceRefs, targetPortRefs: [boundary],
      connectionRefs: [connectionId] }));
  }

  const candidate = { ...original, audioGraph: graph, patchAssignments: assignments };
  const validationIssues = validatePatchState(candidate);
  issues.push(...validationIssues);
  if (unableToPreserve) {
    issue(issues, 'session.patchAssignments', 'patch.reallocation',
      'Réaffectation impossible sans perdre une liaison existante : proposition non applicable.');
  }
  const addedAssignments = assignments.filter(value => !beforeIds.has(value.assignmentId));
  const hasErrors = unableToPreserve || validationIssues.some(value => value.severity === 'error');
  const status = hasErrors ? 'error' : missingAssignments.length === 0 ? 'complete' :
    addedAssignments.length || reallocatedAssignments.length ? 'partial' : 'impossible';
  return { status, valid: status === 'complete' || status === 'partial', issues,
    missingAssignments, baseFingerprint: fingerprint(session), candidate,
    diff: { removedConnectionRefs: [],
      addedAssignmentRefs: addedAssignments.map(value => value.assignmentId),
      addedConnectionRefs: addedAssignments.flatMap(value => value.connectionRefs),
      reallocatedAssignments,
      resourceAllocations: [...addedAssignments.map(value => ({ assignmentId: value.assignmentId,
        direction: value.direction, resourceRefs: [...value.resourceRefs] })),
        ...reallocatedAssignments.map(value => ({ chainId: value.chainId,
          direction: value.direction, resourceRefs: [...value.after] }))] } };
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
