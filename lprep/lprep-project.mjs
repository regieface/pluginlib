import { createStableId, isStableId } from './lprep-identifiers.mjs';
import { createAudioGraph, validateAudioGraph, validateChainMainPath } from './lprep-audio-graph.mjs';
import { freezeEnvironmentSnapshot, validateSessionEnvironment } from './lprep-environment.mjs';
import { validatePatchState } from './lprep-patch.mjs';
import { validateTemporaryReplacements } from './lprep-replacements.mjs';

export const L_PREP_SCHEMA_VERSION = 1;
export const CHAIN_ROLES = new Set(['insert', 'fx', 'monitoring']);
export const AUDIO_FORMATS = new Set(['mono', 'stereo', 'multichannel', 'unknown']);

export function hasUnresolvedVariant(instance) {
  return instance?.resolutionStatus === 'unresolved' && instance.variantRef === null;
}

const clone = value => structuredClone(value);

export function createProject({ projectId = createStableId('project'), name, metadata = {}, sessions = [],
  projectPreferences = {}, sourceTemplateRef = null, extensions = {} } = {}) {
  return { schemaVersion: L_PREP_SCHEMA_VERSION, projectId, name, metadata: clone(metadata),
    sessions: clone(sessions), projectPreferences: clone(projectPreferences), sourceTemplateRef: clone(sourceTemplateRef),
    extensions: clone(extensions) };
}

export function createSession({ sessionId = createStableId('session'), projectId, name, metadata = {},
  targetMachineRef = null, pluginInstances = [], audioGraph, chains = [], chainOrder = [],
  compensationGroups = [], environmentSourceRef, environmentSnapshot, environmentConfiguration,
  patchAssignments = [], musicRouting, temporaryReplacements = [], extensions = {} } = {}) {
  const result = { sessionId, projectId, name, metadata: clone(metadata), targetMachineRef: clone(targetMachineRef),
    pluginInstances: clone(pluginInstances), audioGraph: audioGraph ? clone(audioGraph) : createAudioGraph({ sessionId }),
    chains: clone(chains), chainOrder: clone(chainOrder), compensationGroups: clone(compensationGroups),
    extensions: clone(extensions) };
  if (environmentSourceRef !== undefined) result.environmentSourceRef = clone(environmentSourceRef);
  if (environmentSnapshot !== undefined) result.environmentSnapshot = freezeEnvironmentSnapshot(clone(environmentSnapshot));
  if (environmentConfiguration !== undefined) result.environmentConfiguration = clone(environmentConfiguration);
  if (environmentSourceRef !== undefined) result.patchAssignments = clone(patchAssignments);
  if (musicRouting !== undefined) result.musicRouting = clone(musicRouting);
  result.temporaryReplacements = clone(temporaryReplacements);
  return result;
}

export function createPluginInstance({ instanceId = createStableId('instance'), sessionId, catalogRef,
  variantRef, displayName = '', resolutionStatus = 'resolved', midiProfileRef = null, opaqueStateRefs = [],
  metadata = {}, extensions = {} } = {}) {
  return { instanceId, sessionId, catalogRef: clone(catalogRef), variantRef: clone(variantRef), displayName,
    resolutionStatus, midiProfileRef: clone(midiProfileRef), opaqueStateRefs: clone(opaqueStateRefs),
    metadata: clone(metadata), extensions: clone(extensions) };
}

export function createChain({ chainId = createStableId('chain'), sessionId, name, role, audioFormat = 'unknown',
  color = null, compensationGroupId = null, pluginOrder = [], mainPath, presentationLinks = [],
  interfaces = [], allocationEligibility = true, metadata = {}, extensions = {} } = {}) {
  return { chainId, sessionId, name, role, audioFormat, color, compensationGroupId,
    pluginOrder: clone(pluginOrder), mainPath: clone(mainPath), presentationLinks: clone(presentationLinks), interfaces: clone(interfaces),
    allocationEligibility, metadata: clone(metadata), extensions: clone(extensions) };
}

export function createCompensationGroup({ compensationGroupId = createStableId('compensation-group'),
  sessionId, name, memberChainRefs = [], policy = 'declarative', metadata = {}, extensions = {} } = {}) {
  return { compensationGroupId, sessionId, name, memberChainRefs: clone(memberChainRefs), policy,
    metadata: clone(metadata), extensions: clone(extensions) };
}

