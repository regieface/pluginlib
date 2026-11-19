import { createStableId, isStableId } from './lprep-identifiers.mjs';

export const AUDIO_NODE_TYPES = new Set([
  'audio-input', 'audio-output', 'plugin-instance', 'bus', 'split', 'merge', 'unresolved'
]);
export const PORT_DIRECTIONS = new Set(['input', 'output']);
export const PORT_ROLES = new Set(['main', 'sidechain', 'auxiliary', 'send', 'return', 'unknown']);
export const MEDIA_TYPES = new Set(['audio', 'midi', 'unknown']);
export const FAN_IN_POLICIES = new Set(['single', 'multiple', 'unknown']);
export const ROUTING_ROLES = new Set(['main', 'sidechain', 'secondary', 'auxiliary', 'unknown']);

export const CHAIN_FORMAT_PORTS = Object.freeze({
  mono: Object.freeze({ input: 1, output: 1 }),
  stereo: Object.freeze({ input: 2, output: 2 }),
  'mono-to-stereo': Object.freeze({ input: 1, output: 2 }),
  'stereo-to-mono': Object.freeze({ input: 2, output: 1 })
});

export const MAIN_AUDIO_FORMATS = new Set(['mono', 'stereo']);

export function chainFormatKey(inputFormat, outputFormat) {
  if (!MAIN_AUDIO_FORMATS.has(inputFormat) || !MAIN_AUDIO_FORMATS.has(outputFormat)) {
    throw new Error('Formats principaux de chaîne non pris en charge.');
  }
  if (inputFormat === outputFormat) return inputFormat;
  return `${inputFormat}-to-${outputFormat}`;
}

export function legacyChainFormats(audioFormat) {
  const ports = CHAIN_FORMAT_PORTS[audioFormat];
  if (!ports) throw new Error('Format historique de chaîne non pris en charge.');
  return {
    inputFormat: ports.input === 1 ? 'mono' : 'stereo',
    outputFormat: ports.output === 1 ? 'mono' : 'stereo'
  };
}

export function chainFormatPortProperties(formatOrChain, direction) {
  const format = typeof formatOrChain === 'string' ? formatOrChain :
    chainFormatKey(formatOrChain?.inputFormat, formatOrChain?.outputFormat);
  const channelCount = CHAIN_FORMAT_PORTS[format]?.[direction];
  if (!channelCount) throw new Error('Format de chaîne non pris en charge.');
  return { channelCount, channelLayout: channelCount === 1 ? 'mono' : 'stereo' };
}

const clone = value => structuredClone(value);

export function chainSidechainPorts(graph, chain) {
  return chain.sidechainNodeRef
    ? graph.ports.filter(port => port.nodeId === chain.sidechainNodeRef && port.direction === 'input' && port.role === 'sidechain')
    : [];
}

export function createAudioGraph({ graphId = createStableId('graph'), sessionId, sampleRate = null,
  nodes = [], ports = [], connections = [], externalBindings = [], extensions = {} } = {}) {
  return { graphId, sessionId, sampleRate, nodes: clone(nodes), ports: clone(ports),
    connections: clone(connections), externalBindings: clone(externalBindings), extensions: clone(extensions) };
}

export function createAudioNode({ nodeId = createStableId('node'), graphId, type, label = '',
  instanceRef = null, externalResourceRef = null, externalResourceRefs = [], hostBindingRef = null, metadata = {}, extensions = {} } = {}) {
  return { nodeId, graphId, type, label, instanceRef, externalResourceRef,
    externalResourceRefs: clone(externalResourceRefs), hostBindingRef,
    metadata: clone(metadata), extensions: clone(extensions) };
}

export function createAudioPort({ portId = createStableId('port'), nodeId, direction, role = 'unknown',
  mediaType = 'audio', channelLayout = 'unknown', channelCount = null, label = '', required = false,
  fanInPolicy = 'unknown', hostBindingRef = null, extensions = {} } = {}) {
  return { portId, nodeId, direction, role, mediaType, channelLayout, channelCount, label, required,
    fanInPolicy, hostBindingRef, extensions: clone(extensions) };
}

