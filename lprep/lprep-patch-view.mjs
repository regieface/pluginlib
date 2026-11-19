import { virtualChannelRefs } from './lprep-patch.mjs';
import { chainSidechainPorts } from './lprep-audio-graph.mjs';

const numbers = values => [...new Set(values)].sort((a, b) => a - b);
const widthOf = port => port?.channelCount ?? ({ mono: 1, stereo: 2 })[port?.channelLayout] ?? null;

export const patchChannelName = (direction, number) => number === null ? 'nA'
  : Number.isSafeInteger(number) && number > 0
    ? `${direction === 'input' ? 'IN' : 'OUT'}${String(number).padStart(2, '0')}`
    : 'Inconnu';

// Visual positions are separate from the lane carried by the actual connection.
export function patchDisplayCells({ cells, width }) {
  const used = new Set(cells.map(cell => cell.lane).filter(lane => lane !== null));
  let next = 1;
  return cells.map(cell => {
    while (used.has(next)) next++;
    const position = cell.lane ?? next++;
    return { ...cell, position,
      side: width === 2 ? ({ 1: 'L', 2: 'R' })[position] : undefined,
      ambiguous: (cell.number !== null || cell.peer) && cell.lane === null };
  }).sort((a, b) => a.position - b.position || (a.number ?? 0) - (b.number ?? 0));
}