export { virtualResourceId } from './lprep-environment.mjs';

function issue(issues, path, code, message, severity = 'error') {
  issues.push({ severity, path, code, message });
}

function array(value, issues, path) {
  if (Array.isArray(value)) return value;
  issue(issues, path, 'type.array', 'Un tableau est requis.');
  return [];
}

function object(value, issues, path) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  issue(issues, path, 'type.object', 'Un objet est requis.');
  return {};
}

function uniqueIndex(items, key, issues, path) {
  const result = new Map();
  for (const [position, item] of items.entries()) {
    const id = item?.[key];
    if (!isStableId(id)) issue(issues, `${path}[${position}].${key}`, 'id.invalid', 'Identifiant requis.');
    else if (result.has(id)) issue(issues, `${path}[${position}].${key}`, 'id.duplicate', `Identifiant dupliqué : ${id}`);
    else result.set(id, item);
  }
  return result;
}

function registerGlobal(registry, id, path, issues) {
  if (!isStableId(id)) return;
  if (registry.has(id)) issue(issues, path, 'id.global-duplicate', `Identifiant déjà utilisé dans le projet : ${id}`);
  else registry.set(id, path);
}

function validateSharedRef(ref, path, issues, key, { pinned = false, fallbackFields = [] } = {}) {
  const value = object(ref, issues, path);
  if (!isStableId(value[key])) issue(issues, `${path}.${key}`, 'reference.id', 'Identifiant de ressource partagée requis.');
  if (!value.fallback || typeof value.fallback !== 'object' || Array.isArray(value.fallback)) {
    issue(issues, `${path}.fallback`, 'reference.fallback', 'Informations de secours requises.');
  } else {
    for (const field of fallbackFields) {
      if (typeof value.fallback[field] !== 'string' || !value.fallback[field].trim()) {
        issue(issues, `${path}.fallback.${field}`, 'reference.fallback-field', 'Information de secours requise.');
      }
    }
  }
  if (pinned && !((Number.isInteger(value.revision) && value.revision > 0) || isStableId(value.revision))) {
    issue(issues, `${path}.revision`, 'reference.revision', 'Révision épinglée requise.');
  }
}

function validateOperationalResourceRef(value, sessionId, expectedDirection, path, issues) {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string') {
    issue(issues, path, 'resource-ref.type', 'La ressource virtuelle doit utiliser un identifiant qualifié.');
    return;
  }
  const match = /^(.+)\/(virtual-input|virtual-output):(\d+)$/.exec(value);
  if (!match || match[1] !== sessionId || Number(match[3]) < 1) {
    issue(issues, path, 'resource-ref.session', 'La ressource virtuelle doit être qualifiée par sa session.');
  } else if (expectedDirection && match[2] !== expectedDirection) {
    issue(issues, path, 'resource-ref.direction', 'La direction de la ressource virtuelle ne correspond pas au nœud.');
  }
}