export function createAudioConnection({ connectionId = createStableId('connection'), graphId,
  sourcePortId, destinationPortId, channelMap = null, routingRole = 'unknown', gain = null,
  polarity = 'unknown', enabledState = 'unknown', provenance = null, originAssignmentId = null,
  hostBindingRef = null, extensions = {} } = {}) {
  return { connectionId, graphId, sourcePortId, destinationPortId, channelMap: clone(channelMap),
    routingRole, gain, polarity, enabledState, provenance: clone(provenance), originAssignmentId,
    hostBindingRef, extensions: clone(extensions) };
}

function issue(issues, path, code, message, severity = 'error') {
  issues.push({ severity, path, code, message });
}

function indexBy(items, key, issues, path) {
  const index = new Map();
  if (!Array.isArray(items)) {
    issue(issues, path, 'type.array', 'Un tableau est requis.');
    return index;
  }
  for (const [position, item] of items.entries()) {
    const id = item?.[key];
    if (!isStableId(id)) issue(issues, `${path}[${position}].${key}`, 'id.invalid', 'Identifiant requis.');
    else if (index.has(id)) issue(issues, `${path}[${position}].${key}`, 'id.duplicate', `Identifiant dupliqué : ${id}`);
    else index.set(id, item);
  }
  return index;
}

function validateChannelMap(connection, source, destination, issues, path) {
  if (connection.channelMap === null) return;
  if (!Array.isArray(connection.channelMap) || connection.channelMap.length === 0) {
    issue(issues, `${path}.channelMap`, 'channel-map.invalid', 'Le mapping doit être nul ou contenir des canaux explicites.');
    return;
  }
  const pairs = new Set();
  for (const [position, entry] of connection.channelMap.entries()) {
    const at = `${path}.channelMap[${position}]`;
    if (!Number.isInteger(entry?.sourceChannel) || entry.sourceChannel < 1 ||
        !Number.isInteger(entry?.destinationChannel) || entry.destinationChannel < 1) {
      issue(issues, at, 'channel-map.invalid-entry', 'Les numéros de canaux doivent être des entiers positifs.');
      continue;
    }
    const key = `${entry.sourceChannel}:${entry.destinationChannel}`;
    if (pairs.has(key)) issue(issues, at, 'channel-map.duplicate', 'Mapping de canal dupliqué.');
    pairs.add(key);
    if (Number.isInteger(source?.channelCount) && entry.sourceChannel > source.channelCount) {
      issue(issues, `${at}.sourceChannel`, 'channel-map.source-range', 'Canal source hors plage.');
    }
    if (Number.isInteger(destination?.channelCount) && entry.destinationChannel > destination.channelCount) {
      issue(issues, `${at}.destinationChannel`, 'channel-map.destination-range', 'Canal destination hors plage.');
    }
  }
}

function cycleNodes(nodes, connections, ports) {
  const edges = new Map(nodes.map(node => [node.nodeId, new Set()]));
  for (const connection of connections) {
    const source = ports.get(connection.sourcePortId)?.nodeId;
    const destination = ports.get(connection.destinationPortId)?.nodeId;
    if (source && destination && source !== destination) edges.get(source)?.add(destination);
  }
  const visiting = new Set(), visited = new Set();
  const visit = node => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of edges.get(node) || []) if (visit(next)) return true;
    visiting.delete(node); visited.add(node);
    return false;
  };
  return [...edges.keys()].some(visit);
}

