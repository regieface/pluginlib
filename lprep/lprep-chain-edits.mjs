import { chainFormatPortProperties, chainSidechainPorts, createAudioConnection, createAudioNode, createAudioPort, introducesAudioCycle } from './lprep-audio-graph.mjs';

export function moveBefore(order, id, beforeId) {
  if (!order.includes(id) || (beforeId !== null && !order.includes(beforeId))) {
    throw new Error('Emplacement de dépôt introuvable.');
  }
  if (id === beforeId) return order;
  const next = order.filter(value => value !== id);
  next.splice(beforeId === null ? next.length : next.indexOf(beforeId), 0, id);
  return next;
}

function pathData(graph, chain) {
  const ports = new Map(graph.ports.map(port => [port.portId, port]));
  const nodes = new Map(graph.nodes.map(node => [node.nodeId, node]));
  const connections = new Map(graph.connections.map(connection => [connection.connectionId, connection]));
  const { inputBoundaryPortRef, outputBoundaryPortRef, connectionRefs } = chain.mainPath;
  const edges = connectionRefs.map(id => connections.get(id));
  const inputs = [inputBoundaryPortRef, ...edges.map(edge => edge.destinationPortId)];
  const outputs = [...edges.map(edge => edge.sourcePortId), outputBoundaryPortRef];
  const stages = inputs.map((input, index) => ({
    input, output: outputs[index], node: nodes.get(ports.get(input).nodeId)
  }));
  return { edges, stages, ports };
}

const pathNodeIds = ({ stages }) => stages.map(stage => stage.node.nodeId);

export function setChainSidechainCount(session, chain, count, idFactory) {
  if (!Number.isSafeInteger(count) || count < 0 || count > 32) throw new Error('Le nombre de SC doit être compris entre 0 et 32.');
  const graph = session.audioGraph;
  const ports = chainSidechainPorts(graph, chain);
  if (count === ports.length) return;
  if (count < ports.length) {
    const removed = new Set(ports.slice(count).map(port => port.portId));
    const inUse = graph.connections.some(edge => removed.has(edge.sourcePortId) || removed.has(edge.destinationPortId)) ||
      ports.slice(count).some(port => port.hostBindingRef) ||
      (session.patchAssignments || []).some(assignment => assignment.targetPortRefs.some(id => removed.has(id))) ||
      session.chains.some(other => (other.interfaces || []).some(face => removed.has(face.internalPortRef)));
    if (inUse || graph.nodes.find(node => node.nodeId === chain.sidechainNodeRef)?.hostBindingRef) {
      throw new Error('Une entrée SC à retirer est connectée ou référencée. Déconnectez-la avant de la supprimer.');
    }
    graph.ports = graph.ports.filter(port => !removed.has(port.portId));
    if (count === 0) {
      graph.nodes = graph.nodes.filter(node => node.nodeId !== chain.sidechainNodeRef);
      delete chain.sidechainNodeRef;
    }
    return;
  }
  if (!chain.sidechainNodeRef) {
    chain.sidechainNodeRef = idFactory('node');
    graph.nodes.push(createAudioNode({
      nodeId: chain.sidechainNodeRef, graphId: graph.graphId, type: 'bus', label: 'Entrées Sidechain'
    }));
  }
  for (let index = ports.length; index < count; index++) {
    graph.ports.push(createAudioPort({
      portId: idFactory('port'), nodeId: chain.sidechainNodeRef, direction: 'input', role: 'sidechain',
      label: `SC${index + 1}`, channelCount: 1, channelLayout: 'mono', fanInPolicy: 'multiple'
    }));
  }
}