function validateSession(session, projectId, path, registry) {
  const issues = [];
  const sessionValue = object(session, issues, path);
  if (!isStableId(sessionValue.sessionId)) issue(issues, `${path}.sessionId`, 'id.invalid', 'Identifiant de session requis.');
  registerGlobal(registry, sessionValue.sessionId, `${path}.sessionId`, issues);
  if (sessionValue.projectId !== projectId) issue(issues, `${path}.projectId`, 'session.project', 'La session doit référencer son projet conteneur.');
  if (typeof sessionValue.name !== 'string' || !sessionValue.name.trim()) issue(issues, `${path}.name`, 'session.name', 'Nom de session requis.');
  if (sessionValue.targetMachineRef !== null && sessionValue.targetMachineRef !== undefined) {
    validateSharedRef(sessionValue.targetMachineRef, `${path}.targetMachineRef`, issues, 'machineId',
      { fallbackFields: ['name'] });
  }

  const instanceList = array(sessionValue.pluginInstances, issues, `${path}.pluginInstances`);
  const instances = uniqueIndex(instanceList, 'instanceId', issues, `${path}.pluginInstances`);
  for (const [position, instance] of instanceList.entries()) {
    const at = `${path}.pluginInstances[${position}]`;
    registerGlobal(registry, instance?.instanceId, `${at}.instanceId`, issues);
    if (instance?.sessionId !== sessionValue.sessionId) issue(issues, `${at}.sessionId`, 'instance.session', 'L’instance doit appartenir à sa session.');
    validateSharedRef(instance?.catalogRef, `${at}.catalogRef`, issues, 'pluginId',
      { fallbackFields: ['name', 'vendor'] });
    if (!hasUnresolvedVariant(instance)) {
      validateSharedRef(instance?.variantRef, `${at}.variantRef`, issues, 'variantId',
        { pinned: true, fallbackFields: ['name'] });
    }
    if (instance?.midiProfileRef !== null && instance?.midiProfileRef !== undefined) {
      validateSharedRef(instance.midiProfileRef, `${at}.midiProfileRef`, issues, 'profileId',
        { pinned: true, fallbackFields: ['name'] });
    }
    if (!Array.isArray(instance?.opaqueStateRefs)) issue(issues, `${at}.opaqueStateRefs`, 'instance.opaque', 'Un tableau est requis.');
  }

  const graphResult = validateAudioGraph(sessionValue.audioGraph, {
    path: `${path}.audioGraph`, sessionId: sessionValue.sessionId, instances
  });
  issues.push(...graphResult.issues);
  registerGlobal(registry, sessionValue.audioGraph?.graphId, `${path}.audioGraph.graphId`, issues);
  for (const [position, node] of (sessionValue.audioGraph?.nodes || []).entries()) {
    registerGlobal(registry, node?.nodeId, `${path}.audioGraph.nodes[${position}].nodeId`, issues);
    const expectedDirection = node?.type === 'audio-input' ? 'virtual-input' :
      node?.type === 'audio-output' ? 'virtual-output' : null;
    validateOperationalResourceRef(node?.externalResourceRef, sessionValue.sessionId, expectedDirection,
      `${path}.audioGraph.nodes[${position}].externalResourceRef`, issues);
    for (const [resourcePosition, ref] of (node?.externalResourceRefs || []).entries()) {
      validateOperationalResourceRef(ref, sessionValue.sessionId, expectedDirection,
        `${path}.audioGraph.nodes[${position}].externalResourceRefs[${resourcePosition}]`, issues);
    }
    if (node?.externalResourceRefs?.length && !expectedDirection) {
      issue(issues, `${path}.audioGraph.nodes[${position}].externalResourceRefs`, 'resource-ref.node-type',
        'Seul un nœud audio-input ou audio-output référence des ressources virtuelles.');
    }
    if (node?.externalResourceRef && node?.externalResourceRefs?.length) {
      issue(issues, `${path}.audioGraph.nodes[${position}]`, 'resource-ref.ambiguous',
        'Utiliser une référence unique ou une liste, pas les deux.');
    }
    if (node?.externalResourceRef && !expectedDirection) {
      issue(issues, `${path}.audioGraph.nodes[${position}].externalResourceRef`, 'resource-ref.node-type',
        'Seul un nœud audio-input ou audio-output référence une ressource virtuelle.');
    }
  }
  for (const [position, port] of (sessionValue.audioGraph?.ports || []).entries()) {
    registerGlobal(registry, port?.portId, `${path}.audioGraph.ports[${position}].portId`, issues);
  }
  for (const [position, connection] of (sessionValue.audioGraph?.connections || []).entries()) {
    registerGlobal(registry, connection?.connectionId, `${path}.audioGraph.connections[${position}].connectionId`, issues);
  }

  const chainList = array(sessionValue.chains, issues, `${path}.chains`);
  const chains = uniqueIndex(chainList, 'chainId', issues, `${path}.chains`);
  const membership = new Map();
  const sidechainNodes = new Set();
  const mainPathNodes = new Set();
  for (const [position, chain] of chainList.entries()) {
    const at = `${path}.chains[${position}]`;
    registerGlobal(registry, chain?.chainId, `${at}.chainId`, issues);
    if (chain?.sessionId !== sessionValue.sessionId) issue(issues, `${at}.sessionId`, 'chain.session', 'La chaîne doit appartenir à sa session.');
    if (typeof chain?.name !== 'string' || !chain.name.trim()) issue(issues, `${at}.name`, 'chain.name', 'Nom de chaîne requis.');
    if (!CHAIN_ROLES.has(chain?.role)) issue(issues, `${at}.role`, 'chain.role', 'Rôle de chaîne invalide.');
    if (!AUDIO_FORMATS.has(chain?.audioFormat)) issue(issues, `${at}.audioFormat`, 'chain.audio-format', 'Format audio invalide.');
    const pluginOrder = array(chain?.pluginOrder, issues, `${at}.pluginOrder`);
    const local = new Set();
    for (const instanceId of pluginOrder) {
      if (local.has(instanceId)) issue(issues, `${at}.pluginOrder`, 'chain.instance-duplicate', 'Une instance est répétée dans la chaîne.');
      local.add(instanceId);
      if (membership.has(instanceId)) issue(issues, `${at}.pluginOrder`, 'chain.instance-membership', `L’instance appartient déjà à ${membership.get(instanceId)}.`);
      else membership.set(instanceId, chain.chainId);
    }
    for (const instanceId of array(chain?.presentationLinks, issues, `${at}.presentationLinks`)) {
      if (!instances.has(instanceId)) issue(issues, `${at}.presentationLinks`, 'chain.presentation-instance', `Instance de présentation introuvable : ${instanceId}`);
    }
    issues.push(...validateChainMainPath(chain, sessionValue.audioGraph, graphResult.indexes, instances, at));
    const mainPath = chain?.mainPath;
    for (const ref of [mainPath?.inputBoundaryPortRef, mainPath?.outputBoundaryPortRef]) {
      mainPathNodes.add(graphResult.indexes.ports.get(ref)?.nodeId);
    }
    for (const ref of Array.isArray(mainPath?.connectionRefs) ? mainPath.connectionRefs : []) {
      const edge = graphResult.indexes.connections.get(ref);
      mainPathNodes.add(graphResult.indexes.ports.get(edge?.sourcePortId)?.nodeId);
      mainPathNodes.add(graphResult.indexes.ports.get(edge?.destinationPortId)?.nodeId);
    }
    if (chain?.sidechainNodeRef !== undefined) {
      const id = chain.sidechainNodeRef;
      const node = graphResult.indexes.nodes.get(id);
      const ports = [...graphResult.indexes.ports.values()].filter(port => port.nodeId === id);
      if (node?.type !== 'bus' || !ports.length ||
        ports.some(port => port.direction !== 'input' || port.role !== 'sidechain' || port.channelCount !== 1) ||
        sidechainNodes.has(id)) {
        issue(issues, `${at}.sidechainNodeRef`, 'chain.sidechain-node', 'Bus SC dédié avec entrées mono requis.');
      }
      sidechainNodes.add(id);
    }
  }
  if ([...sidechainNodes].some(id => mainPathNodes.has(id))) {
    issue(issues, `${path}.chains`, 'chain.sidechain-path', 'Un bus SC dédié ne peut pas faire partie d’un chemin principal.');
  }

  const chainOrder = array(sessionValue.chainOrder, issues, `${path}.chainOrder`);
  if (chainOrder.length !== chains.size || new Set(chainOrder).size !== chainOrder.length || chainOrder.some(id => !chains.has(id))) {
    issue(issues, `${path}.chainOrder`, 'chain.order', 'chainOrder doit contenir chaque chaîne exactement une fois.');
  }

  const groupList = array(sessionValue.compensationGroups, issues, `${path}.compensationGroups`);
  const groups = uniqueIndex(groupList, 'compensationGroupId', issues, `${path}.compensationGroups`);
  for (const [position, group] of groupList.entries()) {
    const at = `${path}.compensationGroups[${position}]`;
    registerGlobal(registry, group?.compensationGroupId, `${at}.compensationGroupId`, issues);
    if (group?.sessionId !== sessionValue.sessionId) issue(issues, `${at}.sessionId`, 'compensation.session', 'Le groupe doit appartenir à sa session.');
    const members = array(group?.memberChainRefs, issues, `${at}.memberChainRefs`);
    if (new Set(members).size !== members.length) issue(issues, `${at}.memberChainRefs`, 'compensation.duplicate', 'Chaîne répétée dans le groupe.');
    for (const chainId of members) {
      const chain = chains.get(chainId);
      if (!chain) issue(issues, `${at}.memberChainRefs`, 'compensation.chain', `Chaîne introuvable : ${chainId}`);
      else if (chain.compensationGroupId !== group.compensationGroupId) {
        issue(issues, `${at}.memberChainRefs`, 'compensation.bidirectional', 'La chaîne ne référence pas ce groupe.');
      }
    }
  }
  for (const [position, chain] of chainList.entries()) {
    if (chain.compensationGroupId === null || chain.compensationGroupId === undefined) continue;
    const group = groups.get(chain.compensationGroupId);
    if (!group) issue(issues, `${path}.chains[${position}].compensationGroupId`, 'chain.compensation-group', 'Groupe introuvable.');
    else if (!group.memberChainRefs.includes(chain.chainId)) {
      issue(issues, `${path}.chains[${position}].compensationGroupId`, 'compensation.bidirectional', 'Le groupe ne référence pas la chaîne.');
    }
  }
  issues.push(...validateSessionEnvironment(sessionValue, { path }));
  issues.push(...validatePatchState(sessionValue, { path }));
  issues.push(...validateTemporaryReplacements(sessionValue, { path }));
  return issues;
}