export function validateAudioGraph(graph, { path = 'audioGraph', sessionId, instances = new Map() } = {}) {
  const issues = [];
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    issue(issues, path, 'graph.invalid', 'Un graphe audio est requis.');
    return { issues, indexes: { nodes: new Map(), ports: new Map(), connections: new Map() } };
  }
  if (!isStableId(graph.graphId)) issue(issues, `${path}.graphId`, 'id.invalid', 'Identifiant de graphe requis.');
  if (graph.sessionId !== sessionId) issue(issues, `${path}.sessionId`, 'graph.session', 'Le graphe doit appartenir à sa session.');
  if (graph.sampleRate !== null && (!Number.isFinite(graph.sampleRate) || graph.sampleRate <= 0)) {
    issue(issues, `${path}.sampleRate`, 'graph.sample-rate', 'La fréquence doit être positive ou inconnue.');
  }
  const nodes = indexBy(graph.nodes, 'nodeId', issues, `${path}.nodes`);
  const ports = indexBy(graph.ports, 'portId', issues, `${path}.ports`);
  const connections = indexBy(graph.connections, 'connectionId', issues, `${path}.connections`);
  const instanceNodes = new Map();

  for (const [position, node] of (graph.nodes || []).entries()) {
    const at = `${path}.nodes[${position}]`;
    if (node.graphId !== graph.graphId) issue(issues, `${at}.graphId`, 'node.graph', 'Le nœud doit appartenir au graphe.');
    if (!AUDIO_NODE_TYPES.has(node.type)) issue(issues, `${at}.type`, 'node.type', 'Type de nœud inconnu.');
    if (node.type === 'plugin-instance') {
      if (!isStableId(node.instanceRef) || !instances.has(node.instanceRef)) {
        issue(issues, `${at}.instanceRef`, 'node.instance', 'Instance de la session requise.');
      } else if (instanceNodes.has(node.instanceRef)) {
        issue(issues, `${at}.instanceRef`, 'node.instance-duplicate', 'Une instance possède déjà un nœud.');
      } else instanceNodes.set(node.instanceRef, node.nodeId);
      for (const key of ['catalogRef', 'variantRef', 'midiProfileRef', 'opaqueStateRefs']) {
        if (Object.hasOwn(node, key)) issue(issues, `${at}.${key}`, 'node.instance-duplication', 'Les données de l’instance restent dans PluginInstance.');
      }
    } else if (node.instanceRef !== null && node.instanceRef !== undefined) {
      issue(issues, `${at}.instanceRef`, 'node.unexpected-instance', 'Seul un nœud plugin-instance référence une instance.');
    }
  }
  for (const instanceId of instances.keys()) {
    if (!instanceNodes.has(instanceId)) issue(issues, `${path}.nodes`, 'node.instance-missing', `Aucun nœud pour l’instance ${instanceId}.`);
  }

  for (const [position, port] of (graph.ports || []).entries()) {
    const at = `${path}.ports[${position}]`;
    if (!nodes.has(port.nodeId)) issue(issues, `${at}.nodeId`, 'port.node', 'Nœud du port introuvable.');
    if (!PORT_DIRECTIONS.has(port.direction)) issue(issues, `${at}.direction`, 'port.direction', 'Direction de port invalide.');
    if (!PORT_ROLES.has(port.role)) issue(issues, `${at}.role`, 'port.role', 'Rôle de port invalide.');
    if (!MEDIA_TYPES.has(port.mediaType)) issue(issues, `${at}.mediaType`, 'port.media', 'Type de média invalide.');
    if (!FAN_IN_POLICIES.has(port.fanInPolicy)) issue(issues, `${at}.fanInPolicy`, 'port.fan-in', 'Politique de sommation invalide.');
    if (port.channelCount !== null && (!Number.isInteger(port.channelCount) || port.channelCount < 1)) {
      issue(issues, `${at}.channelCount`, 'port.channels', 'Le nombre de canaux doit être positif ou inconnu.');
    }
  }

  const incoming = new Map();
  for (const [position, connection] of (graph.connections || []).entries()) {
    const at = `${path}.connections[${position}]`;
    if (connection.graphId !== graph.graphId) issue(issues, `${at}.graphId`, 'connection.graph', 'La connexion doit appartenir au graphe.');
    const source = ports.get(connection.sourcePortId), destination = ports.get(connection.destinationPortId);
    if (!source) issue(issues, `${at}.sourcePortId`, 'connection.source', 'Port source introuvable.');
    else if (source.direction !== 'output') issue(issues, `${at}.sourcePortId`, 'connection.source-direction', 'Le port source doit être une sortie.');
    if (!destination) issue(issues, `${at}.destinationPortId`, 'connection.destination', 'Port destination introuvable.');
    else if (destination.direction !== 'input') issue(issues, `${at}.destinationPortId`, 'connection.destination-direction', 'Le port destination doit être une entrée.');
    if (source && destination && source.mediaType !== 'unknown' && destination.mediaType !== 'unknown' && source.mediaType !== destination.mediaType) {
      issue(issues, at, 'connection.media', 'Les types de média sont incompatibles.');
    }
    if (!ROUTING_ROLES.has(connection.routingRole)) issue(issues, `${at}.routingRole`, 'connection.role', 'Rôle de routing invalide.');
    if (connection.routingRole === 'sidechain' && destination?.role !== 'sidechain') {
      issue(issues, `${at}.destinationPortId`, 'connection.sidechain-port', 'Un sidechain doit viser un port sidechain.');
    }
    if (destination) {
      if (!incoming.has(destination.portId)) incoming.set(destination.portId, []);
      incoming.get(destination.portId).push(connection);
    }
    validateChannelMap(connection, source, destination, issues, at);
  }
  for (const [portId, edges] of incoming) {
    if (edges.length < 2 || ports.get(portId)?.fanInPolicy !== 'single') continue;
    const occupied = new Set();
    const overlaps = edges.some(edge => {
      if (!edge.channelMap?.length) return true;
      for (const { destinationChannel } of edge.channelMap) {
        if (occupied.has(destinationChannel)) return true;
      }
      for (const { destinationChannel } of edge.channelMap) occupied.add(destinationChannel);
      return false;
    });
    if (overlaps) {
      issue(issues, `${path}.ports`, 'port.fan-in-conflict', `Le port ${portId} refuse plusieurs sources.`);
    }
  }
  if (cycleNodes(graph.nodes || [], graph.connections || [], ports)) {
    issue(issues, `${path}.connections`, 'graph.cycle', 'Une boucle audio est conservée et doit être examinée.', 'warning');
  }
  return { issues, indexes: { nodes, ports, connections, instanceNodes } };
}

