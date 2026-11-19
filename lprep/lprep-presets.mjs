import { createStableId, isStableId } from './lprep-identifiers.mjs';
import { hasUnresolvedVariant, validateProject } from './lprep-project.mjs';
import { ProjectTransaction } from './lprep-transactions.mjs';

const clone = value => structuredClone(value);
const err = (path, code, message, severity = 'error') => ({ severity, path, code, message });
const FORBIDDEN_KEYS = new Set(['opaqueStateRefs', 'hostBindingRef', 'externalResourceRef', 'externalResourceRefs',
  'installationRef', 'machineId', 'license', 'patchAssignments', 'reservations', 'musicRouting',
  'temporaryReplacements', 'originAssignmentId', 'artifactRef', 'rack2Ref', 'sessionId', 'graphId']);

function forbiddenData(value, path = 'preset', issues = []) {
  if (!value || typeof value !== 'object') return issues;
  for (const [key, child] of Object.entries(value)) {
    const at = `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(key)) issues.push(err(at, 'preset.forbidden-field', `Champ interdit dans un preset : ${key}`));
    if (key === 'extensions' && child && Object.keys(child).length) issues.push(err(at, 'preset.extensions', 'Les extensions opaques sont interdites dans un preset.'));
    forbiddenData(child, at, issues);
  }
  return issues;
}

function pinnedVariant(ref) {
  return ref && isStableId(ref.variantId) && ((Number.isInteger(ref.revision) && ref.revision > 0) || isStableId(ref.revision)) && ref.fallback;
}

export function validateChainPreset(preset, { path = 'preset' } = {}) {
  const issues = forbiddenData(preset, path);
  if (!isStableId(preset?.presetId)) issues.push(err(`${path}.presetId`, 'preset.id', 'Identifiant de preset requis.'));
  if (!Number.isInteger(preset?.revision) || preset.revision < 1) issues.push(err(`${path}.revision`, 'preset.revision', 'Révision positive requise.'));
  if (typeof preset?.name !== 'string' || !preset.name.trim()) issues.push(err(`${path}.name`, 'preset.name', 'Nom requis.'));
  if (preset?.structureVersion !== 1) issues.push(err(`${path}.structureVersion`, 'preset.structure-version', 'Version de structure inconnue.'));
  if (!['draft', 'valid'].includes(preset?.validationStatus)) issues.push(err(`${path}.validationStatus`, 'preset.validation-status', 'Statut invalide.'));
  const structure = preset?.structure;
  if (!structure || typeof structure !== 'object') return [...issues, err(`${path}.structure`, 'preset.structure', 'Structure requise.')];
  const instances = new Map(), nodes = new Map(), ports = new Map(), connections = new Map();
  for (const [index, instance] of (structure.instances || []).entries()) {
    if (!isStableId(instance?.instanceId) || instances.has(instance.instanceId)) issues.push(err(`${path}.structure.instances[${index}]`, 'preset.instance-id', 'Identifiant local unique requis.'));
    instances.set(instance?.instanceId, instance);
    if (!isStableId(instance?.catalogRef?.pluginId) || !instance.catalogRef.fallback) issues.push(err(`${path}.structure.instances[${index}].catalogRef`, 'preset.catalog-ref', 'Référence catalogue avec fallback requise.'));
    if (!hasUnresolvedVariant(instance) && !pinnedVariant(instance?.variantRef)) issues.push(err(`${path}.structure.instances[${index}].variantRef`, 'preset.variant-ref', 'Variante épinglée avec fallback requise.'));
  }
  for (const [index, node] of (structure.nodes || []).entries()) {
    if (!isStableId(node?.nodeId) || nodes.has(node.nodeId)) issues.push(err(`${path}.structure.nodes[${index}]`, 'preset.node-id', 'Identifiant local unique requis.'));
    nodes.set(node?.nodeId, node);
    if (node.type === 'plugin-instance' && !instances.has(node.instanceRef)) issues.push(err(`${path}.structure.nodes[${index}].instanceRef`, 'preset.node-instance', 'Instance locale introuvable.'));
  }
  for (const [index, port] of (structure.ports || []).entries()) {
    if (!isStableId(port?.portId) || ports.has(port.portId)) issues.push(err(`${path}.structure.ports[${index}]`, 'preset.port-id', 'Identifiant local unique requis.'));
    ports.set(port?.portId, port);
    if (!nodes.has(port?.nodeId)) issues.push(err(`${path}.structure.ports[${index}].nodeId`, 'preset.port-node', 'Nœud local introuvable.'));
  }
  for (const [index, connection] of (structure.connections || []).entries()) {
    if (!isStableId(connection?.connectionId) || connections.has(connection.connectionId)) issues.push(err(`${path}.structure.connections[${index}]`, 'preset.connection-id', 'Identifiant local unique requis.'));
    connections.set(connection?.connectionId, connection);
    if (!ports.has(connection?.sourcePortId) || !ports.has(connection?.destinationPortId)) issues.push(err(`${path}.structure.connections[${index}]`, 'preset.connection-port', 'Port interne introuvable.'));
  }
  const chain = structure.chain;
  if (chain?.sidechainNodeRef !== undefined) {
    const scPorts = [...ports.values()].filter(port => port.nodeId === chain.sidechainNodeRef);
    if (nodes.get(chain.sidechainNodeRef)?.type !== 'bus' || !scPorts.length ||
      scPorts.some(port => port.direction !== 'input' || port.role !== 'sidechain' || port.channelCount !== 1)) {
      issues.push(err(`${path}.structure.chain.sidechainNodeRef`, 'preset.sidechain-node', 'Bus SC local invalide.'));
    }
  }
  if (!chain || !Array.isArray(chain.pluginOrder) || chain.pluginOrder.some(id => !instances.has(id))) issues.push(err(`${path}.structure.chain.pluginOrder`, 'preset.plugin-order', 'Ordre local invalide.'));
  if ((chain?.presentationLinks || []).some(id => !instances.has(id))) issues.push(err(`${path}.structure.chain.presentationLinks`, 'preset.presentation-links', 'Lien de présentation local invalide.'));
  if (!ports.has(chain?.mainPath?.inputBoundaryPortRef) || !ports.has(chain?.mainPath?.outputBoundaryPortRef) ||
      (chain?.mainPath?.connectionRefs || []).some(id => !connections.has(id))) issues.push(err(`${path}.structure.chain.mainPath`, 'preset.main-path', 'Chemin principal invalide.'));
  for (const [index, face] of (structure.interfaces || []).entries()) {
    if (!isStableId(face?.interfaceId) || !ports.has(face?.internalPortRef) || !['incoming', 'outgoing'].includes(face?.direction)) issues.push(err(`${path}.structure.interfaces[${index}]`, 'preset.interface', 'Interface structurelle invalide.'));
  }
  return issues;
}

const sanitizeNode = node => ({ nodeId: node.nodeId, type: node.type, label: node.label || '', instanceRef: node.instanceRef || null,
  metadata: {}, extensions: {} });
const sanitizePort = port => ({ portId: port.portId, nodeId: port.nodeId, direction: port.direction, role: port.role,
  mediaType: port.mediaType, channelLayout: port.channelLayout, channelCount: port.channelCount, label: port.label || '',
  required: Boolean(port.required), fanInPolicy: port.fanInPolicy, extensions: {} });
const sanitizeConnection = connection => ({ connectionId: connection.connectionId, sourcePortId: connection.sourcePortId,
  destinationPortId: connection.destinationPortId, channelMap: clone(connection.channelMap), routingRole: connection.routingRole,
  gain: clone(connection.gain), polarity: connection.polarity, enabledState: connection.enabledState, provenance: null, extensions: {} });

export function createChainPresetFromSession(session, chainId, { presetId = createStableId('preset'), revision = 1,
  name, description = '', includePresentationInstanceIds = [], includeNodeIds = [] } = {}) {
  const chain = session?.chains?.find(value => value.chainId === chainId);
  if (!chain) return { status: 'error', diagnostics: [err('chainId', 'preset.chain-missing', 'Chaîne introuvable.')] };
  const memberIds = new Set([...chain.pluginOrder, ...includePresentationInstanceIds]);
  const instances = session.pluginInstances.filter(value => memberIds.has(value.instanceId)).map(value => ({
    instanceId: value.instanceId, catalogRef: clone(value.catalogRef), variantRef: clone(value.variantRef),
    displayName: value.displayName || '', resolutionStatus: value.resolutionStatus, metadata: {}, extensions: {}
  }));
  const nodeIds = new Set(session.audioGraph.nodes.filter(value =>
    value.type === 'plugin-instance' ? memberIds.has(value.instanceRef) : includeNodeIds.includes(value.nodeId)).map(value => value.nodeId));
  for (const boundaryRef of [chain.mainPath.inputBoundaryPortRef, chain.mainPath.outputBoundaryPortRef]) {
    const boundaryNodeId = session.audioGraph.ports.find(value => value.portId === boundaryRef)?.nodeId;
    if (boundaryNodeId) nodeIds.add(boundaryNodeId);
  }
  if (chain.sidechainNodeRef) nodeIds.add(chain.sidechainNodeRef);
  const nodes = session.audioGraph.nodes.filter(value => nodeIds.has(value.nodeId)).map(sanitizeNode);
  const ports = session.audioGraph.ports.filter(value => nodeIds.has(value.nodeId)).map(sanitizePort);
  const portIds = new Set(ports.map(value => value.portId));
  const internal = [], interfaces = [], diagnostics = [];
  for (const connection of session.audioGraph.connections) {
    const sourceInside = portIds.has(connection.sourcePortId), destinationInside = portIds.has(connection.destinationPortId);
    if (sourceInside && destinationInside) internal.push(sanitizeConnection(connection));
    else if (sourceInside !== destinationInside) {
      const internalPortRef = sourceInside ? connection.sourcePortId : connection.destinationPortId;
      interfaces.push({ interfaceId: `interface:${interfaces.length + 1}`, internalPortRef,
        direction: sourceInside ? 'outgoing' : 'incoming', routingRole: connection.routingRole,
        channelMap: clone(connection.channelMap), resolutionStatus: 'unresolved', label: connection.routingRole });
      if (connection.routingRole === 'sidechain') diagnostics.push(err(`connection:${connection.connectionId}`,
        'preset.external-sidechain', 'Sidechain externe conservé comme interface non résolue.', 'warning'));
    }
  }
  const structure = { chain: { name: chain.name, role: chain.role, audioFormat: chain.audioFormat, color: chain.color,
    ...(chain.sidechainNodeRef ? { sidechainNodeRef: chain.sidechainNodeRef } : {}),
    allocationEligibility: chain.allocationEligibility, pluginOrder: [...chain.pluginOrder],
    mainPath: clone(chain.mainPath), presentationLinks: chain.presentationLinks.filter(id => memberIds.has(id)) },
    instances, nodes, ports, connections: internal, interfaces };
  const preset = { presetId, revision, name: name || chain.name, description, structureVersion: 1, structure,
    metadata: { sourceChainName: chain.name }, validationStatus: 'valid' };
  const validation = validateChainPreset(preset);
  if (validation.some(value => value.severity === 'error')) return { status: 'invalid', diagnostics: [...diagnostics, ...validation] };
  return { status: 'created', preset, diagnostics };
}

export function preparePresetInsertion(project, sessionId, preset, { idFactory = kind => createStableId(kind),
  compensationGroupId = null } = {}) {
  const diagnostics = validateChainPreset(preset);
  if (diagnostics.some(value => value.severity === 'error')) return { status: 'invalid', diagnostics };
  const candidate = clone(project), session = candidate.sessions.find(value => value.sessionId === sessionId);
  if (!session) return { status: 'invalid', diagnostics: [err('sessionId', 'preset.target-session', 'Session cible introuvable.')] };
  if (compensationGroupId && !session.compensationGroups.some(value => value.compensationGroupId === compensationGroupId)) {
    return { status: 'invalid', diagnostics: [err('compensationGroupId', 'preset.compensation-group', 'Groupe cible introuvable.')] };
  }
  const ids = new Map(), used = new Set();
  const assign = (kind, oldId) => { const id = idFactory(kind, oldId); if (!isStableId(id) || used.has(id)) throw new Error(`Collision d’identifiant : ${id}`); used.add(id); ids.set(oldId, id); return id; };
  try {
    const structure = preset.structure;
    structure.instances.forEach(value => assign('instance', value.instanceId));
    structure.nodes.forEach(value => assign('node', value.nodeId));
    structure.ports.forEach(value => assign('port', value.portId));
    structure.connections.forEach(value => assign('connection', value.connectionId));
    const chainId = assign('chain', `chain:${preset.presetId}`);
    const instances = structure.instances.map(value => ({ ...clone(value), instanceId: ids.get(value.instanceId), sessionId,
      opaqueStateRefs: [], midiProfileRef: null }));
    const nodes = structure.nodes.map(value => ({ ...clone(value), nodeId: ids.get(value.nodeId), graphId: session.audioGraph.graphId,
      instanceRef: value.instanceRef ? ids.get(value.instanceRef) : null, externalResourceRef: null, externalResourceRefs: [], hostBindingRef: null }));
    const ports = structure.ports.map(value => ({ ...clone(value), portId: ids.get(value.portId), nodeId: ids.get(value.nodeId), hostBindingRef: null }));
    const connections = structure.connections.map(value => ({ ...clone(value), connectionId: ids.get(value.connectionId),
      graphId: session.audioGraph.graphId, sourcePortId: ids.get(value.sourcePortId), destinationPortId: ids.get(value.destinationPortId),
      originAssignmentId: null, hostBindingRef: null }));
    const chain = { chainId, sessionId, name: structure.chain.name, role: structure.chain.role,
      ...(structure.chain.sidechainNodeRef ? { sidechainNodeRef: ids.get(structure.chain.sidechainNodeRef) } : {}),
      audioFormat: structure.chain.audioFormat, color: structure.chain.color, compensationGroupId,
      pluginOrder: structure.chain.pluginOrder.map(id => ids.get(id)),
      mainPath: { inputBoundaryPortRef: ids.get(structure.chain.mainPath.inputBoundaryPortRef),
        outputBoundaryPortRef: ids.get(structure.chain.mainPath.outputBoundaryPortRef),
        connectionRefs: structure.chain.mainPath.connectionRefs.map(id => ids.get(id)) },
      presentationLinks: structure.chain.presentationLinks.map(id => ids.get(id)),
      interfaces: structure.interfaces.map(value => ({ ...clone(value), internalPortRef: ids.get(value.internalPortRef) })),
      allocationEligibility: structure.chain.allocationEligibility, metadata: { presetRef: { presetId: preset.presetId, revision: preset.revision } }, extensions: {} };
    session.pluginInstances.push(...instances); session.audioGraph.nodes.push(...nodes); session.audioGraph.ports.push(...ports);
    session.audioGraph.connections.push(...connections); session.chains.push(chain); session.chainOrder.push(chainId);
    const errors = validateProject(candidate).filter(value => value.severity === 'error');
    if (errors.length) return { status: 'invalid', diagnostics: errors };
    return { status: 'prepared', project: candidate, sessionId, chainId, createdIds: [...used], diagnostics: [] };
  } catch (cause) { return { status: 'invalid', diagnostics: [err('preset', 'preset.id-collision', cause.message)] }; }
}

export function createPresetInsertionTransaction(project, sessionId, preset, { baseRevisionId, transactionId,
  idFactory, compensationGroupId = null } = {}) {
  const prepared = preparePresetInsertion(project, sessionId, preset, { idFactory, compensationGroupId });
  if (prepared.status !== 'prepared') return prepared;
  return { status: 'prepared', insertion: prepared, transaction: new ProjectTransaction({ transactionId,
    baseRevisionId, description: `Insertion du preset ${preset.name}`, apply: () => clone(prepared.project) }) };
}

export class MemoryPresetStore {
  constructor() { this.records = new Map(); }
  save(preset) { const issues = validateChainPreset(preset); if (issues.some(value => value.severity === 'error')) return { status: 'invalid', diagnostics: issues };
    const key = `${preset.presetId}@${preset.revision}`; if (this.records.has(key)) return { status: 'conflict', diagnostics: [err(key, 'preset.revision-exists', 'Cette révision existe déjà.')] };
    this.records.set(key, clone(preset)); return { status: 'saved', key }; }
  load(presetId, revision) { const value = this.records.get(`${presetId}@${revision}`); return value ? clone(value) : null; }
  list() { return [...this.records.values()].map(clone); }
}
