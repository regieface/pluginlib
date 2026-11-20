/**
 * Éditeur conservatif du format natif LiveProfessor 2026.1.0 (.rack2).
 *
 * NE DÉCODE NI NE RECONSTRUIT les états AU/VST3, les snapshots, les patches,
 * les réglages MIDI ni les autres structures opaques. Remplace uniquement les
 * variantes binaires des propriétés connues (nom, couleur, ordre des chaînes),
 * dans les deux représentations de chaque chaîne (projet + snapshot global).
 * Il ne réalise aucune écriture de fichier ; l'UI propose seulement une COPIE.
 */
import { readRack2Project } from './lprep-rack2-reader.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_SIZE = 32 * 1024 * 1024;
const MAX_NODES = 100000;
const MAX_DEPTH = 96;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const HEX_ID = /^[0-9a-f]{16}$/;
const fail = message => { throw new Error(`Écriture .rack2 refusée : ${message}`); };
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

class Scanner {
  constructor(source) {
    this.bytes = source instanceof Uint8Array ? source : source instanceof ArrayBuffer ? new Uint8Array(source) : null;
    if (!this.bytes || !this.bytes.length || this.bytes.length > MAX_SIZE) fail('fichier absent ou trop volumineux.');
    this.at = 0;
    this.nodes = 0;
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
  }
  need(size) {
    if (!Number.isSafeInteger(size) || size < 0 || size > this.bytes.length - this.at)
      fail('longueur invalide ou fichier tronqué.');
  }
  string() {
    const end = this.bytes.indexOf(0, this.at);
    if (end < this.at) fail('texte non terminé.');
    const value = decoder.decode(this.bytes.subarray(this.at, end));
    this.at = end + 1;
    return value;
  }
  cint() {
    this.need(1);
    const first = this.bytes[this.at++];
    const n = first & 0x7f;
    if (n > 4) fail('entier compressé inconnu.');
    this.need(n);
    let value = 0;
    for (let i = 0; i < n; i++) value += this.bytes[this.at++] * (2 ** (8 * i));
    return first & 0x80 ? -value : value;
  }
  variant() {
    const start = this.at;
    const size = this.cint();
    if (size < 1) fail('propriété binaire vide.');
    this.need(size);
    const payload = this.at;
    const kind = this.bytes[payload];
    this.at += size;
    return { start, end: this.at, kind, payload, size };
  }
  node(depth = 0) {
    if (depth > MAX_DEPTH || ++this.nodes > MAX_NODES) fail('structure trop profonde.');
    const name = this.string();
    const propCount = this.cint();
    if (propCount < 0 || propCount > 20000) fail('nombre de propriétés incohérent.');
    const properties = new Map();
    for (let i = 0; i < propCount; i++) {
      const key = this.string();
      if (properties.has(key)) fail('propriété répétée.');
      properties.set(key, this.variant());
    }
    const count = this.cint();
    if (count < 0 || count > MAX_NODES - this.nodes) fail('nombre de nœuds incohérent.');
    const children = [];
    for (let i = 0; i < count; i++) children.push(this.node(depth + 1));
    return { name, properties, children };
  }
  scan() {
    const root = this.node();
    if (this.at !== this.bytes.length) fail('octets supplémentaires inattendus.');
    if (root.name !== 'LiveProfessorProjectFile') fail('signature inconnue.');
    if (this.integer(root, 'ProjectFileVersion') !== 1) fail('version de fichier non testée.');
    if (this.text(root, 'appVersion') !== '2026.1.0') fail('version de LiveProfessor non encore testée pour l’écriture.');
    return root;
  }
  get(node, key, kind, size) {
    const prop = node?.properties.get(key);
    if (!prop || prop.kind !== kind || (size != null && prop.size !== size)) fail(`propriété « ${key} » inconnue ou non modifiable.`);
    return prop;
  }
  text(node, key) {
    const prop = this.get(node, key, 5);
    if (prop.size < 2 || this.bytes[prop.end - 1] !== 0) fail(`texte « ${key} » mal formé.`);
    return decoder.decode(this.bytes.subarray(prop.payload + 1, prop.end - 1));
  }
  integer(node, key) {
    const prop = this.get(node, key, 1, 5);
    return this.view.getInt32(prop.payload + 1, true);
  }
  id(node, key) {
    const prop = this.get(node, key, 6, 9);
    return hex(this.bytes.subarray(prop.payload + 1, prop.end));
  }
}
const child = (node, name) => node?.children.find(n => n.name === name);
function compact(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0x7fffffff) fail('longueur binaire trop grande.');
  if (!value) return Uint8Array.of(0);
  const parts = [];
  while (value > 0) { parts.push(value & 255); value = Math.floor(value / 256); }
  return Uint8Array.of(parts.length, ...parts);
}
function concat(...parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { result.set(part, at); at += part.length; }
  return result;
}
function textVariant(value) {
  const data = encoder.encode(value);
  return concat(compact(data.length + 2), Uint8Array.of(5), data, Uint8Array.of(0));
}
function intVariant(value) {
  const b = new ArrayBuffer(5), v = new DataView(b);
  v.setUint8(0, 1);
  v.setInt32(1, value, true);
  return concat(compact(5), new Uint8Array(b));
}
function scanChains(source) {
  const scanner = new Scanner(source), root = scanner.scan();
  const mainSection = child(root, 'Chains');
  const snapSection = child(child(root, 'GlobalSnapshot'), 'Chains');
  if (!mainSection || !snapSection) fail('représentations de chaînes incomplètes.');
  const main = mainSection.children.filter(c => c.name === 'Chain');
  const snapshots = snapSection.children.filter(c => c.name === 'Chain');
  if (main.length !== snapshots.length || main.length !== mainSection.children.length ||
      snapshots.length !== snapSection.children.length) fail('chaînes ou snapshots non correspondants.');
  const indexedSnapshots = new Map();
  for (const node of snapshots) {
    const id = scanner.id(node, 'ChainId');
    if (indexedSnapshots.has(id)) fail('identifiant de snapshot répété.');
    indexedSnapshots.set(id, node);
  }
  const list = [];
  for (const node of main) {
    const settings = child(node, 'ChainSettings');
    const processor = child(settings, 'ProcessorSettingsContainer');
    const id = scanner.id(processor, 'id');
    const snapshot = indexedSnapshots.get(id);
    if (!snapshot) fail('snapshot de chaîne manquant.');
    const snapProcessor = child(snapshot, 'ProcessorSettingsContainer');
    if (scanner.id(snapProcessor, 'id') !== id) fail('identifiant de snapshot incohérent.');
    const name = scanner.text(processor, 'name');
    const snapName = scanner.text(snapProcessor, 'name');
    const color = scanner.text(settings, 'ChainColour');
    const snapColor = scanner.text(snapshot, 'ChainColour');
    const order = scanner.integer(node, 'ChainViewOrder');
    if (name !== snapName || color !== snapColor || !/^[0-9a-fA-F]{8}$/.test(color))
      fail('divergence entre projet et snapshot global (nom/couleur).');
    if (list.some(item => item.id === id)) fail('identifiant de chaîne répété.');
    list.push({ id, name, color: '#' + color.slice(2).toLowerCase(), alpha: color.slice(0, 2), order,
      mainName: scanner.get(processor, 'name', 5), snapName: scanner.get(snapProcessor, 'name', 5),
      mainColor: scanner.get(settings, 'ChainColour', 5), snapColor: scanner.get(snapshot, 'ChainColour', 5),
      mainOrder: scanner.get(node, 'ChainViewOrder', 1, 5) });
  }
  if (new Set(list.map(item => item.order)).size !== list.length ||
      list.some(item => item.order < 0)) fail('ordre natif des chaînes incohérent.');
  return { scanner, chains: list.sort((a, b) => a.order - b.order) };
}