function reachable(startNodeId, targetNodeId, graph, ports, excludedConnectionId, mainOnly = true) {
  const edges = new Map();
  for (const connection of graph.connections) {
    if (connection.connectionId === excludedConnectionId || (mainOnly && connection.routingRole !== 'main')) continue;
    const source = ports.get(connection.sourcePortId)?.nodeId;
    const destination = ports.get(connection.destinationPortId)?.nodeId;
    if (source && destination) {
      if (!edges.has(source)) edges.set(source, new Set());
      edges.get(source).add(destination);
    }
  }
  const pending = [startNodeId], seen = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (current === targetNodeId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...(edges.get(current) || []));
  }
  return false;
}

export function introducesAudioCycle(graph, previousConnections) {
  const ports = new Map(graph.ports.map(port => [port.portId, port]));
  const endpoints = edge => [ports.get(edge.sourcePortId)?.nodeId, ports.get(edge.destinationPortId)?.nodeId];
  const previousPairs = new Set(previousConnections.map(edge => JSON.stringify(endpoints(edge))));
  return graph.connections.some(edge => {
    const [source, destination] = endpoints(edge);
    return source && destination && source !== destination &&
      !previousPairs.has(JSON.stringify([source, destination])) &&
      reachable(destination, source, graph, ports, edge.connectionId, false);
  });
}