export function editableFormatPorts(session, chain) {
  if (chain.pluginOrder.length || chain.interfaces?.length ||
    (session.patchAssignments || []).some(assignment => assignment.chainId === chain.chainId)) return null;
  const graph = session.audioGraph;
  const path = pathData(graph, chain);
  const { stages, ports, edges } = path;
  const splitBoundaries = stages.length === 2 && stages[1].node.metadata?.lprepOutputBoundary === true &&
    edges[0].channelMap === null && !edges[0].hostBindingRef && !edges[0].originAssignmentId &&
    edges[0].gain == null && edges[0].enabledState !== 'disabled' && edges[0].polarity === 'unknown' &&
    !Object.keys(edges[0].extensions || {}).length;
  if (stages.length !== 1 && !splitBoundaries) return null;
  const boundaries = stages.flatMap(stage => [ports.get(stage.input), ports.get(stage.output)]);
  if (stages.some(({ node }) => node.type !== 'bus' || node.hostBindingRef ||
    graph.ports.filter(port => port.nodeId === node.nodeId).length !== 2) ||
    boundaries.some(port => port.hostBindingRef)) return null;
  const ids = new Set(boundaries.map(port => port.portId));
  if (graph.connections.some(edge => !edges.includes(edge) &&
    (ids.has(edge.sourcePortId) || ids.has(edge.destinationPortId))) ||
    session.chains.some(other => other !== chain && pathNodeIds(pathData(graph, other))
      .some(id => stages.some(stage => stage.node.nodeId === id)))) return null;
  return boundaries;
}

function assertExclusivePath(session, chain, path) {
  const ownNodes = new Set(pathNodeIds(path));
  if (ownNodes.size !== path.stages.length) throw new Error('Ce chemin repasse par un même nœud.');
  for (const other of session.chains) {
    if (other !== chain && pathNodeIds(pathData(session.audioGraph, other)).some(id => ownNodes.has(id))) {
      throw new Error('Ce chemin partage des nœuds avec une autre chaîne.');
    }
  }
}

function replaceBoundaries(session, chain, input, output, except) {
  const from = chain.mainPath;
  const inputChanged = input !== from.inputBoundaryPortRef;
  const outputChanged = output !== from.outputBoundaryPortRef;
  const otherEdges = new Set(session.chains.filter(other => other !== chain).flatMap(other => other.mainPath.connectionRefs));
  for (const edge of session.audioGraph.connections) {
    if (except.has(edge.connectionId) || edge.routingRole !== 'main') continue;
    const incoming = inputChanged && edge.destinationPortId === from.inputBoundaryPortRef;
    const outgoing = outputChanged && edge.sourcePortId === from.outputBoundaryPortRef;
    if (!incoming && !outgoing) continue;
    const assignment = edge.originAssignmentId &&
      session.patchAssignments?.find(value => value.assignmentId === edge.originAssignmentId);
    if (otherEdges.has(edge.connectionId) || edge.hostBindingRef || (assignment && assignment.chainId !== chain.chainId)) {
      throw new Error('Une connexion rattachée à une autre chaîne ou à un hôte utilise cette limite.');
    }
    if (incoming) edge.destinationPortId = input;
    if (outgoing) edge.sourcePortId = output;
  }
  for (const assignment of session.patchAssignments || []) {
    if (assignment.chainId !== chain.chainId) continue;
    const incoming = assignment.direction === 'input';
    const previous = incoming ? from.inputBoundaryPortRef : from.outputBoundaryPortRef;
    const next = incoming ? input : output;
    if (previous === next || !assignment.targetPortRefs.includes(previous)) continue;
    const explicit = new Set(assignment.connectionRefs);
    if (session.audioGraph.connections.some(edge => explicit.has(edge.connectionId) && edge.routingRole !== 'main' &&
      (incoming ? edge.destinationPortId === previous : edge.sourcePortId === previous))) {
      throw new Error('Une affectation hors du chemin principal utilise cette limite.');
    }
    assignment.targetPortRefs = assignment.targetPortRefs.map(ref => ref === previous ? next : ref);
  }
  for (const face of chain.interfaces || []) {
    if (face.direction === 'incoming' && face.internalPortRef === from.inputBoundaryPortRef) face.internalPortRef = input;
    if (face.direction === 'outgoing' && face.internalPortRef === from.outputBoundaryPortRef) face.internalPortRef = output;
  }
}

