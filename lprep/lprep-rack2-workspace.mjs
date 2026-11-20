/**
 * Session de travail native .rack2, conservée UNIQUEMENT en mémoire.
 * Les plugins, leur état, le patch, MIDI, snapshots et formats sont en lecture seule.
 * Le seul sérialiseur utilisé réécrit noms, couleurs et ordre dans une COPIE.
 */
import { readRack2Project } from './lprep-rack2-reader.mjs';
import { rewriteRack2Metadata } from './lprep-rack2-native.mjs';

const encoder = new TextEncoder();
const HEX = /^#[0-9a-fA-F]{6}$/;
const CONTROL = /[\x00-\x1f\x7f]/;
function checkName(value) {
  if (typeof value !== 'string' || !value.trim() || encoder.encode(value).length > 128 || CONTROL.test(value))
    throw new Error('Nom de chaîne vide, trop long (128 octets UTF-8 max.) ou invalide.');
  return value.trim();
}
export class Rack2Workspace {
  #source;
  #snapshot;
  #chains;
  constructor(source, fileName) {
    if (!/\.rack2$/i.test(fileName || '')) throw new Error('Fichier .rack2 attendu.');
    this.#source = source instanceof Uint8Array ? source.slice() :
      source instanceof ArrayBuffer ? new Uint8Array(source.slice(0)) : null;
    if (!this.#source) throw new Error('Fichier binaire attendu.');
    this.#snapshot = readRack2Project(this.#source);
    // Vérifie AVANT d'autoriser la moindre édition que les deux représentations
    // natives concordent et que la version LP est réécrivable.
    const verified = rewriteRack2Metadata(this.#source);
    if (verified.length !== this.#source.length || verified.some((byte, i) => byte !== this.#source[i]))
      throw new Error('La vérification native sans modification a échoué.');
    this.#chains = this.#snapshot.chains.map(chain => ({ ...chain,
      plugins: chain.plugins.map(plugin => ({ ...plugin })),
      inputs: [...chain.inputs], outputs: [...chain.outputs] }));
    this.fileName = fileName;
  }
  get summary() {
    const { appVersion, inputCount, outputCount, pluginCount, totalConnections, otherConnections, warnings } = this.#snapshot;
    return { appVersion, inputCount, outputCount, pluginCount, totalConnections, otherConnections, warnings: [...warnings] };
  }
  get chains() {
    return this.#chains.map((chain, order) => ({ ...chain, order, plugins: chain.plugins.map(p => ({ ...p })),
      inputs: [...chain.inputs], outputs: [...chain.outputs] }));
  }
  get dirty() {
    return this.#chains.some((chain, order) => {
      const original = this.#snapshot.chains[order];
      return chain.id !== original.id || chain.name !== original.name || chain.color !== original.color;
    });
  }
  #find(id) {
    const chain = this.#chains.find(chain => chain.id === id);
    if (!chain) throw new Error('Chaîne native introuvable.');
    return chain;
  }
  rename(id, name) { this.#find(id).name = checkName(name); }
  recolor(id, color) {
    if (!HEX.test(color)) throw new Error('Couleur hexadécimale invalide.');
    this.#find(id).color = color.toLowerCase();
  }
  move(id, delta) {
    if (delta !== 1 && delta !== -1) throw new Error('Déplacement non autorisé.');
    const index = this.#chains.findIndex(c => c.id === id);
    if (index < 0) throw new Error('Chaîne native introuvable.');
    const target = index + delta;
    if (target < 0 || target >= this.#chains.length) return false;
    const [chain] = this.#chains.splice(index, 1);
    this.#chains.splice(target, 0, chain);
    return true;
  }
  // Même contrat que le glisser-déposer du constructeur : insérer avant une
  // autre chaîne, ou à la fin si beforeId vaut null. N'altère aucune donnée LP.
  moveBefore(id, beforeId = null) {
    const index = this.#chains.findIndex(chain => chain.id === id);
    if (index < 0) throw new Error('Chaîne native introuvable.');
    if (beforeId === id) return false;
    if (beforeId !== null && !this.#chains.some(chain => chain.id === beforeId))
      throw new Error('Chaîne cible native introuvable.');
    const result = this.#chains.filter(chain => chain.id !== id);
    const destination = beforeId === null ? result.length : result.findIndex(chain => chain.id === beforeId);
    result.splice(destination, 0, this.#chains[index]);
    if (result.every((chain, position) => chain.id === this.#chains[position].id)) return false;
    this.#chains = result;
    return true;
  }
  reset() {
    this.#chains = this.#snapshot.chains.map(chain => ({ ...chain,
      plugins: chain.plugins.map(plugin => ({ ...plugin })),
      inputs: [...chain.inputs], outputs: [...chain.outputs] }));
  }
  toRack2Copy() {
    const result = rewriteRack2Metadata(this.#source, this.#chains.map((chain, order) => ({
      id: chain.id, name: chain.name, color: chain.color, order
    })));
    // Vérification croisée, sans jamais muter les octets chargés.
    const after = readRack2Project(result);
    if (after.chains.length !== this.#chains.length || after.chains.some((chain, order) =>
      chain.id !== this.#chains[order].id || chain.name !== this.#chains[order].name ||
      chain.color !== this.#chains[order].color)) throw new Error('La copie .rack2 n’a pas passé la vérification finale.');
    return result;
  }
}