export function validateChainMainPath(chain, graph, indexes, instances, path) {
  const issues = [];
  const mainPath = chain.mainPath;
  if (!mainPath || typeof mainPath !== 'object' || Array.isArray(mainPath)) {
    issue(issues, `${path}.mainPath`, 'chain.main-path', 'Un chemin principal est requis.');
    return issues;
  }
  const input = indexes.ports.get(mainPath.inputBoundaryPortRef);
  const output = indexes.ports.get(mainPath.outputBoundaryPortRef);
  if (!input || input.direction !== 'input') issue(issues, `${path}.mainPath.inputBoundaryPortRef`, 'chain.input-boundary', 'Limite d’entrée invalide.');
  if (!output || output.direction !== 'output') issue(issues, `${path}.mainPath.outputBoundaryPortRef`, 'chain.output-boundary', 'Limite de sortie invalide.');
  if (!Array.isArray(mainPath.connectionRefs)) {
    issue(issues, `${path}.mainPath.connectionRefs`, 'chain.connection-refs', 'Une liste ordonnée est requise.');
    return issues;
  }
  const seenConnections = new Set();
  const traversedInstances = [];
  let currentNodeId = input?.nodeId;
  const appendInstance = nodeId => {
    const instanceRef = indexes.nodes.get(nodeId)?.instanceRef;
    if (instanceRef) traversedInstances.push(instanceRef);
  };
  if (currentNodeId) appendInstance(currentNodeId);
  for (const [position, connectionId] of mainPath.connectionRefs.entries()) {
    const at = `${path}.mainPath.connectionRefs[${position}]`;
    const connection = indexes.connections.get(connectionId);
    if (!connection) { issue(issues, at, 'chain.connection-missing', 'Connexion du chemin introuvable.'); continue; }
    if (seenConnections.has(connectionId)) issue(issues, at, 'chain.connection-duplicate', 'Connexion répétée dans le chemin.');
    seenConnections.add(connectionId);
    if (connection.routingRole !== 'main') issue(issues, at, 'chain.connection-role', 'Le chemin principal accepte uniquement les connexions main.');
    const sourceNodeId = indexes.ports.get(connection.sourcePortId)?.nodeId;
    const destinationNodeId = indexes.ports.get(connection.destinationPortId)?.nodeId;
    if (currentNodeId && sourceNodeId !== currentNodeId) issue(issues, at, 'chain.path-discontinuity', 'Le chemin principal n’est pas continu.');
    currentNodeId = destinationNodeId;
    if (currentNodeId) appendInstance(currentNodeId);
  }
  if (output && currentNodeId && output.nodeId !== currentNodeId) {
    issue(issues, `${path}.mainPath.outputBoundaryPortRef`, 'chain.output-discontinuity', 'La limite de sortie ne termine pas le chemin déclaré.');
  }
  if (JSON.stringify(traversedInstances) !== JSON.stringify(chain.pluginOrder || [])) {
    issue(issues, `${path}.pluginOrder`, 'chain.plugin-order', 'L’ordre déclaré ne correspond pas aux instances traversées.');
  }
  if (input && output) {
    const pathNodes = new Set([input.nodeId, output.nodeId]);
    for (const id of mainPath.connectionRefs) {
      const connection = indexes.connections.get(id);
      if (connection) {
        pathNodes.add(indexes.ports.get(connection.sourcePortId)?.nodeId);
        pathNodes.add(indexes.ports.get(connection.destinationPortId)?.nodeId);
      }
    }
    for (const connection of graph.connections) {
      if (seenConnections.has(connection.connectionId) || connection.routingRole !== 'main') continue;
      const sourceNodeId = indexes.ports.get(connection.sourcePortId)?.nodeId;
      const destinationNodeId = indexes.ports.get(connection.destinationPortId)?.nodeId;
      if (pathNodes.has(sourceNodeId) && reachable(destinationNodeId, output.nodeId, graph, indexes.ports, connection.connectionId)) {
        issue(issues, `${path}.mainPath`, 'chain.path-ambiguous', 'Un autre trajet principal rejoint la limite de sortie.');
        break;
      }
    }
  }
  for (const instanceId of chain.pluginOrder || []) {
    if (!instances.has(instanceId)) issue(issues, `${path}.pluginOrder`, 'chain.instance-missing', `Instance introuvable : ${instanceId}`);
  }
  return issues;
}