export function validateProject(project) {
  const issues = [];
  const value = object(project, issues, 'project');
  if (value.schemaVersion !== L_PREP_SCHEMA_VERSION) issue(issues, 'project.schemaVersion', 'schema.version', 'Version de schéma non prise en charge.');
  if (!isStableId(value.projectId)) issue(issues, 'project.projectId', 'id.invalid', 'Identifiant de projet requis.');
  if (typeof value.name !== 'string' || !value.name.trim()) issue(issues, 'project.name', 'project.name', 'Nom de projet requis.');
  const registry = new Map();
  registerGlobal(registry, value.projectId, 'project.projectId', issues);
  const sessions = array(value.sessions, issues, 'project.sessions');
  if (sessions.length === 0) issue(issues, 'project.sessions', 'project.sessions-empty', 'Le projet doit contenir au moins une session.');
  for (const [position, session] of sessions.entries()) {
    issues.push(...validateSession(session, value.projectId, `project.sessions[${position}]`, registry));
  }
  return issues;
}

function remapVirtualResource(value, oldSessionId, newSessionId) {
  if (typeof value !== 'string') return value;
  const prefix = `${oldSessionId}/`;
  return value.startsWith(prefix) ? `${newSessionId}/${value.slice(prefix.length)}` : value;
}