/** Sans modification, retourne une copie rigoureusement identique. */
export function rewriteRack2Metadata(source, updates = []) {
  const { scanner, chains } = scanChains(source);
  const before = readRack2Project(scanner.bytes);
  if (before.chains.length !== chains.length) fail('nombre de chaînes incohérent entre lecteurs.');
  if (!Array.isArray(updates) || updates.length > chains.length) fail('liste de modifications invalide.');
  const updateMap = new Map();
  for (const update of updates) {
    if (!update || typeof update !== 'object' || !HEX_ID.test(update.id || '') || updateMap.has(update.id))
      fail('identifiant de modification inconnu ou répété.');
    if (Object.keys(update).some(key => !['id', 'name', 'color', 'order'].includes(key)))
      fail('champ de modification non autorisé.');
    updateMap.set(update.id, update);
  }
  for (const id of updateMap.keys()) if (!chains.some(item => item.id === id)) fail('chaîne absente du fichier source.');
  const final = chains.map(item => {
    const update = updateMap.get(item.id) || {};
    const name = update.name ?? item.name;
    const color = update.color ?? item.color;
    const order = update.order ?? item.order;
    if (typeof name !== 'string' || !name.trim() || encoder.encode(name).length > 128 || /[\x00-\x1f\x7f]/.test(name))
      fail('nom de chaîne vide, trop long ou contenant des caractères de contrôle.');
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) fail('couleur de chaîne invalide.');
    if (!Number.isSafeInteger(order) || order < 0 || order >= chains.length) fail('rang de chaîne invalide.');
    return { ...item, name, color: color.toLowerCase(), order };
  });
  if (new Set(final.map(item => item.order)).size !== final.length) fail('ordres de chaînes en conflit.');
  const patches = [];
  const change = (prop, bytes) => patches.push({ start: prop.start, end: prop.end, bytes });
  for (let i = 0; i < chains.length; i++) {
    const old = chains[i], next = final[i];
    if (old.name !== next.name) {
      change(old.mainName, textVariant(next.name));
      change(old.snapName, textVariant(next.name));
    }
    if (old.color !== next.color) {
      const text = old.alpha + next.color.slice(1);
      change(old.mainColor, textVariant(text));
      change(old.snapColor, textVariant(text));
    }
    if (old.order !== next.order) change(old.mainOrder, intVariant(next.order));
  }
  if (!patches.length) return scanner.bytes.slice();
  patches.sort((a, b) => a.start - b.start);
  for (let i = 1; i < patches.length; i++) if (patches[i].start < patches[i - 1].end)
    fail('modifications binaires chevauchantes.');
  const pieces = [];
  let at = 0;
  for (const patch of patches) {
    pieces.push(scanner.bytes.subarray(at, patch.start), patch.bytes);
    at = patch.end;
  }
  pieces.push(scanner.bytes.subarray(at));
  const result = concat(...pieces);
  const after = readRack2Project(result);
  const expected = [...final].sort((a, b) => a.order - b.order);
  if (after.chains.length !== expected.length || after.chains.some((chain, i) =>
    chain.id !== expected[i].id || chain.name !== expected[i].name ||
    chain.color !== expected[i].color || chain.order !== expected[i].order ||
    chain.inputFormat !== before.chains.find(c => c.id === chain.id)?.inputFormat ||
    chain.outputFormat !== before.chains.find(c => c.id === chain.id)?.outputFormat ||
    JSON.stringify(chain.plugins) !== JSON.stringify(before.chains.find(c => c.id === chain.id)?.plugins)))
    fail('vérification du fichier généré impossible.');
  if (JSON.stringify(after.connections) !== JSON.stringify(before.connections) ||
      after.pluginCount !== before.pluginCount || after.totalConnections !== before.totalConnections ||
      after.inputCount !== before.inputCount || after.outputCount !== before.outputCount)
    fail('le nouveau fichier modifie des informations audio non autorisées.');
  // Revérifier également la cohérence entre la structure de projet et le snapshot.
  const verified = scanChains(result);
  if (verified.chains.some((item, i) => item.id !== expected[i].id ||
    item.name !== expected[i].name || item.color !== expected[i].color || item.order !== expected[i].order))
    fail('la vérification du snapshot global a échoué.');
  return result;
}

