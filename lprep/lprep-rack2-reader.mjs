/**
 * Lecture seule des fichiers LiveProfessor .rack2 (ValueTree sérialisé).
 * Première version basée sur les quatre fixtures LP 2026.1.0.
 * Ne modifie jamais les octets du fichier, n'écrit pas dans L-Prep et ne
 * prétend pas importer les états opaques des plugins.
 */
const MAX_FILE_SIZE = 32 * 1024 * 1024;
const MAX_NODES = 100_000;
const MAX_DEPTH = 96;
const decoder = new TextDecoder('utf-8', { fatal: true });

function fail(message) { throw new Error(`Fichier LiveProfessor non pris en charge : ${message}`); }
function bytesHex(bytes) { return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''); }

class ValueTreeReader {
  constructor(source) {
    this.bytes = source instanceof Uint8Array ? source :
      source instanceof ArrayBuffer ? new Uint8Array(source) : null;
    if (!this.bytes) fail('données binaires attendues.');
    if (!this.bytes.length || this.bytes.length > MAX_FILE_SIZE) fail('taille du fichier invalide.');
    this.position = 0;
    this.nodes = 0;
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
  }
  require(length) {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.bytes.length - this.position)
      fail('contenu tronqué ou longueur incohérente.');
  }
  string() {
    const end = this.bytes.indexOf(0, this.position);
    if (end < this.position) fail('chaîne non terminée.');
    const result = decoder.decode(this.bytes.subarray(this.position, end));
    this.position = end + 1;
    return result;
  }
  compressedInt() {
    this.require(1);
    const first = this.bytes[this.position++];
    const length = first & 0x7f;
    if (length > 4) fail('entier compressé invalide.');
    this.require(length);
    let value = 0;
    for (let index = 0; index < length; index++) value += this.bytes[this.position++] * (2 ** (8 * index));
    return first & 0x80 ? -value : value;
  }
  variant() {
    const size = this.compressedInt();
    if (size < 1) fail('propriété vide ou invalide.');
    this.require(size);
    const begin = this.position;
    const kind = this.bytes[begin];
    this.position += size;
    const payloadSize = size - 1;
    switch (kind) {
      case 1: if (payloadSize !== 4) fail('entier int32 invalide.');
        return this.view.getInt32(begin + 1, true);
      case 2: if (payloadSize) fail('booléen invalide.'); return true;
      case 3: if (payloadSize) fail('booléen invalide.'); return false;
      case 4: if (payloadSize !== 8) fail('nombre réel invalide.');
        return this.view.getFloat64(begin + 1, true);
      case 5: {
        if (!payloadSize || this.bytes[this.position - 1] !== 0) fail('texte invalide.');
        return decoder.decode(this.bytes.subarray(begin + 1, this.position - 1));
      }
      case 6: // Identifiants 64 bits LiveProfessor (conserver les octets tels quels).
        if (payloadSize !== 8) return { kind: 'opaque', byteLength: payloadSize };
        return { kind: 'id64', hex: bytesHex(this.bytes.subarray(begin + 1, this.position)) };
      default: // chunks AudioUnit/VST3 et autres variantes non interprétées.
        return { kind: 'opaque', type: kind, byteLength: payloadSize };
    }
  }
  node(depth = 0) {
    if (depth > MAX_DEPTH || ++this.nodes > MAX_NODES) fail('structure trop profonde ou trop volumineuse.');
    const name = this.string();
    const propertyCount = this.compressedInt();
    if (propertyCount < 0 || propertyCount > 20_000) fail('nombre de propriétés invalide.');
    const properties = Object.create(null);
    for (let i = 0; i < propertyCount; i++) {
      const key = this.string();
      if (Object.hasOwn(properties, key)) fail('propriété répétée.');
      properties[key] = this.variant();
    }
    const count = this.compressedInt();
    if (count < 0 || count > MAX_NODES - this.nodes) fail('nombre de sous-éléments invalide.');
    const children = [];
    for (let i = 0; i < count; i++) children.push(this.node(depth + 1));
    return { name, properties, children };
  }
  read() {
    const root = this.node();
    if (this.position !== this.bytes.length) fail('octets supplémentaires en fin de fichier.');
    if (root.name !== 'LiveProfessorProjectFile') fail('signature de projet incorrecte.');
    if (root.properties.ProjectFileVersion !== 1)
      fail(`version de fichier ${String(root.properties.ProjectFileVersion)} non reconnue.`);
    return root;
  }
}

const child = (parent, name) => parent?.children.find(item => item.name === name);
const idHex = value => value?.kind === 'id64' ? value.hex : null;
const number = value => Number.isSafeInteger(value) ? value : null;
const format = (count, busConfig) => count === 1 && busConfig === 'C' ? 'mono' :
  count === 2 && busConfig === 'L R' ? 'stereo' : `multicanal (${count ?? '?'})`;
const sortedChannels = values => [...new Set(values)].sort((a, b) => a - b);

