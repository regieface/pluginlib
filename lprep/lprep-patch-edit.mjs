import { chainSidechainPorts, createAudioConnection, createAudioNode, createAudioPort, introducesAudioCycle } from './lprep-audio-graph.mjs';
import { createPatchAssignment, virtualChannelRefs } from './lprep-patch.mjs';

export function virtualPatchOptions(session, direction) {
  const graph = session.audioGraph;
  const ports = new Map(graph.ports.map(port => [port.portId, port]));
  const nodes = new Map(graph.nodes.map(node => [node.nodeId, node]));
  const input = direction === 'input';
  const reserved = new Set((session.environmentConfiguration?.reservations || []).filter(item => item.exclusive)
    .flatMap(item => item.resourceRefs));
  const assignments = session.patchAssignments || [];
  return (session.environmentConfiguration?.virtualResources || []).filter(resource => resource.direction === `virtual-${direction}`)
    .map(resource => {
      const owners = assignments.filter(item => item.resourceRefs.includes(resource.resourceId));
      const edges = graph.connections.filter(edge => {
        const port = ports.get(input ? edge.sourcePortId : edge.destinationPortId);
        return virtualChannelRefs(nodes.get(port?.nodeId), session.sessionId, direction).some(ref =>
          ref.number === resource.channelNumber && (!edge.channelMap ||
            edge.channelMap.some(pair => pair[input ? 'sourceChannel' : 'destinationChannel'] === ref.lane)));
      });
      const status = reserved.has(resource.resourceId) || (!input && [31, 32].includes(resource.channelNumber)) ? 'reserved'
        : owners.some(item => item.locked) ? 'locked'
        : resource.availability !== 'available' ? 'unavailable' : owners.length || edges.length ? 'used' : 'free';
      return { ...resource, status, edges };
    }).sort((a, b) => a.channelNumber - b.channelNumber);
}