function rewritePath(session, chain, path, stages, idFactory) {
  const graph = session.audioGraph;
  const originalIds = new Set(path.edges.map(edge => edge.connectionId));
  const input = stages[0].input, output = stages.at(-1).output;
  const nextPairs = stages.slice(1).map((stage, index) => [stages[index].output, stage.input]);
  const matched = nextPairs.map(([source, destination]) => path.edges.find(edge =>
    edge.sourcePortId === source && edge.destinationPortId === destination));
  const removed = path.edges.filter(edge => !matched.includes(edge));
  const fullIdentityMap = edge => {
    const length = edge.channelMap.length;
    const ports = [path.ports.get(edge.sourcePortId), path.ports.get(edge.destinationPortId)];
    return ports.every(port => port.channelCount == null || port.channelCount === length) &&
      edge.channelMap.every((pair, index) => pair.sourceChannel === index + 1 && pair.destinationChannel === index + 1);
  };
  const isSimple = edge => !edge.originAssignmentId && !edge.hostBindingRef && edge.gain == null &&
    (!edge.polarity || edge.polarity === 'unknown') && edge.enabledState !== 'disabled' &&
    !Object.keys(edge.extensions || {}).length &&
    (edge.channelMap == null || fullIdentityMap(edge));
  if (removed.some(edge => !isSimple(edge))) {
    throw new Error('Le déplacement modifierait une connexion avec un routing spécifique.');
  }
  const ports = new Map(graph.ports.map(port => [port.portId, port]));
  const added = [];
  const refs = nextPairs.map(([sourcePortId, destinationPortId], index) => {
    if (matched[index]) return matched[index].connectionId;
    const { channelCount: sourceCount } = ports.get(sourcePortId);
    const { channelCount: destinationCount } = ports.get(destinationPortId);
    if (sourceCount != null && destinationCount != null && sourceCount !== destinationCount) {
      throw new Error('Les ports du nouvel ordre ont des nombres de canaux incompatibles.');
    }
    const template = removed.find(edge => edge.sourcePortId === sourcePortId) ||
      removed.find(edge => edge.destinationPortId === destinationPortId);
    const channelMap = template?.channelMap ?? null;
    const edge = createAudioConnection({
      connectionId: idFactory('connection'), graphId: graph.graphId, sourcePortId, destinationPortId,
      routingRole: 'main', channelMap, enabledState: template?.enabledState
    });
    added.push(edge);
    return edge.connectionId;
  });
  replaceBoundaries(session, chain, input, output, originalIds);
  const removedIds = new Set(removed.map(edge => edge.connectionId));
  graph.connections = graph.connections.filter(edge => !removedIds.has(edge.connectionId)).concat(added);
  chain.mainPath = { ...chain.mainPath, inputBoundaryPortRef: input, outputBoundaryPortRef: output, connectionRefs: refs };
  chain.pluginOrder = stages.flatMap(stage => stage.node.instanceRef ? [stage.node.instanceRef] : []);
}

function insertPathStage(session, chain, stage, beforeId, idFactory) {
  const path = pathData(session.audioGraph, chain);
  assertExclusivePath(session, chain, path);
  const stages = [...path.stages];
  if (stages.length === 1 && stages[0].node.type === 'bus') {
    // Keep both declared boundaries on real bus ports when a plugin joins the path.
    const graph = session.audioGraph;
    const entry = stages[0];
    const output = path.ports.get(entry.output);
    if (entry.node.hostBindingRef || output.hostBindingRef) throw new Error('La sortie reste liée à un hôte.');
    const exit = createAudioNode({ nodeId: idFactory('node'), graphId: graph.graphId, type: 'bus',
      metadata: { lprepOutputBoundary: true } });
    const outputFormat = chainFormatPortProperties(chain, 'output');
    const entryOutput = createAudioPort({ portId: idFactory('port'), nodeId: entry.node.nodeId,
      role: 'main', direction: 'output', ...outputFormat });
    const exitInput = createAudioPort({ portId: idFactory('port'), nodeId: exit.nodeId,
      role: 'main', direction: 'input', ...outputFormat });
    output.nodeId = exit.nodeId;
    graph.nodes.push(exit);
    graph.ports.push(entryOutput, exitInput);
    stages[0] = { ...entry, output: entryOutput.portId };
    stages.push({ node: exit, input: exitInput.portId, output: output.portId });
  }

  const lastPlugin = stages.findLastIndex(stage => stage.node.instanceRef);
  const index = beforeId === null
    ? (lastPlugin === -1 ? (stages.at(-1).node.metadata?.lprepOutputBoundary ? stages.length - 1 : stages.length) : lastPlugin + 1)
    : stages.findIndex(stage => stage.node.instanceRef === beforeId);
  if (index < 0) throw new Error('Emplacement de dépôt introuvable.');
  stages.splice(index, 0, stage);
  rewritePath(session, chain, path, stages, idFactory);
}