export function patchRows(session) {
  if (!session) return [];
  const graph = session.audioGraph;
  const by = (values, key) => new Map(values.map(value => [value[key], value]));
  const nodes = by(graph.nodes, 'nodeId');
  const ports = by(graph.ports, 'portId');
  const connections = by(graph.connections, 'connectionId');
  const instances = by(session.pluginInstances, 'instanceId');
  const chains = by(session.chains, 'chainId');
  const endpoint = id => {
    const port = ports.get(id);
    return { port, node: nodes.get(port?.nodeId) };
  };
  const edges = graph.connections.map(connection => ({
    connection, source: endpoint(connection.sourcePortId), destination: endpoint(connection.destinationPortId)
  }));
  function virtual(edge, direction) {
    const external = direction === 'input' ? edge.source : edge.destination;
    const refs = virtualChannelRefs(external.node, session.sessionId, direction);
    const externalKey = direction === 'input' ? 'sourceChannel' : 'destinationChannel';
    const localKey = direction === 'input' ? 'destinationChannel' : 'sourceChannel';
    const mappings = edge.connection.channelMap;
    const routes = refs.flatMap(({ lane, number }) => mappings
      ? mappings.filter(pair => pair[externalKey] === lane)
        .map(pair => ({ externalLane: lane, localLane: pair[localKey], number }))
      : [{ externalLane: lane, localLane: null, number }]);
    return { routes, width: widthOf(external.port) };
  }

  function boundary(portId, direction, declaredFormat) {
    const port = ports.get(portId);
    const matches = edges.filter(({ connection }) => connection.enabledState !== 'disabled' &&
      connection.routingRole === 'main' && (direction === 'input' ? connection.destinationPortId : connection.sourcePortId) === portId
    ).map(edge => {
      const link = virtual(edge, direction);
      const remotePortId = direction === 'input' ? edge.connection.sourcePortId : edge.connection.destinationPortId;
      const peer = session.chains.find(chain => remotePortId === (direction === 'input'
        ? chain.mainPath.outputBoundaryPortRef : chain.mainPath.inputBoundaryPortRef));
      const channelKey = direction === 'input' ? 'destinationChannel' : 'sourceChannel';
      const peerKey = direction === 'input' ? 'sourceChannel' : 'destinationChannel';
      const routes = peer ? (edge.connection.channelMap || [{}]).map(pair => ({
        localLane: pair[channelKey] ?? null, number: null, peer: peer.name, peerLane: pair[peerKey]
      })) : link.routes;
      return { ...link, routes, connection: edge.connection };
    }).filter(link => link.routes.length);
    const localWidth = widthOf(port);
    // A documented asymmetric mapping can expose a different number of virtual lanes at the boundary.
    const [single] = matches;
    const externalLayout = matches.length === 1 && single.connection.channelMap &&
      !single.routes.some(route => route.peer) && single.width !== null && single.width !== localWidth &&
      (localWidth === 1 || new Set(single.routes.map(route => route.localLane)).size === localWidth);
    const width = externalLayout ? single.width : localWidth;
    const displayWidth = width ?? ({ mono: 1, stereo: 2 })[declaredFormat] ?? null;
    const routes = matches.flatMap(link => link.routes.map(route => ({ ...route,
      lane: externalLayout ? route.externalLane : (route.localLane ?? (width === 1 ? 1 : null)),
      connectionId: link.connection.connectionId
    })));
    const slots = new Map();
    for (const { lane, number, localLane, peer, peerLane, connectionId } of routes) {
      const key = JSON.stringify([lane, number, peer ? connectionId : null, peerLane]);
      if (!slots.has(key)) slots.set(key, { lane, number, ...(peer && { peer, peerLane }),
        ...(externalLayout && { localLane }), connectionIds: [] });
      const slot = slots.get(key);
      if (!slot.connectionIds.includes(connectionId)) slot.connectionIds.push(connectionId);
    }
    const cells = [...slots.values()].sort((a, b) =>
      (a.lane ?? Infinity) - (b.lane ?? Infinity) || a.number - b.number);
    const minimum = displayWidth || 1;
    const occupied = new Set(cells.map(cell => cell.lane));
    for (let lane = 1; lane <= minimum && (!cells.some(cell => cell.lane === null) || cells.length < minimum); lane++) {
      if (!occupied.has(lane)) cells.push({ lane, number: null, connectionIds: [] });
    }
    return { portId, width: displayWidth, externalLayout: Boolean(externalLayout), cells: cells.map(cell => ({
      ...cell,
      label: width === 1 ? 'Mono' : width === 2 && cell.lane !== null && cell.number !== null ? (cell.lane === 1 ? 'L' : 'R') : 'Canal'
    })), connectionIds: matches.map(link => link.connection.connectionId) };
  }

  return session.chainOrder.map(chainId => {
    const chain = chains.get(chainId);
    const path = chain.mainPath;
    const input = boundary(path.inputBoundaryPortRef, 'input', chain.audioFormat);
    const output = boundary(path.outputBoundaryPortRef, 'output', chain.audioFormat);
    const shown = new Set([...input.connectionIds, ...output.connectionIds]);
    const internal = new Set(path.connectionRefs);
    const ownedNodes = new Set([endpoint(path.inputBoundaryPortRef).node?.nodeId, endpoint(path.outputBoundaryPortRef).node?.nodeId]);
    if (chain.sidechainNodeRef) ownedNodes.add(chain.sidechainNodeRef);
    for (const id of path.connectionRefs) {
      const connection = connections.get(id);
      ownedNodes.add(endpoint(connection.sourcePortId).node?.nodeId);
      ownedNodes.add(endpoint(connection.destinationPortId).node?.nodeId);
    }
    const independentIds = new Set(chain.presentationLinks);
    const touchesChain = node => node && (ownedNodes.has(node.nodeId) || independentIds.has(node.instanceRef));
    const details = edges.filter(edge => !shown.has(edge.connection.connectionId) &&
      (touchesChain(edge.source.node) || touchesChain(edge.destination.node))).map(edge => ({
      ...edge,
      internal: internal.has(edge.connection.connectionId),
      inputs: numbers(virtual(edge, 'input').routes.map(route => route.number)),
      outputs: numbers(virtual(edge, 'output').routes.map(route => route.number))
    }));
    const sidechains = chainSidechainPorts(graph, chain).map((port, index) => ({
      portId: port.portId,
      label: `SC${index + 1}`,
      sources: edges.filter(({ connection }) => connection.destinationPortId === port.portId &&
        connection.enabledState !== 'disabled').map(edge => ({
        connectionId: edge.connection.connectionId,
        inputs: numbers(virtual(edge, 'input').routes.map(route => route.number)),
        channelMap: edge.connection.channelMap,
        label: session.chains.find(other => other.mainPath.outputBoundaryPortRef === edge.connection.sourcePortId)?.name ||
          [edge.source.node?.label || edge.source.node?.nodeId, edge.source.port?.label].filter(Boolean).join(' · ')
      }))
    }));
    return { chain, input, output, sidechains, details, independent: chain.presentationLinks.map(id => instances.get(id)) };
  });
}