/** @returns {object} Snapshot de lecture indépendant du modèle L-Prep. */
export function readRack2Project(source) {
  const root = new ValueTreeReader(source).read();
  const hardware = child(root, 'AudioMidiHardware');
  const io = child(hardware, 'IOdeviceProperties')?.properties || {};
  const chainsNode = child(root, 'Chains');
  if (!hardware || !chainsNode) fail('sections principales absentes.');
  const rawChains = chainsNode.children.filter(item => item.name === 'Chain');
  const chains = rawChains.map((item, index) => {
    const settings = child(item, 'ChainSettings');
    const processor = child(settings, 'ProcessorSettingsContainer');
    const properties = settings?.properties;
    if (!settings || !processor || !properties || !idHex(processor.properties.id))
      fail(`chaîne ${index + 1} sans réglages ou identifiant reconnus.`);
    const colorArgb = properties.ChainColour;
    const color = typeof colorArgb === 'string' && /^[0-9a-fA-F]{8}$/.test(colorArgb) ?
      `#${colorArgb.slice(2).toLowerCase()}` : null;
    const plugins = child(item, 'ChainPlugins')?.children.filter(node => node.name === 'Plugin').map(node => ({
      name: node.properties.pluginTypeName || 'Plugin sans nom',
      format: String(node.properties.pluginTypeId || '').startsWith('AudioUnit-') ? 'AU' :
        String(node.properties.pluginTypeId || '').startsWith('VST3-') ? 'VST3' : 'Autre',
      typeId: node.properties.pluginTypeId || null,
      id: idHex(node.properties.pluginUid)
    })) || [];
    return {
      id: idHex(processor.properties.id),
      name: processor.properties.name || `Chaîne ${index + 1}`,
      order: number(item.properties.ChainViewOrder) ?? index,
      inputFormat: format(properties.ChainInputCount, properties.ChainMainInputBusConfig),
      outputFormat: format(properties.ChainOutputCount, properties.ChainMainOutputBusConfig),
      inputCount: number(properties.ChainInputCount),
      outputCount: number(properties.ChainOutputCount),
      color, plugins, inputs: [], outputs: []
    };
  }).sort((a, b) => a.order - b.order);
  if (new Set(chains.map(item => item.id)).size !== chains.length)
    fail('identifiants de chaînes dupliqués.');
  const idToChain = new Map(chains.map(item => [item.id, item]));
  const audioPatch = child(child(root, 'GlobalSnapshot'), 'AudioPatch');
  if (!audioPatch) fail('AudioPatch principal absent.');
  const inputNodeId = '0100000000000000';
  const outputNodeId = '0200000000000000';
  let totalConnections = 0;
  let otherConnections = 0;
  const connections = [];
  for (const output of audioPatch.children.filter(item => item.name === 'outputs')) {
    for (const point of output.children.filter(item => item.name === 'point')) {
      if (point.properties.isMidi === true) continue;
      const fromId = idHex(point.properties.outputNodeId), toId = idHex(point.properties.inputNodeId);
      const fromChannel = number(point.properties.outputChannelId);
      const toChannel = number(point.properties.inputChannelId);
      if (!fromId || !toId || fromChannel === null || toChannel === null || fromChannel < 0 || toChannel < 0)
        fail('point de connexion audio invalide.');
      totalConnections++;
      connections.push({ fromId, toId, fromChannel: fromChannel + 1, toChannel: toChannel + 1 });
      if (fromId === inputNodeId && idToChain.has(toId)) idToChain.get(toId).inputs.push(fromChannel + 1);
      else if (toId === outputNodeId && idToChain.has(fromId)) idToChain.get(fromId).outputs.push(toChannel + 1);
      else otherConnections++;
    }
  }
  for (const chain of chains) {
    chain.inputs = sortedChannels(chain.inputs);
    chain.outputs = sortedChannels(chain.outputs);
  }
  const pluginCount = chains.reduce((sum, chain) => sum + chain.plugins.length, 0);
  const warnings = [];
  if (otherConnections) warnings.push(`${otherConnections} connexion(s) supplémentaire(s) à examiner (routage complexe ou autre nœud).`);
  if (chains.some(chain => chain.inputFormat.startsWith('multicanal') || chain.outputFormat.startsWith('multicanal')))
    warnings.push('Certains formats multicanaux ne sont pas encore modélisés dans la prévisualisation.');
  if (pluginCount) warnings.push('Les états AU/VST3 sont détectés mais non édités ni importés dans le projet L-Prep.');
  return {
    appVersion: String(root.properties.appVersion || ''), projectFileVersion: root.properties.ProjectFileVersion,
    inputCount: number(io.RequiredInputs) ?? child(hardware, 'AudioInputs')?.children.length ?? 0,
    outputCount: number(io.RequiredOutputs) ?? child(hardware, 'AudioOutputs')?.children.length ?? 0,
    pluginCount, totalConnections, otherConnections,
    chains, connections, warnings, readOnly: true
  };
}