export function insertStage(session, chain, node, ports, beforeId, idFactory) {
  insertPathStage(session, chain, { node, input: ports[0].portId, output: ports[1].portId }, beforeId, idFactory);
}

export function reorderPlugin(session, chain, instanceId, beforeId, idFactory) {
  const order = moveBefore(chain.pluginOrder, instanceId, beforeId);
  if (order.every((id, index) => id === chain.pluginOrder[index])) return;
  const path = pathData(session.audioGraph, chain);
  assertExclusivePath(session, chain, path);
  const byInstance = new Map(path.stages.map(stage => [stage.node.instanceRef, stage]));
  let index = 0;
  const stages = path.stages.map(stage => stage.node.instanceRef ? byInstance.get(order[index++]) : stage);
  rewritePath(session, chain, path, stages, idFactory);
}

function removeGraphNodes(session, removedNodes, protectedChains) {
  const graph = session.audioGraph;
  const portsToRemove = graph.ports.filter(port => removedNodes.has(port.nodeId));
  if (portsToRemove.some(port => port.hostBindingRef) ||
    graph.nodes.some(node => removedNodes.has(node.nodeId) && node.hostBindingRef)) {
    throw new Error('Un port ou un nœud reste rattaché à un hôte.');
  }
  const removedPorts = new Set(portsToRemove.map(port => port.portId));
  const protectedNodes = new Set(protectedChains.flatMap(chain => [
    ...pathNodeIds(pathData(graph, chain)),
    ...(chain.sidechainNodeRef ? [chain.sidechainNodeRef] : []),
    ...graph.nodes.filter(node => chain.presentationLinks.includes(node.instanceRef)).map(node => node.nodeId)
  ]));
  const protectedPorts = new Set(graph.ports.filter(port => protectedNodes.has(port.nodeId)).map(port => port.portId));
  for (const chain of protectedChains) {
    if ((chain.interfaces || []).some(face => removedPorts.has(face.internalPortRef))) {
      throw new Error('Une interface de chaîne dépend de ce port.');
    }
  }
  const incident = graph.connections.filter(edge => removedPorts.has(edge.sourcePortId) || removedPorts.has(edge.destinationPortId));
  if (incident.some(edge => protectedPorts.has(edge.sourcePortId) || protectedPorts.has(edge.destinationPortId) ||
    edge.hostBindingRef || edge.originAssignmentId)) {
    throw new Error('La suppression couperait une connexion utilisée par une chaîne, un patch ou un hôte.');
  }
  const incidentIds = new Set(incident.map(edge => edge.connectionId));
  graph.connections = graph.connections.filter(edge => !incidentIds.has(edge.connectionId));
  graph.ports = graph.ports.filter(port => !removedPorts.has(port.portId));
  graph.nodes = graph.nodes.filter(node => !removedNodes.has(node.nodeId));
}

function removeInstances(session, ids) {
  session.pluginInstances = session.pluginInstances.filter(instance => !ids.has(instance.instanceId));
  if (session.temporaryReplacements) {
    session.temporaryReplacements = session.temporaryReplacements.filter(entry => !ids.has(entry.originalInstanceId));
  }
}

function detachPathStage(session, chain, instanceId, idFactory) {
  const path = pathData(session.audioGraph, chain);
  assertExclusivePath(session, chain, path);
  const detached = path.stages.find(stage => stage.node.instanceRef === instanceId);
  if (!detached) throw new Error('Plugin introuvable dans le chemin de la chaîne source.');
  const stages = path.stages.filter(stage => stage !== detached);
  if (!stages.length) {
    const graph = session.audioGraph;
    const bus = createAudioNode({ nodeId: idFactory('node'), graphId: graph.graphId, type: 'bus', label: chain.name });
    const previous = path.stages[0];
    const ports = [previous.input, previous.output].map(id => {
      const { direction, role, mediaType, channelCount, channelLayout } = path.ports.get(id);
      return createAudioPort({ portId: idFactory('port'), nodeId: bus.nodeId, direction, role, mediaType, channelCount, channelLayout });
    });
    graph.nodes.push(bus);
    graph.ports.push(...ports);
    stages.push({ node: bus, input: ports[0].portId, output: ports[1].portId });
  }
  rewritePath(session, chain, path, stages, idFactory);
  return detached;
}