export function duplicateSession(session, { projectId = session?.projectId, name = `${session?.name || 'Session'} — copie`,
  idFactory = kind => createStableId(kind), diagnostics = [] } = {}) {
  const source = clone(session);
  if (source.extensions && Object.keys(source.extensions).length) diagnostics.push({ severity: 'warning',
    code: 'duplication.extensions-opaque', message: 'Les extensions opaques sont conservées sans remappage garanti.' });
  const ids = new Map();
  const generated = new Set();
  const assign = (kind, oldId) => {
    const next = idFactory(kind, oldId);
    if (!isStableId(next)) throw new TypeError(`Identifiant dupliqué invalide pour ${kind}.`);
    if (generated.has(next)) throw new TypeError(`Identifiant généré plusieurs fois : ${next}`);
    generated.add(next);
    ids.set(oldId, next);
    return next;
  };
  const oldSessionId = source.sessionId;
  source.sessionId = assign('session', source.sessionId);
  source.projectId = projectId;
  source.name = name;

  for (const instance of source.pluginInstances) {
    instance.instanceId = assign('instance', instance.instanceId);
    instance.sessionId = source.sessionId;
  }
  source.audioGraph.graphId = assign('graph', source.audioGraph.graphId);
  source.audioGraph.sessionId = source.sessionId;
  for (const node of source.audioGraph.nodes) node.nodeId = assign('node', node.nodeId);
  for (const port of source.audioGraph.ports) port.portId = assign('port', port.portId);
  for (const connection of source.audioGraph.connections) connection.connectionId = assign('connection', connection.connectionId);
  for (const chain of source.chains) chain.chainId = assign('chain', chain.chainId);
  for (const group of source.compensationGroups) {
    group.compensationGroupId = assign('compensation-group', group.compensationGroupId);
  }
  for (const assignment of source.patchAssignments || []) assignment.assignmentId = assign('assignment', assignment.assignmentId);
  for (const replacement of source.temporaryReplacements || []) replacement.replacementId = assign('replacement', replacement.replacementId);

  for (const node of source.audioGraph.nodes) {
    node.graphId = source.audioGraph.graphId;
    if (node.instanceRef) node.instanceRef = ids.get(node.instanceRef);
    node.externalResourceRef = remapVirtualResource(node.externalResourceRef, oldSessionId, source.sessionId);
    node.externalResourceRefs = (node.externalResourceRefs || []).map(ref => remapVirtualResource(ref, oldSessionId, source.sessionId));
  }
  for (const port of source.audioGraph.ports) port.nodeId = ids.get(port.nodeId);
  for (const connection of source.audioGraph.connections) {
    connection.graphId = source.audioGraph.graphId;
    connection.sourcePortId = ids.get(connection.sourcePortId);
    connection.destinationPortId = ids.get(connection.destinationPortId);
    if (connection.originAssignmentId) connection.originAssignmentId = ids.get(connection.originAssignmentId);
  }
  for (const chain of source.chains) {
    chain.sessionId = source.sessionId;
    chain.pluginOrder = chain.pluginOrder.map(id => ids.get(id));
    chain.presentationLinks = chain.presentationLinks.map(id => ids.get(id));
    if (chain.sidechainNodeRef !== undefined) chain.sidechainNodeRef = ids.get(chain.sidechainNodeRef);
    chain.interfaces = (chain.interfaces || []).map(value => ({ ...value,
      internalPortRef: ids.get(value.internalPortRef) || value.internalPortRef }));
    chain.compensationGroupId = chain.compensationGroupId ? ids.get(chain.compensationGroupId) : null;
    chain.mainPath.inputBoundaryPortRef = ids.get(chain.mainPath.inputBoundaryPortRef);
    chain.mainPath.outputBoundaryPortRef = ids.get(chain.mainPath.outputBoundaryPortRef);
    chain.mainPath.connectionRefs = chain.mainPath.connectionRefs.map(id => ids.get(id));
  }
  source.chainOrder = source.chainOrder.map(id => ids.get(id));
  for (const group of source.compensationGroups) {
    group.sessionId = source.sessionId;
    group.memberChainRefs = group.memberChainRefs.map(id => ids.get(id));
  }
  for (const field of ['environmentSnapshot', 'environmentConfiguration']) {
    const environment = source[field];
    if (!environment) continue;
    for (const resource of environment.virtualResources || []) {
      resource.sessionId = source.sessionId;
      resource.resourceId = remapVirtualResource(resource.resourceId, oldSessionId, source.sessionId);
    }
    for (const reservation of environment.reservations || []) {
      reservation.sessionId = source.sessionId;
      reservation.reservationId = `${reservation.reservationId}`.replace(oldSessionId, source.sessionId);
      reservation.resourceRefs = reservation.resourceRefs.map(ref => remapVirtualResource(ref, oldSessionId, source.sessionId));
    }
  }
  for (const assignment of source.patchAssignments || []) {
    assignment.sessionId = source.sessionId;
    assignment.chainId = ids.get(assignment.chainId);
    assignment.resourceRefs = assignment.resourceRefs.map(ref => remapVirtualResource(ref, oldSessionId, source.sessionId));
    assignment.targetPortRefs = assignment.targetPortRefs.map(ref => ids.get(ref));
    assignment.connectionRefs = assignment.connectionRefs.map(ref => ids.get(ref));
  }
  if (source.musicRouting) source.musicRouting.assignmentRefs = source.musicRouting.assignmentRefs.map(ref => ids.get(ref));
  for (const replacement of source.temporaryReplacements || []) {
    replacement.sessionId = source.sessionId;
    replacement.originalInstanceId = ids.get(replacement.originalInstanceId);
  }
  if (source.environmentSnapshot) source.environmentSnapshot = freezeEnvironmentSnapshot(source.environmentSnapshot);
  return source;
}