/**
 * S2 (expérimental) : reroute UNIQUEMENT la destination de connexions audio existantes.
 * Les propriétés du nœud source et les groupes `outputs` restent inchangés.
 * Aucune création/suppression de point, aucune écriture disque ni mutation du tampon source.
 * Les numéros de canaux de l'API sont 1-based ; ceux de .rack2 sont 0-based.
 */
export function rewriteRack2PatchDestinations(source, updates = []) {
  // Réutilise le garde-fou existant : LP 2026.1.0, chaînes et snapshots cohérents.
  rewriteRack2Metadata(source);
  const scanner = new Scanner(source);
  const root = scanner.scan();
  const before = readRack2Project(scanner.bytes);
  if (!Array.isArray(updates)) fail('liste de reroutages invalide.');
  if (!updates.length) return scanner.bytes.slice();
  if (updates.length > before.totalConnections) fail('trop de reroutages demandés.');

  const inputId = '0100000000000000';
  const outputId = '0200000000000000';
  const byId = new Map(before.chains.map(chain => [chain.id, chain]));
  const audioPatch = child(child(root, 'GlobalSnapshot'), 'AudioPatch');
  if (!audioPatch) fail('AudioPatch natif absent.');
  const edges = [];
  for (const group of audioPatch.children.filter(n => n.name === 'outputs')) {
    for (const point of group.children.filter(n => n.name === 'point')) {
      const midi = point.properties.get('isMidi');
      if (!midi || midi.size !== 1 || (midi.kind !== 2 && midi.kind !== 3))
        fail('type MIDI/audio du point inconnu.');
      if (midi.kind === 2) continue;
      const fromId = scanner.id(point, 'outputNodeId');
      const fromChannel = scanner.integer(point, 'outputChannelId') + 1;
      const toId = scanner.id(point, 'inputNodeId');
      const toChannel = scanner.integer(point, 'inputChannelId') + 1;
      const parentId = group.properties.get('nodeId');
      const parentChannel = group.properties.get('channelId');
      if (Boolean(parentId) !== Boolean(parentChannel))
        fail('groupement de source incomplet.');
      if (parentId && (scanner.id(group, 'nodeId') !== fromId ||
          scanner.integer(group, 'channelId') + 1 !== fromChannel))
        fail('groupement de source incohérent.');
      edges.push({ fromId, fromChannel, toId, toChannel, point });
    }
  }
  if (edges.length !== before.totalConnections) fail('nombre de connexions incohérent entre lecteurs.');
  const key = edge => `${edge.fromId}:${edge.fromChannel}>${edge.toId}:${edge.toChannel}`;
  const originalKeys = new Set(edges.map(key));
  if (originalKeys.size !== edges.length) fail('connexions identiques ambiguës.');
  const changes = new Map();
  const fields = ['fromId', 'fromChannel', 'toId', 'toChannel', 'nextToId', 'nextToChannel'];
  const validChannel = n => Number.isSafeInteger(n) && n >= 1;

  for (const update of updates) {
    if (!update || typeof update !== 'object' || Array.isArray(update) ||
        Object.keys(update).some(field => !fields.includes(field)) ||
        !HEX_ID.test(update.fromId) || !HEX_ID.test(update.toId) ||
        !HEX_ID.test(update.nextToId) ||
        !validChannel(update.fromChannel) || !validChannel(update.toChannel) ||
        !validChannel(update.nextToChannel)) fail('reroutage mal formé.');
    const oldKey = key(update);
    const edge = edges.find(item => key(item) === oldKey);
    if (!edge) fail('connexion à modifier introuvable.');
    if (changes.has(edge)) fail('connexion modifiée plusieurs fois.');
    // Le numéro de source n'est jamais modifié dans cette première étape.
    if (edge.fromId === inputId) {
      if (edge.fromChannel > before.inputCount) fail('source matérielle hors limites.');
    } else if (byId.has(edge.fromId)) {
      if (edge.fromChannel > byId.get(edge.fromId).outputCount)
        fail('canal de sortie de chaîne hors limites.');
    } else fail('source audio non reconnue pour une modification.');
    if (update.nextToId === outputId) {
      if (update.nextToChannel > before.outputCount) fail('sortie matérielle hors limites.');
    } else if (byId.has(update.nextToId)) {
      if (update.nextToChannel > byId.get(update.nextToId).inputCount)
        fail('entrée de chaîne hors limites.');
    } else fail('destination audio inconnue.');
    changes.set(edge, { ...edge, toId: update.nextToId, toChannel: update.nextToChannel });
  }

  const expected = edges.map(edge => {
    const { fromId, fromChannel, toId, toChannel } = changes.get(edge) || edge;
    return { fromId, fromChannel, toId, toChannel };
  });
  if (new Set(expected.map(key)).size !== expected.length)
    fail('le reroutage créerait des connexions identiques.');
  const patches = [];
  for (const [edge, next] of changes) {
    if (edge.toId !== next.toId) {
      const data = Uint8Array.from(next.toId.match(/../g).map(part => Number.parseInt(part, 16)));
      const prop = scanner.get(edge.point, 'inputNodeId', 6, 9);
      patches.push({ start: prop.start, end: prop.end,
        bytes: concat(compact(9), Uint8Array.of(6), data) });
    }
    if (edge.toChannel !== next.toChannel) {
      const prop = scanner.get(edge.point, 'inputChannelId', 1, 5);
      patches.push({ start: prop.start, end: prop.end, bytes: intVariant(next.toChannel - 1) });
    }
  }
  if (!patches.length) return scanner.bytes.slice();
  patches.sort((a, b) => a.start - b.start);
  const pieces = [];
  let at = 0;
  for (const patch of patches) {
    if (patch.start < at || patch.bytes.length !== patch.end - patch.start)
      fail('réécriture binaire non conservatrice.');
    pieces.push(scanner.bytes.subarray(at, patch.start), patch.bytes);
    at = patch.end;
  }
  pieces.push(scanner.bytes.subarray(at));
  const result = concat(...pieces);
  const after = readRack2Project(result);
  // Comparer les valeurs, pas l'ordre d'insertion des propriétés JSON.
  const connectionsMatch = after.connections.length === expected.length &&
    after.connections.every((actual, index) => {
      const wanted = expected[index];
      return actual.fromId === wanted.fromId &&
        actual.fromChannel === wanted.fromChannel &&
        actual.toId === wanted.toId &&
        actual.toChannel === wanted.toChannel;
    });
  if (result.length !== scanner.bytes.length ||
      !connectionsMatch ||
      after.pluginCount !== before.pluginCount ||
      after.inputCount !== before.inputCount || after.outputCount !== before.outputCount ||
      JSON.stringify(after.chains.map(({ inputs, outputs, ...unchanged }) => unchanged)) !==
      JSON.stringify(before.chains.map(({ inputs, outputs, ...unchanged }) => unchanged)))
    fail('le fichier rerouté ne respecte pas les invariants natifs.');
  rewriteRack2Metadata(result); // Revalide les snapshots / métadonnées.
  return result;
}