export function transferPlugin(session, source, target, instanceId, beforeId, idFactory) {
  if (beforeId !== null && !target.pluginOrder.includes(beforeId)) throw new Error('Emplacement de dépôt introuvable.');
  const graph = session.audioGraph;
  const node = graph.nodes.find(value => value.instanceRef === instanceId);
  const ports = graph.ports.filter(port => port.nodeId === node?.nodeId);
  if (node?.hostBindingRef || ports.some(port => port.hostBindingRef)) {
    throw new Error('Ce plugin ou un de ses ports reste rattaché à un hôte.');
  }
  const previousConnections = graph.connections.map(edge => ({ ...edge }));
  const detached = detachPathStage(session, source, instanceId, idFactory);
  const portIds = new Set(ports.map(port => port.portId));
  if ((source.interfaces || []).some(face => portIds.has(face.internalPortRef)) ||
    (session.patchAssignments || []).some(assignment => assignment.chainId === source.chainId &&
      assignment.targetPortRefs.some(id => portIds.has(id)))) {
    throw new Error('Une interface ou une affectation de la chaîne source reste liée à ce plugin.');
  }
  insertPathStage(session, target, detached, beforeId, idFactory);
  if (introducesAudioCycle(graph, previousConnections)) throw new Error('Ce déplacement créerait une boucle audio.');
}

export function removePlugin(session, chain, instanceId, idFactory) {
  if (!chain.pluginOrder.includes(instanceId)) {
    if (!chain.presentationLinks.includes(instanceId)) throw new Error('Plugin introuvable dans cette chaîne.');
    chain.presentationLinks = chain.presentationLinks.filter(id => id !== instanceId);
    return;
  }
  if (session.chains.some(other => other !== chain && other.presentationLinks.includes(instanceId))) {
    throw new Error('Ce plugin est aussi présenté dans une autre chaîne.');
  }
  const { node } = detachPathStage(session, chain, instanceId, idFactory);
  chain.presentationLinks = chain.presentationLinks.filter(id => id !== instanceId);
  removeGraphNodes(session, new Set([node.nodeId]), session.chains);
  removeInstances(session, new Set([instanceId]));
}

export function removeChain(session, chain) {
  const graph = session.audioGraph;
  const path = pathData(graph, chain);
  assertExclusivePath(session, chain, path);
  const others = session.chains.filter(other => other !== chain);
  const instances = new Set(chain.pluginOrder);
  if (others.some(other => other.presentationLinks.some(id => instances.has(id)))) {
    throw new Error('Une autre chaîne présente un plugin de cette chaîne.');
  }
  const assignments = new Set((session.patchAssignments || []).filter(value => value.chainId === chain.chainId)
    .map(value => value.assignmentId));
  const nodes = new Set([...pathNodeIds(path),
    ...graph.nodes.filter(node => assignments.has(node.metadata?.originAssignmentId)).map(node => node.nodeId)]);
  if (chain.sidechainNodeRef) nodes.add(chain.sidechainNodeRef);
  graph.connections = graph.connections.filter(edge => !assignments.has(edge.originAssignmentId));
  removeGraphNodes(session, nodes, others);
  removeInstances(session, instances);
  session.chains = others;
  session.chainOrder = session.chainOrder.filter(id => id !== chain.chainId);
  for (const group of session.compensationGroups) group.memberChainRefs = group.memberChainRefs.filter(id => id !== chain.chainId);
  if (session.patchAssignments) session.patchAssignments = session.patchAssignments.filter(value => !assignments.has(value.assignmentId));
  if (session.musicRouting) session.musicRouting.assignmentRefs = session.musicRouting.assignmentRefs.filter(id => !assignments.has(id));
}