export function editPatch(session, chain, target, choice, idFactory) {
  const { direction, portId, lane, channel, connectionIds = [], externalLayout, confirmed, peerLane, whole = false } = target;
  const input = direction !== 'output', virtualDirection = input ? 'input' : 'output';
  const sc = direction === 'sidechain';
  const graph = session.audioGraph;
  const port = graph.ports.find(value => value.portId === portId);
  const boundary = input ? chain.mainPath.inputBoundaryPortRef : chain.mainPath.outputBoundaryPortRef;
  if (!port || (sc ? !chainSidechainPorts(graph, chain).some(value => value.portId === portId) : portId !== boundary)) {
    throw new Error('Port de patch introuvable.');
  }
  const previousConnections = graph.connections.map(edge => ({ ...edge }));
  const assignments = session.patchAssignments || [];
  const old = graph.connections.filter(edge => connectionIds.includes(edge.connectionId));
  if (old.length !== connectionIds.length || old.some(edge => (input ? edge.destinationPortId : edge.sourcePortId) !== portId)) {
    throw new Error('La liaison a changé. Rouvrez le sélecteur.');
  }
  if (old.length && !confirmed) throw new Error('Confirmez le remplacement de la liaison.');
  const localKey = input ? 'destinationChannel' : 'sourceChannel';
  const remoteKey = input ? 'sourceChannel' : 'destinationChannel';
  let localLanes = [lane ?? 1];
  const resource = choice?.kind === 'virtual' && virtualPatchOptions(session, virtualDirection).find(item => item.resourceId === choice.id);
  if (choice?.kind === 'virtual' && (!resource || !['free', 'used'].includes(resource.status))) {
    throw new Error('Cette ressource est indisponible, réservée ou verrouillée.');
  }
  if (old.some(edge => session.chains.some(item => item.mainPath.connectionRefs.includes(edge.connectionId)))) {
    throw new Error('Le chemin principal de la chaîne est protégé.');
  }
  for (const edge of old) {
    const assignment = assignments?.find(item => item.assignmentId === edge.originAssignmentId);
    if (assignment?.locked || assignment?.purpose === 'music' || edge.hostBindingRef ||
      edge.gain != null || !['unknown',undefined].includes(edge.polarity) || edge.enabledState === 'disabled' ||
      Object.keys(edge.extensions || {}).length) throw new Error('Liaison verrouillée ou routing spécifique à préserver.');
    const remote = graph.ports.find(item => item.portId === edge[remoteKey === 'sourceChannel' ? 'sourcePortId' : 'destinationPortId']);
    const node = graph.nodes.find(item => item.nodeId === remote?.nodeId);
    if (node?.hostBindingRef || remote?.hostBindingRef || port.hostBindingRef) {
      throw new Error('Liaison liée à un port hôte à préserver.');
    }
    const refs = virtualChannelRefs(node, session.sessionId, virtualDirection);
    if (refs.some(ref => (channel === null || ref.number === channel) &&
      virtualPatchOptions(session, virtualDirection).some(item => item.channelNumber === ref.number && item.status === 'reserved'))) {
      throw new Error('Une ressource réservée ne peut pas être modifiée ici.');
    }
    const remoteLane = refs.find(item => item.number === channel)?.lane ?? peerLane;
    if ((!whole || choice) && !edge.channelMap && refs.length && (refs.length > 1 || (choice && !sc && port.channelCount !== 1))) {
      if (old.length === 1 && resource?.status === 'free' && assignment?.connectionRefs.length === 1 && remoteLane &&
        node.externalResourceRefs.length === refs.length && !node.hostBindingRef && !remote?.hostBindingRef &&
        !graph.connections.some(other => other !== edge && (other.sourcePortId === remote.portId || other.destinationPortId === remote.portId))) {
        node.externalResourceRefs[remoteLane - 1] = resource.resourceId;
        assignment.resourceRefs = node.externalResourceRefs.slice();
        assignment.origin = 'manual';
        return;
      }
      throw new Error('La correspondance des canaux est inconnue. Cette liaison doit être conservée.');
    }
    const cut = edge.channelMap?.filter(pair => (remoteLane == null || pair[remoteKey] === remoteLane) &&
      (externalLayout || lane == null || pair[localKey] === lane)) || [];
    if (edge.channelMap?.length && !cut.length) throw new Error('Le canal sélectionné ne correspond plus à cette liaison.');
    if (cut.length) localLanes = [...new Set(cut.map(pair => pair[localKey]))];
    const remaining = edge.channelMap?.filter(pair => !cut.includes(pair));
    if (remaining?.length) {
      edge.channelMap = remaining;
      if (assignment) {
        assignment.origin = 'manual';
        assignment.resourceRefs = assignment.resourceRefs.filter(ref => refs.some(item =>
          ref.endsWith(`:${item.number}`) && remaining.some(pair => pair[remoteKey] === item.lane)));
      }
    } else {
      graph.connections = graph.connections.filter(value => value !== edge);
      if (assignment) {
        assignment.connectionRefs = assignment.connectionRefs.filter(id => id !== edge.connectionId);
        if (assignment.connectionRefs.length) throw new Error('Cette affectation comporte des liaisons partagées.');
        session.patchAssignments = session.patchAssignments.filter(value => value !== assignment);
        if (node?.metadata?.originAssignmentId === assignment.assignmentId && remote &&
          !graph.connections.some(other => other.sourcePortId === remote.portId || other.destinationPortId === remote.portId)) {
          graph.ports = graph.ports.filter(value => value.nodeId !== node.nodeId);
          graph.nodes = graph.nodes.filter(value => value !== node);
        }
      }
    }
  }
  if (!choice) return;
  if (!Number.isSafeInteger(localLanes[0]) || localLanes[0] < 1 ||
    localLanes.some(value => value > (port.channelCount || 0))) throw new Error('Canal de chaîne incompatible.');
  const enableSumming = destination => {
    const node = graph.nodes.find(item => item.nodeId === destination.nodeId);
    if (!destination.hostBindingRef && !node?.hostBindingRef &&
      graph.connections.some(edge => edge.destinationPortId === destination.portId && edge.enabledState !== 'disabled')) {
      destination.fanInPolicy = 'multiple';
    }
  };
  if (choice.kind === 'chain') {
    const peer = session.chains.find(value => value.chainId === choice.id && value.chainId !== chain.chainId);
    const peerId = input ? peer?.mainPath.outputBoundaryPortRef : peer?.mainPath.inputBoundaryPortRef;
    const endpoint = graph.ports.find(value => value.portId === peerId);
    if (!endpoint || endpoint.mediaType !== 'audio' || endpoint.direction !== (input ? 'output' : 'input') ||
      !Number.isSafeInteger(choice.lane) || choice.lane < 1 || choice.lane > (endpoint.channelCount || 0)) {
      throw new Error('Canal de l’autre chaîne incompatible.');
    }
    const sourcePortId = input ? endpoint.portId : portId;
    const destinationPortId = input ? portId : endpoint.portId;
    const channelMap = localLanes.map(value => ({ [localKey]: value, [remoteKey]: choice.lane }));
    if (graph.connections.some(edge => edge.sourcePortId === sourcePortId && edge.destinationPortId === destinationPortId &&
      (!edge.channelMap || edge.channelMap.some(pair => channelMap.some(route =>
        route.sourceChannel === pair.sourceChannel && route.destinationChannel === pair.destinationChannel))))) {
      throw new Error('Cette liaison existe déjà ou sa correspondance est inconnue.');
    }
    enableSumming(input ? port : endpoint);
    graph.connections.push(createAudioConnection({ connectionId: idFactory('connection'), graphId: graph.graphId,
      sourcePortId, destinationPortId, routingRole: sc ? 'sidechain' : 'main', channelMap }));
  } else if (resource) {
    if (resource.edges.some(edge => {
      if ((input ? edge.destinationPortId : edge.sourcePortId) !== portId) return false;
      const remote = graph.ports.find(item => item.portId === (input ? edge.sourcePortId : edge.destinationPortId));
      const node = graph.nodes.find(item => item.nodeId === remote?.nodeId);
      const remoteLane = virtualChannelRefs(node, session.sessionId, virtualDirection)
        .find(ref => ref.number === resource.channelNumber)?.lane;
      return !edge.channelMap || edge.channelMap.some(pair =>
        pair[remoteKey] === remoteLane && localLanes.includes(pair[localKey]));
    })) {
      throw new Error('Cette liaison existe déjà ou sa correspondance est inconnue.');
    }
    if (input) enableSumming(port);
    const map = localLanes.map(value => ({ [localKey]: value, [remoteKey]: 1 }));
    const assignmentId = idFactory('assignment');
    const node = createAudioNode({ nodeId: idFactory('node'), graphId: graph.graphId, type: `audio-${virtualDirection}`,
      externalResourceRefs: [resource.resourceId], metadata: { originAssignmentId: assignmentId } });
    const endpoint = createAudioPort({ portId: idFactory('port'), nodeId: node.nodeId, direction: input ? 'output' : 'input',
      channelCount: 1, channelLayout: 'mono', role: 'main' });
    const edge = createAudioConnection({ connectionId: idFactory('connection'), graphId: graph.graphId,
      sourcePortId: input ? endpoint.portId : portId, destinationPortId: input ? portId : endpoint.portId,
      channelMap: map, routingRole: sc ? 'sidechain' : 'main', originAssignmentId: assignmentId });
    graph.nodes.push(node); graph.ports.push(endpoint); graph.connections.push(edge);
    (session.patchAssignments ||= []).push(createPatchAssignment({ assignmentId, sessionId: session.sessionId, chainId: chain.chainId,
      direction: virtualDirection, purpose: sc ? 'sidechain' : 'chain', origin: 'manual',
      resourceRefs: [resource.resourceId], targetPortRefs: [portId], connectionRefs: [edge.connectionId] }));
  } else throw new Error('Source de patch incompatible.');
  if (introducesAudioCycle(graph, previousConnections)) throw new Error('Cette liaison créerait une boucle audio.');
}

export function planClearPatch(session) {
  let candidate = structuredClone(session);
  const { audioGraph: graph } = session;
  const nodes = new Map(graph.nodes.map(node => [node.nodeId, node]));
  const ports = new Map(graph.ports.map(port => [port.portId, port]));
  const internal = new Set(session.chains.flatMap(chain => chain.mainPath.connectionRefs));
  const reserved = new Set((session.environmentConfiguration?.reservations || [])
    .flatMap(item => item.resourceRefs));
  const removable = [], kept = [];
  for (const edge of graph.connections) {
    const from = nodes.get(ports.get(edge.sourcePortId)?.nodeId);
    const to = nodes.get(ports.get(edge.destinationPortId)?.nodeId);
    const assignment = session.patchAssignments?.find(item => item.assignmentId === edge.originAssignmentId);
    const input = from?.type === 'audio-input' || edge.routingRole === 'sidechain';
    const portId = input ? edge.destinationPortId : edge.sourcePortId;
    const chain = session.chains.find(item => portId === (input ? item.mainPath.inputBoundaryPortRef : item.mainPath.outputBoundaryPortRef) ||
      (input && chainSidechainPorts(graph, item).some(port => port.portId === portId)));
    const chainLink = edge.routingRole === 'main' && chain && session.chains.some(other =>
      other !== chain && other.mainPath.inputBoundaryPortRef === edge.destinationPortId);
    if (!assignment && from?.type !== 'audio-input' && to?.type !== 'audio-output' &&
      !(chain && edge.routingRole === 'sidechain') && !chainLink) continue;
    const refs = virtualChannelRefs(input ? from : to, session.sessionId, input ? 'input' : 'output');
    const direction = edge.routingRole === 'sidechain' ? 'sidechain' : input ? 'input' : 'output';
    const name = chain?.name || session.chains.find(item => item.chainId === assignment?.chainId)?.name;
    const channels = refs.map(ref => `${input ? 'IN' : 'OUT'}${String(ref.number).padStart(2, '0')}`).join(', ');
    const sourceChain = session.chains.find(item => item.mainPath.outputBoundaryPortRef === edge.sourcePortId);
    const remote = input ? from : to;
    const ownsRemote = assignment && remote?.metadata?.originAssignmentId === assignment.assignmentId;
    const remotePortId = input ? edge.sourcePortId : edge.destinationPortId;
    const sharesRemote = ownsRemote && (graph.ports.filter(port => port.nodeId === remote.nodeId).length !== 1 ||
      graph.connections.some(other => other !== edge &&
        (other.sourcePortId === remotePortId || other.destinationPortId === remotePortId)) ||
      (session.patchAssignments || []).some(other => other !== assignment && other.targetPortRefs.includes(remotePortId)) ||
      session.chains.some(item => item.interfaces?.some(port => port.internalPortRef === remotePortId)));
    const label = [name, direction === 'sidechain' ? (ports.get(portId)?.label || 'SC') : input ? 'IN' : 'OUT',
      channels || (input ? sourceChain?.name || from?.label : to?.label) || edge.connectionId].filter(Boolean).join(' · ');
    if (!chain || sharesRemote || internal.has(edge.connectionId) || (!input && refs.some(ref => [31, 32].includes(ref.number))) ||
      assignment?.resourceRefs.some(ref => reserved.has(ref)) || from?.hostBindingRef || to?.hostBindingRef ||
      ports.get(edge.sourcePortId)?.hostBindingRef || ports.get(edge.destinationPortId)?.hostBindingRef) {
      kept.push({ id: edge.connectionId, label, reason: 'Liaison réservée ou structurelle' });
      continue;
    }
    const attempt = structuredClone(candidate);
    try {
      editPatch(attempt, chain, { direction, portId, lane: null, channel: null, whole: true,
        confirmed: true, connectionIds: [edge.connectionId] }, null);
      candidate = attempt;
      removable.push({ id: edge.connectionId, label });
    } catch (error) { kept.push({ id: edge.connectionId, label, reason: error.message }); }
  }
  return { session: candidate, removable, kept };
}
